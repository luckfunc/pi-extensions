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
task({ prompt, agent?, model?, role?, readonly?, cwd?, timeoutSec? })
```

- `agent: "poteto-agent"` prepends the code-delegate brief, `agent: "comment-sicko"` the comment-review brief. Both live in `roles/`.
- `role` resolves through `pstack-models.json`, so `role: "hardest tasks"` is enough. `model` wins over `role`.
- `readonly: true` restricts the delegate to `read`, `grep`, `find`, `ls`.
- `mode` injects poteto mode into the delegate. It defaults to on for `agent: "poteto-agent"` and off for everything else, so a reviewer skill keeps its own clean context.
- Each call is a headless `pi -p` run in the repo: separate context, separate model, no session file left behind.
- Fan out by putting several `task` calls in one message. pi runs them in parallel, which is what `swarm`, `arena`, `interrogate`, and `reflect` need.
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
extensions/pstack-mode.ts   sticky mode, /pstack, task tool
skills/                     54 ported skills, unchanged apart from frontmatter
roles/                      delegate briefs for the task tool
PORTING.md                  what changed from upstream, and the gaps
```

## Updating from upstream

Review the upstream diff and copy only the changed files. Keep the pi-specific `setup-pstack` and role briefs. Record the upstream commit in `.upstream-rev`, then run `/reload`.

Do not run `scripts/sync-upstream.sh` without fixing its cleanup first. It deletes the skills directory before skipping `setup-pstack`, so that pi-specific skill is lost. It also overwrites the adapted role briefs.

## Credits

pstack is by Lauren Tan ([poteto](https://x.com/poteto)), MIT licensed. This package only adapts it to pi.
