# pi-pstack

[pstack](https://github.com/cursor/plugins/tree/main/pstack) on pi. The skills, playbooks, principles, and role briefs are upstream poteto's. Two things are added here because cursor gave them for free and pi does not: a sticky poteto mode, and a `task` tool that spawns real pi subagents.

## Install

```sh
pi install ./plugins/pstack
```

Or for one run without installing:

```sh
pi -e ./plugins/pstack
```

Then, once:

```text
/skill:setup-pstack
```

That writes `~/.pi/agent/pstack-models.json`, which decides the model per role. Skip it and every role inherits the chat's model.

## Use

```text
/pstack                     toggle poteto mode on/off for this session
/poteto-mode                same thing, if that name is muscle memory
/pstack fix the scroll drift, repro first
/pstack off                 turn it off
/pstack status              where the install lives, budget, role count
```

Mode is sticky: once on, the poteto-mode rules are a system prompt section on every turn, so you never re-select it. It survives `/resume` and session reloads because the state is written to the session branch. To start every session with it on, either launch `pi --pstack` or add:

```json
{ "pstack": { "startOn": true } }
```

to `~/.pi/agent/settings.json`.

`/pstack <task>` needs an interactive or RPC session, because a one-shot `pi -p` run cannot start a turn from a command. For scripts use `pi --pstack "your task"`.

Any skill is also directly runnable: `/skill:how`, `/skill:why`, `/skill:interrogate`, `/skill:unslop`, `/skill:tdd`, `/skill:poteto-help`.

## Subagents

Cursor's `Task` tool becomes `task`:

```text
task({ prompt, agent?, model?, role?, readonly?, cwd?, timeoutSec?, run_in_background? })
```

- `agent: "poteto-agent"` prepends the code-delegate brief, `agent: "comment-sicko"` the comment-review brief. Both live in `roles/`.
- `role` resolves through `pstack-models.json`, so `role: "hardest tasks"` is enough. `model` wins over `role`.
- `readonly: true` restricts the delegate to `read`, `grep`, `find`, `ls`.
- `mode` injects poteto mode into the delegate. It defaults to on for `agent: "poteto-agent"` and off for everything else, so a reviewer skill keeps its own clean context.
- Each call is a headless `pi -p` run in the repo: separate context, separate model, no session file left behind.
- Interactive/RPC calls default to `run_in_background: true`: return a task ID immediately, then deliver the final report and wake the parent automatically. Set it to `false` to wait inside the tool call. One-shot print/JSON sessions always wait so work is not lost when the parent exits.
- Fan out with several `task` calls. `task_status({ task_id? })` lists tasks or returns one task's output; `task_cancel({ task_id })` cancels one, or pass `"all"`. Do not busy-poll; completion is delivered automatically.
- **Esc cancels all active pstack tasks in this interactive session**, including background tasks when the parent is idle. Pi's normal Esc handling still runs. Cancellation reports do not restart the parent.
- `/tasks` lists IDs and states; `/tasks <id>` displays output; `/tasks cancel <id|all>` stops work without needing a model call.
- Quit, reload, and session replacement cancel active tasks. This uses the Pi 1.5.0 session lifecycle API; update Pi before using this adapter.
- Cancellation first gives Pi 750 ms for graceful cleanup, then kills task-owned process groups, including separately grouped tool descendants discovered before shutdown. Process-tree discovery requires `ps`; failures appear in the task report rather than silently claiming full cleanup. Already orphaned/daemonized processes cannot always be attributed to a task.
- States are `running`, `cancelling`, `completed`, `failed`, `cancelled`, and `timed_out`. The registry is session-local; it keeps up to 100 tasks and bounded output (the most recent 60,000 characters per stream). Task IDs are not resumable across reloads. Print-mode Pi may buffer output until completion.
- `task` is registered whether or not the mode is on, so you can delegate from a plain session too.

## Settings

`~/.pi/agent/settings.json`:

```json
{
  "pstack": {
    "startOn": true,
    "inject": "full"
  }
}
```

- `startOn` turns the mode on at every session start.
- `inject: "full"` (default) puts the whole `poteto-mode` SKILL.md in the system prompt each turn, which is what cursor's custom mode does. `"pointer"` injects only the paths and the adapter and tells the model to read the skill once, about 6x fewer tokens in the prompt.

## Layout

```text
extensions/pstack-mode.ts   sticky mode, commands and task tools
extensions/task-manager.ts  task registry, process lifecycle and cancellation
skills/                     ported skills, unchanged apart from frontmatter
roles/                      delegate briefs for the task tool
PORTING.md                  what changed from upstream, and the gaps
```

## Updating from upstream

Run `bash scripts/sync-upstream.sh` from this package directory, then review the upstream diff. The script preserves the pi-specific `setup-pstack` and both adapted role briefs, normalizes skill frontmatter, removes obsolete upstream skills, and records the upstream commit in `.upstream-rev`. Reconcile upstream changes to the preserved files by hand; run `/reload` only after reviewing and installing the update.

Run the offline sync regression check with `python3 scripts/test-sync-upstream.py`.

## Credits

pstack is by Lauren Tan ([poteto](https://x.com/poteto)), MIT licensed. This package only adapts it to pi.

## Lifecycle regression checks

With peer dependencies installed and Node 22.18+ (native TypeScript stripping):

```sh
node --test tests/task-manager.test.ts tests/extension.test.ts
```

Tests use local fake workers, never a model/API. Run outside a sandbox that blocks `ps` to verify descendant cleanup. `tests/tui-fixture.ts` adds `/test-pstack-cancel` for manual Esc verification; load it only in a temporary test profile with `PI_PSTACK_PI_BIN` pointing to `tests/fake-pi.mjs`.
