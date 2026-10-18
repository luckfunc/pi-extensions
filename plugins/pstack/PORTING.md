# Porting notes

Upstream: `cursor/plugins` → `pstack`, commit `101b274dd991f694e1f7024be2157e5f3adf07de` (2026-10-16), pstack `0.15.25`.

## What changed

| Area | Upstream (cursor) | Here (pi) |
|---|---|---|
| Plugin manifest | `.cursor-plugin/plugin.json` + `plugin.json` | `package.json` with the `pi` key (`extensions`, `skills`) |
| Skills | `skills/*/SKILL.md` | Same files and layout, so every relative `playbooks/`, `references/`, `scripts/` path still resolves |
| Skill frontmatter | `name: Poteto Mode`, `name: Make Bot UI`, `icon`, `color` | `name` rewritten to the directory name (skill commands and the portability spec need lowercase kebab case); `icon` and `color` dropped because pi has no such fields |
| Command name | `/poteto-mode` attaches the skill to one message, or becomes a custom mode with option+enter | `/pstack` (and the `/poteto-mode` alias) makes poteto mode sticky for the session. One command, no modifier keys |
| Always-on mode | cursor custom mode (option+enter) keeps the skill in context every turn | `extensions/pstack-mode.ts` injects `skills/poteto-mode/SKILL.md` as a `pstack-mode` system prompt section on every turn while the mode is on. State is a session entry, so it survives resume and reload |
| `Task` tool | cursor built-in, with `subagent_type`, `model`, `run_in_background` | `task` tool runs a headless `pi -p` child per call. `agent` maps to `subagent_type`, `model` to `--model`, `role` to `pstack-models.json`. Parallelism comes from issuing several calls in one message instead of `run_in_background` |
| Agent definitions | `agents/*.md` with `is_background` | `roles/*.md`, prepended to the delegate prompt by the `task` tool |
| `AskQuestion` | cursor built-in | Plain text question. The never-block-on-the-human rule still applies |
| Model config | `~/.cursor/rules/pstack-models.mdc` | `~/.pi/agent/pstack-models.json`, read by the extension and by `task` |
| `/setup-pstack` | Cursor-specific, writes the mdc rule | Rewritten for pi: detects models with `pi --list-models`, writes the JSON config. This is the one skill whose body was replaced; it is excluded from `scripts/sync-upstream.sh` |
| `deslop`, `control-cli`, `control-ui` | shipped by the separate `cursor-team-kit` plugin | Not installed. The injected harness adapter tells the model to skip those steps |

Everything else, meaning every principle, playbook, review rubric, and prompt template, is byte-identical to upstream apart from the frontmatter normalization. Cursor references inside those files are handled at runtime by the adapter block the extension prepends to the injected mode section, not by editing 54 skills.

## Known gaps

- **No background delegates.** `run_in_background: true` has no equivalent. Long fan-outs work, but a delegate cannot outlive the turn that spawned it. `autopilot-*` and `orchestrate` playbooks assume that, so they degrade.
- **No resumable delegates.** Each `task` call is a fresh `pi -p` run with `--no-session`. Follow the skill's fresh-subagent rule.
- **Automations not ported.** `automations/benny/` (bug triage and reproduce pipelines) depends on cursor automations, and the `docs/` guide is left upstream. Read them at the upstream link when you need them.
- **Skill discovery is command-only.** Upstream marks nearly every skill `disable-model-invocation: true`, and that is preserved, so `/skill:<name>` and explicit reads by path are the entry points. `/pstack` compensates for the mode skill; the rest are situational anyway.

## Syncing

```sh
./scripts/sync-upstream.sh            # main
./scripts/sync-upstream.sh v0.16.0    # a tag or branch
```

The script re-copies `skills/` (minus `setup-pstack`) and `roles/`, re-applies the frontmatter rules, and records the upstream commit in `.upstream-rev`. Re-read `skills/setup-pstack/SKILL.md` and the role briefs after a sync, since those are hand-maintained.
