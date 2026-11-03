import test from "node:test";
import assert from "node:assert/strict";
import { TaskManager } from "../extensions/task-manager.ts";
import { setTimeout as sleep } from "node:timers/promises";

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!predicate()) { assert.ok(Date.now() < deadline, "condition timed out"); await sleep(10); }
}
function start(manager: TaskManager, code: string, extra = {}) {
  return manager.start({ command: process.execPath, args: ["-e", code], cwd: process.cwd(), label: "fixture", timeoutMs: 5000, ...extra });
}
function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test("completion preserves output and exit failures", async () => {
  const manager = new TaskManager();
  const success = await start(manager, 'console.log("done")').done;
  assert.equal(success.state, "completed"); assert.equal(success.stdout.trim(), "done");
  const failed = await start(manager, 'console.error("bad");process.exit(7)').done;
  assert.equal(failed.state, "failed"); assert.equal(failed.code, 7);
});
test("already aborted task never spawns", async () => {
  const controller = new AbortController(); controller.abort();
  const result = await start(new TaskManager(), 'console.log("must not run")', { signal: controller.signal }).done;
  assert.equal(result.state, "cancelled"); assert.equal(result.stdout, "");
});
test("abort cleans a SIGTERM-resistant delegate and detached tool group", async () => {
  const manager = new TaskManager(); const controller = new AbortController();
  const grandchild = 'process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000)';
  const code = `const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});const c=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{detached:true,stdio:['ignore','pipe','pipe']});c.stdout.once('data',()=>console.log(JSON.stringify([process.pid,c.pid])));setInterval(()=>{},1000)`;
  const task = start(manager, code, { signal: controller.signal });
  let pids: number[] = [];
  try {
    await until(() => task.result.stdout.includes("]"));
    pids = JSON.parse(task.result.stdout.trim());
    const stopped = Date.now(); controller.abort(); task.cancel();
    const result = await task.done;
    assert.equal(result.state, "cancelled"); assert.equal(result.error, undefined);
    assert.ok(Date.now() - stopped < 2500);
    await until(() => pids.every((pid: number) => !alive(pid)));
  } finally { await manager.cancelAll(); for (const pid of pids) { try { process.kill(-pid, "SIGKILL"); } catch {} } }
});
test("timeout has a distinct state and stops the process", async () => {
  const result = await start(new TaskManager(), 'setInterval(()=>{},1000)', { timeoutMs: 100 }).done;
  assert.equal(result.state, "timed_out");
});
test("exit does not hang on inherited output pipes", async () => {
  const descendant = 'setTimeout(()=>process.exit(0),2000)';
  const code = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore',1,2]});c.unref();console.log('done')`;
  const before = Date.now(); const result = await start(new TaskManager(), code).done;
  assert.equal(result.state, "completed"); assert.ok(Date.now() - before < 1500);
});
test("cancel all settles concurrent tasks and keeps their results", async () => {
  const manager = new TaskManager();
  const tasks = Array.from({length: 3}, () => start(manager, 'console.log("ready");setInterval(()=>{},1000)'));
  await until(() => tasks.every(task => task.result.stdout.includes("ready")));
  await manager.cancelAll();
  assert.equal(manager.active().length, 0);
  assert.ok(manager.list().every(task => task.state === "cancelled"));
  manager.clear(); assert.equal(manager.list().length, 0);
});
test("spawn errors settle and output retention is bounded", async () => {
  const manager = new TaskManager();
  const missing = manager.start({command: '/no/such/pstack-test-command', args: [], cwd: process.cwd(), label: 'missing', timeoutMs: 1000});
  assert.equal((await missing.done).state, 'failed');
  const large = await start(manager, 'console.log("x".repeat(150000))').done;
  assert.ok(large.stdout.length < 61000); assert.match(large.stdout, /truncated/);
});
