import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export type TaskState = "running" | "cancelling" | "completed" | "failed" | "cancelled" | "timed_out";
export interface TaskResult {
  id: string;
  label: string;
  state: TaskState;
  started: number;
  ended?: number;
  stdout: string;
  stderr: string;
  code: number | null;
  error?: string;
}
export interface ManagedTask {
  result: TaskResult;
  done: Promise<TaskResult>;
  cancel(reason?: "cancelled" | "timed_out"): void;
}
export interface StartTaskOptions {
  command: string;
  args: string[];
  cwd: string;
  label: string;
  timeoutMs: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}
const OUTPUT_LIMIT = 60_000;
const GRACE_MS = 750;
const PIPE_IDLE_MS = 100;
const PIPE_MAX_MS = 1000;

function append(previous: string, chunk: string): string {
  const text = previous + chunk;
  return text.length > OUTPUT_LIMIT ? `[earlier output truncated]\n${text.slice(-OUTPUT_LIMIT)}` : text;
}

// Pi's bash tool creates separate process groups. Capture descendants before
// terminating Pi, while the parent links still identify this task's processes.
function descendantGroups(root: number): number[] {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid=,pgid="], { encoding: "utf8", timeout: 1000 })
    .trim().split("\n").map(line => line.trim().split(/\s+/).map(Number));
  const owned = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of rows) {
      if (owned.has(ppid) && !owned.has(pid)) { owned.add(pid); changed = true; }
    }
  }
  return [...new Set(rows.filter(([pid, , pgid]) => owned.has(pid) && owned.has(pgid)).map(([, , pgid]) => pgid))];
}
function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try { process.kill(-pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}

export class TaskManager {
  private tasks = new Map<string, ManagedTask>();
  list(): TaskResult[] { return [...this.tasks.values()].map(task => ({ ...task.result })); }
  get(id: string): ManagedTask | undefined { return this.tasks.get(id); }
  active(): ManagedTask[] {
    return [...this.tasks.values()].filter(task => task.result.state === "running" || task.result.state === "cancelling");
  }
  async cancelAll(): Promise<void> {
    const active = this.active();
    for (const task of active) task.cancel();
    await Promise.all(active.map(task => task.done));
  }
  clear(): void {
    if (this.active().length) throw new Error("Cannot clear active tasks");
    this.tasks.clear();
  }
  start(options: StartTaskOptions): ManagedTask {
    for (const [id, task] of this.tasks) {
      if (this.tasks.size < 100) break;
      if (task.result.ended !== undefined) this.tasks.delete(id);
    }
    if (this.tasks.size >= 100) throw new Error("Too many active tasks");
    const result: TaskResult = {
      id: randomUUID(), label: options.label, state: "running", started: Date.now(), stdout: "", stderr: "", code: null,
    };
    let resolve!: (result: TaskResult) => void;
    const done = new Promise<TaskResult>(r => { resolve = r; });
    let stop = (_reason: "cancelled" | "timed_out") => {};
    const task: ManagedTask = { result, done, cancel: (reason = "cancelled") => stop(reason) };
    this.tasks.set(result.id, task);
    if (options.signal?.aborted) {
      result.state = "cancelled";
      result.ended = Date.now();
      resolve(result);
      return task;
    }
    if (process.platform === "win32") {
      result.state = "failed";
      result.error = "pstack task process cleanup currently requires macOS or Linux";
      result.ended = Date.now();
      resolve(result);
      return task;
    }
    const child = spawn(options.command, options.args, {
      cwd: options.cwd, env: options.env ?? process.env, detached: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    let exited = false;
    let stopping: "cancelled" | "timed_out" | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    let pipeIdle: ReturnType<typeof setTimeout> | undefined;
    let pipeMax: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => task.cancel();
    const finish = () => {
      if (settled) return;
      settled = true;
      for (const timer of [timeout, escalation, pipeIdle, pipeMax]) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      child.stdout?.destroy();
      child.stderr?.destroy();
      result.state = stopping ?? (result.code === 0 && !result.error ? "completed" : "failed");
      result.ended = Date.now();
      resolve(result);
    };
    const cleanupError = (error: unknown) => {
      result.error = `Process cleanup incomplete: ${String(error)}`;
    };
    stop = reason => {
      if (settled || stopping) return;
      stopping = reason;
      result.state = "cancelling";
      clearTimeout(timeout);
      const groups = new Set<number>();
      if (child.pid) {
        groups.add(child.pid);
        try { for (const group of descendantGroups(child.pid)) groups.add(group); }
        catch (error) { cleanupError(error); }
        // Give Pi's own SIGTERM handler a chance to clean its tracked tools.
        try { signalGroup(child.pid, "SIGTERM"); } catch (error) { cleanupError(error); }
      }
      escalation = setTimeout(() => {
        if (child.pid && !exited) {
          try { for (const group of descendantGroups(child.pid)) groups.add(group); }
          catch (error) { cleanupError(error); }
        }
        for (const group of groups) {
          try { signalGroup(group, "SIGSTOP"); } catch (error) { cleanupError(error); }
          try { signalGroup(group, "SIGKILL"); } catch (error) { cleanupError(error); }
        }
        finish();
      }, GRACE_MS);
    };
    const drain = () => {
      if (!exited || stopping || settled) return;
      clearTimeout(pipeIdle);
      pipeIdle = setTimeout(finish, PIPE_IDLE_MS);
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { result.stdout = append(result.stdout, chunk); drain(); });
    child.stderr?.on("data", (chunk: string) => { result.stderr = append(result.stderr, chunk); drain(); });
    child.once("error", error => { result.error = error.message; if (!stopping) finish(); });
    child.once("exit", (code, signal) => {
      exited = true;
      result.code = code;
      if (signal && !stopping) result.error = `Exited on ${signal}`;
      if (!stopping) { pipeMax = setTimeout(finish, PIPE_MAX_MS); drain(); }
    });
    child.once("close", () => { if (!stopping) finish(); });
    timeout = setTimeout(() => task.cancel("timed_out"), options.timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    return task;
  }
}
