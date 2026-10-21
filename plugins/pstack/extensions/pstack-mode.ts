/**
 * pstack for pi.
 *
 * Ports cursor/plugins `pstack` to pi: the skills travel as ordinary pi skills,
 * and this extension adds what cursor's "custom mode" + Task subagents gave the
 * agent for free.
 *
 *   /pstack              toggle poteto mode on/off for this session (sticky)
 *   /pstack off          turn it off
 *   /pstack status       report state
 *   /pstack <task>       turn it on, then send <task>
 *   pi --pstack          start every session with it on
 *   settings: { "pstack": { "startOn": true } }
 *
 * While the mode is on, the poteto-mode SKILL.md plus a pi harness adapter is a
 * system prompt section, so it applies to every turn without being re-selected.
 *
 * The `task` tool replaces cursor's Task subagent: it runs a headless `pi -p`
 * child in the current repo, optionally with a pstack role brief and model.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const MODE_ENTRY = "pstack-mode";
const SECTION_TAG = "pstack-mode";
const MODELS_FILE = "pstack-models.json";
const DEFAULT_TASK_TIMEOUT_SEC = 1800;
const MAX_RESULT_CHARS = 30_000;

interface PstackModels {
	budget?: string;
	roles?: Record<string, string>;
}

interface TaskParams {
	prompt: string;
	agent?: string;
	model?: string;
	role?: string;
	cwd?: string;
	readonly?: boolean;
	tools?: string;
	timeoutSec?: number;
	mode?: boolean;
}

function readText(file: string): string | undefined {
	try {
		return fs.readFileSync(file, "utf8");
	} catch {
		return undefined;
	}
}

function stripFrontmatter(markdown: string): string {
	const match = /^---\n[\s\S]*?\n---\n/.exec(markdown);
	return match ? markdown.slice(match[0].length) : markdown;
}

function thisFile(): string | undefined {
	try {
		return fileURLToPath(import.meta.url);
	} catch {
		// Transformed to CJS by jiti.
		try {
			return (globalThis as { __filename?: string }).__filename;
		} catch {
			return undefined;
		}
	}
}

/** Candidate install roots, most specific first. */
function candidateRoots(): string[] {
	const roots: string[] = [];
	if (process.env.PI_PSTACK_ROOT) roots.push(process.env.PI_PSTACK_ROOT);

	const dirname = (globalThis as { __dirname?: string }).__dirname;
	if (typeof dirname === "string") roots.push(path.resolve(dirname, ".."));
	const file = thisFile();
	if (file) roots.push(path.resolve(path.dirname(file), ".."));

	const home = os.homedir();
	roots.push(path.join(home, ".pi", "agent", "npm", "node_modules", "pi-pstack"));
	try {
		const gitRoot = path.join(home, ".pi", "agent", "git");
		for (const entry of fs.readdirSync(gitRoot)) {
			roots.push(path.join(gitRoot, entry, "pi-pstack"));
			roots.push(path.join(gitRoot, entry));
		}
	} catch {
		// No git installs.
	}
	return roots;
}

function isRoot(dir: string | undefined): dir is string {
	return !!dir && fs.existsSync(path.join(dir, "skills", "poteto-mode", "SKILL.md"));
}

function modelsPath(): string {
	return path.join(os.homedir(), ".pi", "agent", MODELS_FILE);
}

function readModels(): PstackModels {
	const raw = readText(modelsPath());
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") return {};
		const record = parsed as Record<string, unknown>;
		const roles: Record<string, string> = {};
		const rawRoles = record.roles;
		if (rawRoles && typeof rawRoles === "object") {
			for (const [key, value] of Object.entries(rawRoles as Record<string, unknown>)) {
				if (typeof value === "string" && value.trim() && value.trim() !== "inherit-parent" && value.trim() !== "auto") {
					roles[key] = value.trim();
				}
			}
		}
		return { budget: typeof record.budget === "string" ? record.budget : undefined, roles };
	} catch {
		return {};
	}
}

