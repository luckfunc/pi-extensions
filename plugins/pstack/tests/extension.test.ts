import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import pstack from "../extensions/pstack-mode.ts";

async function fixture() {
  process.env.PI_PSTACK_PI_BIN = fileURLToPath(new URL("./fake-pi.mjs", import.meta.url));
  const events = new Map(); const tools = new Map(); const commands = new Map(); const messages: any[] = [];
  let input: any;
  const statuses = new Map();
  const pi: any = {
    on: (name: string, handler: any) => events.set(name, handler),
    registerFlag() {}, registerCommand: (name: string, definition: any) => commands.set(name, definition),
    registerTool: (definition: any) => tools.set(definition.name, definition),
    getCommands: () => [], getSettings: () => ({}), getFlag: () => false,
    appendEntry() {}, sendMessage: (...args: any[]) => messages.push(args),
  };
  const ctx: any = {
    mode: "tui", cwd: process.cwd(), sessionManager: { getBranch: () => [] },
    ui: { onTerminalInput: (handler: any) => { input = handler; return () => { input = undefined; }; },
      setStatus: (key: string, value: any) => statuses.set(key, value), notify() {}, theme: { fg: (_: any, text: string) => text } },
  };
  pstack(pi); await events.get("session_start")({}, ctx);
  return { events, tools, commands, messages, ctx, statuses, input: (key: string) => input?.(key),
    run: (params: any, signal?: AbortSignal) => tools.get("task").execute("call", params, signal, undefined, ctx),
    close: () => events.get("session_shutdown")({}, ctx) };
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { assert.ok(Date.now() < deadline, "condition timed out"); await sleep(10); }
}
test("background returns promptly and completion wakes the parent once", async () => {
  const f = await fixture();
  try {
    const before = Date.now();
    const started = await f.run({prompt:'setTimeout(()=>console.log("report"),400)'});
    assert.ok(Date.now()-before < 300); assert.ok(started.details.taskId);
    await until(() => f.messages.length === 1);
    assert.match(f.messages[0][0].content, /report/);
    assert.equal(f.messages[0][1].triggerTurn, true);
    assert.equal(f.statuses.get("pstack-tasks"), undefined);
  } finally { await f.close(); }
});
test("Esc cancels background work without consuming Pi's native key or restarting", async () => {
  const f = await fixture();
  try {
    const started = await f.run({prompt:'console.log("ready");setInterval(()=>{},1000)'});
    assert.equal(f.input("\u001b"), undefined);
    await until(() => f.messages.length === 1);
    assert.equal(f.messages[0][0].details.state, "cancelled");
    assert.equal(f.messages[0][1].triggerTurn, false);
    const status = await f.tools.get("task_status").execute("status", {task_id:started.details.taskId});
    assert.equal(status.details.state, "cancelled");
  } finally { await f.close(); }
});
test("foreground respects the tool AbortSignal", async () => {
  const f = await fixture(); const controller = new AbortController();
  try {
    const waiting = f.run({prompt:'setInterval(()=>{},1000)',run_in_background:false}, controller.signal);
    await sleep(100); controller.abort();
    const result = await waiting;
    assert.equal(result.details.state, "cancelled"); assert.equal(f.messages.length, 0);
  } finally { await f.close(); }
});
test("shutdown cancels background tasks and suppresses delivery to the new session", async () => {
  const f = await fixture();
  await f.run({prompt:'setInterval(()=>{},1000)'});
  await f.close(); assert.equal(f.messages.length, 0);
});
test("task_cancel and /tasks use the same task registry", async () => {
  const f = await fixture();
  try {
    const first = await f.run({prompt:'setInterval(()=>{},1000)'});
    const result = await f.tools.get("task_cancel").execute("cancel",{task_id:first.details.taskId},undefined,undefined,f.ctx);
    assert.equal(result.details.state,"cancelled");
    await f.run({prompt:'setInterval(()=>{},1000)'});
    await f.commands.get("tasks").handler("cancel all",f.ctx);
    const resultList = await f.tools.get("task_status").execute("list",{});
    assert.ok(JSON.parse(resultList.content[0].text).every((t:any)=>t.state === 'cancelled'));
  } finally { await f.close(); }
});

test("one-shot mode waits even when background is requested", async () => {
  const f = await fixture(); f.ctx.mode = "print";
  try {
    const result = await f.run({prompt:'console.log("one shot")', run_in_background:true});
    assert.equal(result.details.state, "completed"); assert.equal(f.messages.length, 0);
  } finally { await f.close(); }
});
