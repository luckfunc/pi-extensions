---
name: setup-pstack
description: Configure which pi models pstack uses per role and at what reasoning budget. Detects your available models and writes ~/.pi/agent/pstack-models.json, which the `task` tool and poteto mode read. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack (pi)

Write `~/.pi/agent/pstack-models.json`, the config that sets pstack's model per role on pi. The `pstack-mode` extension reads it on every run and passes the matching model to the `task` tool. a role with no entry inherits the chat's model.

## Steps

### 1. Detect available models

Run `pi --list-models` and keep its table. Each usable value is `<provider>/<model>` from the first two columns, optionally with a `:thinking` suffix. The `thinking` column says whether that model accepts a reasoning level at all. If the command fails, ask the operator to paste the rows they can use. Never write a slug you have not seen in that output. The values `inherit-parent` and `auto` are always valid: they mean this role runs on the parent chat model, so the entry is omitted.

### 2. Load current state

Read `~/.pi/agent/pstack-models.json` if it exists. Treat its `budget` and its `roles` map as the current choices. Otherwise start from the default role table in step 5.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** One plain-text question, with the four labels and the current budget when one is recorded. With no config, say that `large` is the default.

- `unlimited`, max reasoning
- `large`, xhigh reasoning
- `medium`, high reasoning
- `small`, medium reasoning

**(b) Apply it.** `unlimited`, `large`, `medium`, and `small` set the effort suffix of every role to `max`, `xhigh`, `high`, or `medium`. If a model has no such level, use that model's highest level at or below the target, and say so when you report. `inherit-parent` and `auto` stay as they are.

**(c) Show the roles and confirm.** One line per role with the resolved model, and a note on any role whose model is not in the detected set.

### 4. Validate

Every model written must appear in the `pi --list-models` output, including its `:thinking` suffix support. Drop and report any line that does not.

### 5. Write the config

Overwrite the whole file so re-runs stay idempotent. Shape:

```json
{
  "budget": "large",
  "roles": {
    "feature, refactoring": "openai-codex/gpt-6.1-sol:high",
    "bug-fix": "openai-codex/gpt-6.1-sol:high",
    "perf-issue": "openai-codex/gpt-6.1-sol:high",
    "hillclimb": "openai-codex/gpt-6.1-sol:high",
    "judgment and prose": "openai-codex/gpt-6.1-sol:xhigh",
    "hardest tasks": "openai-codex/gpt-6.1-sol:xhigh",
    "how explorer": "openai-codex/gpt-6.1-sol:high",
    "how explainer": "openai-codex/gpt-6.1-sol:high",
    "why investigators": "openai-codex/gpt-6.1-sol:high",
    "why synthesizer": "openai-codex/gpt-6.1-sol:high",
    "reflect tooling": "openai-codex/gpt-6.1-sol:high",
    "reflect judgment, divergent, synthesizer": "openai-codex/gpt-6.1-sol:xhigh",
    "arena runners": "openai-codex/gpt-6.1-sol:high",
    "arena cross-judge pool": "openai-codex/gpt-6.1-sol:high",
    "swarm workers": "openai-codex/gpt-6.1-sol:high",
    "architect runners": "openai-codex/gpt-6.1-sol:high",
    "interrogate reviewers": "openai-codex/gpt-6.1-sol:high"
  }
}
```

Role keys are matched case-insensitively and exactly as written, so keep the pstack names. `swarm workers` is the default for every worker unless a race assigns a model per arm. Panel roles (arena runners, architect runners, interrogate reviewers, arena cross-judge pool) may hold a comma-separated list in the upstream cursor config; on pi, list only models you detected, and expect the model to pass one of them per `task` call.

### 6. Confirm

Tell the operator the file was written, that poteto mode reads it live so no reload is needed, and that re-running `/skill:setup-pstack` updates it. `task({ role: "..." })` resolves a role directly, so the model does not have to remember slugs.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, read `skills/create-verification-skill/SKILL.md` and follow it. On no, move on without pushing.