function resolveRoleModel(role: string | undefined, models: PstackModels): string | undefined {
	if (!role) return undefined;
	const roles = models.roles ?? {};
	const wanted = role.trim().toLowerCase();
	for (const [key, value] of Object.entries(roles)) {
		if (key.toLowerCase() === wanted) return value;
	}
	return undefined;
}

function harnessAdapter(root: string, models: PstackModels): string {
	const skillsRoot = path.join(root, "skills");
	const rolesRoot = path.join(root, "roles");
	const roleLines = Object.entries(models.roles ?? {}).map(([role, model]) => `- ${role}: \`${model}\``);
	const roleBlock = roleLines.length
		? `Roles from \`~/.pi/agent/${MODELS_FILE}\` (pass \`role\` to \`task\`; \`model\` overrides it):\n${roleLines.join("\n")}`
		: `No role config yet. \`task\` inherits this chat's model unless you pass \`model\`. Run \`/skill:setup-pstack\` to write \`~/.pi/agent/${MODELS_FILE}\`.`;

	return `## pi harness adapter

This skill was written for cursor. On pi these substitutions are already wired up. Apply them wherever the text says otherwise.

- **Subagents.** Cursor's \`Task\` tool is the \`task\` tool here. Call \`task({ prompt, agent, model, role, readonly })\`. Each call runs an independent headless pi child in the repo, so it really is a fresh delegate with its own context.
- **Parallelism.** Cursor's \`run_in_background: true\` does not exist. Fire several \`task\` calls in one assistant message and pi runs them concurrently. That is also how \`swarm\`, \`arena\`, \`interrogate\`, and \`reflect\` fan out.
- **Resuming a delegate.** Sessions are not kept between \`task\` calls, so every delegate is fresh. Follow the fresh-subagent rule in the skill: consolidate the brief instead of resuming.
- **Agent roles.** \`agent\` names a brief in \`${rolesRoot}\` and prepends it to the prompt: \`poteto-agent\` for code delegates, \`comment-sicko\` for \`/skill:no-comments\`. Omit \`agent\` for skill-specific reviewers that prescribe their own prompt.
- **Asking the operator.** There is no \`AskQuestion\`. Ask in plain text, one question, or use \`ctx.ui\`-backed slash commands when a real choice is needed. The never-block-on-the-human rule still applies.
- **Skill invocation.** Skills are files, not model-invocable tools. Read \`${skillsRoot}/<name>/SKILL.md\` with the read tool when this text says to run a skill named \`<name>\`. A path like \`playbooks/bug-fix.md\` or \`references/x.md\` resolves inside the skill directory that names it, so \`bug-fix\` is \`${skillsRoot}/poteto-mode/playbooks/bug-fix.md\`.
- **Cursor-only skills.** \`deslop\`, \`control-cli\`, and \`control-ui\` ship in \`cursor-team-kit\`, which is not installed here. Skip those steps unless a similarly named skill exists in this session, and keep the no-comments and benchmark-checklist steps.
- **Model roles.** ${roleBlock}`;
}

function modePointer(root: string, models: PstackModels): string {
	const modeSkill = path.join(root, "skills", "poteto-mode", "SKILL.md");
	return `Poteto mode (pstack) is ON for this session. It stays on across turns until the operator runs \`/pstack off\`.

Read \`${modeSkill}\` in full now, before answering this request, and follow it for every later turn without being asked again. Skills root: \`${path.join(root, "skills")}\`. Roles: \`${path.join(root, "roles")}\`.

${harnessAdapter(root, models)}`;
}

function modeSection(root: string, models: PstackModels): string {
	const modeSkill = path.join(root, "skills", "poteto-mode", "SKILL.md");
	const body = stripFrontmatter(readText(modeSkill) ?? "poteto-mode SKILL.md is missing from this install.");
	return `Poteto mode (pstack) is ON for this session. It stays on across turns until the operator runs \`/pstack off\`. It applies to every request, and when a playbook does not match you answer normally without dropping the engineering rules.

Skills root: \`${path.join(root, "skills")}\`. Mode skill: \`${modeSkill}\`. Roles: \`${path.join(root, "roles")}\`.

${harnessAdapter(root, models)}

## Operating rules (poteto-mode SKILL.md)

${body.trim()}`;
}

function piCommand(): { command: string; leading: string[] } {
	const configured = process.env.PI_PSTACK_PI_BIN;
	if (configured) return { command: configured, leading: [] };
	return { command: "pi", leading: [] };
}

function truncate(text: string): string {
	if (text.length <= MAX_RESULT_CHARS) return text;
	const file = path.join(os.tmpdir(), `pstack-task-${Date.now()}.md`);
	try {
		fs.writeFileSync(file, text, "utf8");
	} catch {
		// Fall back to the inline slice only.
	}
	return `${text.slice(0, MAX_RESULT_CHARS)}\n\n[truncated ${text.length - MAX_RESULT_CHARS} chars. Full delegate output: ${file}]`;
}

export default function pstackExtension(pi: ExtensionAPI) {
	let modeOn = false;
	let cachedRoot: string | undefined;

	const isChild = process.env.PI_PSTACK_CHILD === "1";

	pi.registerFlag("pstack", {
		description: "Start with poteto mode (pstack) on for this session",
		type: "boolean",
		default: false,
	});

	function resolveRoot(): string | undefined {
		if (isRoot(cachedRoot)) return cachedRoot;
		for (const candidate of candidateRoots()) {
			if (isRoot(candidate)) {
				cachedRoot = candidate;
				return candidate;
			}
		}
		for (const command of pi.getCommands()) {
			const source = command.sourceInfo?.path;
			if (typeof source === "string" && source.replace(/\\/g, "/").endsWith("/poteto-mode/SKILL.md")) {
				const root = path.resolve(path.dirname(source), "..", "..");
				if (isRoot(root)) {
					cachedRoot = root;
					return root;
				}
			}
		}
		return undefined;
	}

	function paint(ctx: ExtensionContext): void {
		ctx.ui.setStatus("pstack", modeOn ? `${ctx.ui.theme.fg("success", "●")} pstack` : undefined);
	}

	function setMode(on: boolean, ctx: ExtensionContext): void {
		modeOn = on;
		pi.appendEntry(MODE_ENTRY, { on });
		paint(ctx);
	}

	pi.on("session_start", async (_event, ctx) => {
		let restored: boolean | undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === MODE_ENTRY) {
				const data = entry.data as { on?: unknown } | undefined;
				if (data && typeof data.on === "boolean") restored = data.on;
			}
		}

		const settings = pi.getSettings() as { pstack?: { startOn?: unknown } };
		const startOn = settings.pstack?.startOn === true;

		if (restored === undefined) {
			modeOn = pi.getFlag("pstack") === true || startOn;
			if (modeOn) pi.appendEntry(MODE_ENTRY, { on: true });
		} else {
			modeOn = restored;
		}
		paint(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		if (!modeOn) return;
		const root = resolveRoot();
		const settings = pi.getSettings() as { pstack?: { inject?: unknown } };
		const pointer = settings.pstack?.inject === "pointer";
		if (!root) {
			event.systemPromptOptions.sections[SECTION_TAG] =
				"Poteto mode is ON but the pstack install could not be located. Tell the operator to run `/pstack status` and to reinstall the pi-pstack package.";
			return;
		}
		const models = readModels();
		event.systemPromptOptions.sections[SECTION_TAG] = pointer ? modePointer(root, models) : modeSection(root, models);
	});

	const activate = async (args: string, ctx: ExtensionCommandContext) => {
		const raw = args.trim();
		const word = raw.toLowerCase();

		if (word === "") {
			setMode(!modeOn, ctx);
			ctx.ui.notify(`pstack: ${modeOn ? "on" : "off"}`, "info");
			return;
		}

		if (word === "off") {
			setMode(false, ctx);
			ctx.ui.notify("pstack off", "info");
			return;
		}

		if (word === "status" || word === "on") {
			if (word !== "status" && !modeOn) setMode(true, ctx);
			const root = resolveRoot();
			const models = readModels();
			const roles = Object.keys(models.roles ?? {}).length;
			ctx.ui.notify(
				[
					`pstack: ${modeOn ? "on" : "off"}`,
					`install: ${root ?? "not found"}`,
					`budget: ${models.budget ?? "unset"}${roles ? `, ${roles} role(s)` : ""}`,
				].join("\n"),
				modeOn ? "info" : "warning",
			);
			return;
		}

		if (!modeOn) setMode(true, ctx);
		if (ctx.mode === "tui" || ctx.mode === "rpc") {
			pi.sendUserMessage(raw);
			return;
		}
		ctx.ui.notify(`pstack on. One-shot runs cannot start a turn from a command; use: pi --pstack ${JSON.stringify(raw)}`, "info");
	};

	const completions = (prefix: string) => {
		const options = ["on", "off", "status"];
		const filtered = options.filter((option) => option.startsWith(prefix.trim().toLowerCase()));
		return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
	};

	pi.registerCommand("pstack", {
		description: "Toggle poteto mode (pstack) on/off for this session; pass a task to start it",
		getArgumentCompletions: completions,
		handler: activate,
	});

	pi.registerCommand("poteto-mode", {
		description: "Alias for /pstack: toggle sticky poteto mode on/off, or pass a task to start it",
		getArgumentCompletions: completions,
		handler: activate,
	});

	if (!isChild) {
		pi.registerTool({
			name: "task",
			label: "Task subagent",
			description:
				"Spawn a fresh headless pi subagent to do one job and return its report. This is pstack's replacement for cursor's Task tool: each call gets its own context, its own model, and writes no shared session. Call it several times in one message to fan out in parallel (swarm, arena, interrogate, reflect). Give it a complete brief, file pointers instead of pasted context, and a report format.",
			promptSnippet: "Task({ prompt, agent?, model?, role?, readonly? }) runs a fresh pi subagent",
			promptGuidelines: [
				"Under poteto mode, independent work that does not need this chat's context goes to `task`, several calls per message to run them in parallel.",
				"Every `task` brief is self-contained: the goal, the file pointers, what to prove, and the report shape. The delegate cannot see this conversation.",
			],
			parameters: Type.Object({
				prompt: Type.String({ description: "Complete, self-contained brief for the delegate." }),
				agent: Type.Optional(
					Type.String({ description: "Role brief to prepend: poteto-agent (code delegates) or comment-sicko." }),
				),
				model: Type.Optional(Type.String({ description: "Model pattern, e.g. openai-codex/gpt-6.1-sol:xhigh." })),
				role: Type.Optional(Type.String({ description: "pstack role key from ~/.pi/agent/pstack-models.json." })),
				cwd: Type.Optional(Type.String({ description: "Working directory for the delegate. Defaults to this session's cwd." })),
				readonly: Type.Optional(Type.Boolean({ description: "Restrict the delegate to read, grep, find, ls." })),
				tools: Type.Optional(Type.String({ description: "Explicit comma-separated tool allowlist." })),
				timeoutSec: Type.Optional(Type.Number({ description: "Wall-clock limit. Default 1800." })),
				mode: Type.Optional(
					Type.Boolean({
						description:
							"Inject poteto mode into the delegate. Default true for agent poteto-agent, false otherwise, so skill-specific reviewers keep a clean context.",
					}),
				),
			}),
			executionMode: "parallel",
			execute: async (toolCallId, params, signal, onUpdate, ctx) => {
				const root = resolveRoot();
				const models = readModels();
				const model = params.model?.trim() || resolveRoleModel(params.role, models);
				const cwd = params.cwd ? path.resolve(ctx.cwd, params.cwd) : ctx.cwd;
				const timeoutMs = Math.max(30, params.timeoutSec ?? DEFAULT_TASK_TIMEOUT_SEC) * 1000;

				const wantMode = params.mode ?? params.agent === "poteto-agent";
				let brief = params.prompt.trim();
				if (params.agent) {
					const roleFile = root ? path.join(root, "roles", `${params.agent}.md`) : undefined;
					const roleText = roleFile ? readText(roleFile) : undefined;
					if (roleText) {
						brief = `${stripFrontmatter(roleText).trim()}\n\n---\n\n${brief}`;
					} else {
						brief = `Operate as the pstack role \`${params.agent}\`.${root ? "" : " The pstack install was not located; work from the brief alone."}\n\n---\n\n${brief}`;
					}
				}
				if (root && wantMode) {
					const modeSkill = path.join(root, "skills", "poteto-mode", "SKILL.md");
					brief = `Read \`${modeSkill}\` in full before any work, including its Principles index. Any \`<name>\` skill named in a playbook lives at \`${path.join(root, "skills", "<name>", "SKILL.md")}\`.\n\n${brief}`;
				}

				const args = ["-p", brief, "--no-session"];
				if (wantMode) args.push("--pstack");
				if (model) args.push("--model", model);
				if (params.readonly) args.push("--tools", "read,grep,find,ls");
				else if (params.tools) args.push("--tools", params.tools);

				const { command } = piCommand();
				const started = Date.now();
				onUpdate?.({
					content: [{ type: "text", text: `task → ${model ?? "session default"} (${params.agent ?? "delegate"})` }],
					details: undefined,
				});

				const run = await new Promise<{ code: number | null; stdout: string; stderr: string; error?: string }>((resolve) => {
					const child = spawn(command, args, {
						cwd,
						env: { ...process.env, PI_PSTACK_CHILD: "1" },
						stdio: ["ignore", "pipe", "pipe"],
					});
					let stdout = "";
					let stderr = "";
					let settled = false;
					const finish = (result: { code: number | null; stdout: string; stderr: string; error?: string }) => {
						if (settled) return;
						settled = true;
						clearTimeout(timer);
						resolve(result);
					};
					const timer = setTimeout(() => {
						child.kill("SIGKILL");
						finish({ code: null, stdout, stderr, error: `timed out after ${timeoutMs / 1000}s` });
					}, timeoutMs);
					const onAbort = () => {
						child.kill("SIGTERM");
						setTimeout(() => child.kill("SIGKILL"), 5000).unref?.();
					};
					signal?.addEventListener("abort", onAbort, { once: true });

					child.stdout?.on("data", (chunk: Buffer) => {
						stdout += chunk.toString();
					});
					child.stderr?.on("data", (chunk: Buffer) => {
						stderr += chunk.toString();
					});
					child.on("error", (error: Error) => finish({ code: null, stdout, stderr, error: error.message }));
					child.on("close", (code) => {
						signal?.removeEventListener("abort", onAbort);
						finish({ code, stdout, stderr });
					});
				});

				const seconds = ((Date.now() - started) / 1000).toFixed(1);
				const body = run.stdout.trim() || run.stderr.trim() || "(no output)";
				const header = `task ${params.agent ?? "delegate"}${model ? ` · ${model}` : ""} · ${seconds}s · ${run.error ?? `exit ${run.code}`}`;
				const text = truncate(`${header}\n\n${body}`);

				return {
					content: [{ type: "text", text }],
					details: { toolCallId, model, role: params.role, agent: params.agent, cwd, seconds, exitCode: run.code, error: run.error },
					isError: run.error !== undefined || run.code !== 0,
				};
			},
		});
	}
}
