import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';

const statusByTier = {
  priority: '⚡ Fast',
  ultrafast: '⚡ Ultrafast',
} as const;

type FastTier = keyof typeof statusByTier;

function isCodexModel(
  model: ExtensionContext['model'],
): model is NonNullable<ExtensionContext['model']> {
  return model?.provider === 'openai-codex' && model.api === 'openai-codex-responses';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFastTier(value: unknown): value is FastTier {
  return value === 'priority' || value === 'ultrafast';
}

function readCodexCatalog(): unknown {
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  try {
    return JSON.parse(readFileSync(join(codexHome, 'models_cache.json'), 'utf8'));
  } catch {
    // An unavailable or invalid catalog cannot establish Ultrafast support.
    return undefined;
  }
}

function supportsUltrafast(modelId: string): boolean {
  const catalog = readCodexCatalog();
  if (!isRecord(catalog) || !Array.isArray(catalog.models)) {
    return false;
  }

  const model: unknown = catalog.models.find((entry: unknown) => {
    return isRecord(entry) && entry.slug === modelId;
  });
  if (!isRecord(model) || !Array.isArray(model.service_tiers)) {
    return false;
  }

  return model.service_tiers.some((tier: unknown) => {
    return isRecord(tier) && tier.id === 'ultrafast';
  });
}

function readTier(stateFile: string): FastTier | undefined {
  try {
    const state: unknown = JSON.parse(readFileSync(stateFile, 'utf8'));
    return isRecord(state) && isFastTier(state.tier) ? state.tier : undefined;
  } catch {
    return undefined;
  }
}

function saveTier(stateFile: string, tier: FastTier | undefined) {
  if (tier === undefined) {
    rmSync(stateFile, { force: true });
    return;
  }

  const temporaryFile = `${stateFile}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryFile, `${JSON.stringify({ tier })}\n`, { mode: 0o600 });
    renameSync(temporaryFile, stateFile);
  } catch (error) {
    try { rmSync(temporaryFile, { force: true }); } catch { /* Keep the original error. */ }
    throw error;
  }
}

export default function register(pi: ExtensionAPI) {
  const stateFile = join(getAgentDir(), 'openai-fast.json');
  let activeTier: FastTier | undefined;

  function applySavedTier(ctx: ExtensionContext, model = ctx.model) {
    const tier = ctx.hasUI ? readTier(stateFile) : undefined;
    activeTier = isCodexModel(model) && (tier !== 'ultrafast' || supportsUltrafast(model.id))
      ? tier
      : undefined;
    ctx.ui.setStatus('openai-fast', activeTier && statusByTier[activeTier]);
  }

  function toggleTier(ctx: ExtensionContext, tier: FastTier) {
    const nextTier = readTier(stateFile) === tier ? undefined : tier;
    if (nextTier !== undefined) {
      if (!isCodexModel(ctx.model)) {
        ctx.ui.notify('Fast modes are only available for OpenAI Codex models.', 'warning');
        return;
      }
      if (nextTier === 'ultrafast' && !supportsUltrafast(ctx.model.id)) {
        ctx.ui.notify('Ultrafast is not advertised for this model in the local Codex catalog.', 'warning');
        return;
      }
    }

    try {
      saveTier(stateFile, nextTier);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Could not save Fast mode: ${message}`, 'warning');
      return;
    }
    applySavedTier(ctx);
    ctx.ui.notify(`${statusByTier[tier]} ${nextTier ? 'enabled' : 'disabled'}.`, 'info');
  }

  function registerToggle(name: string, tier: FastTier, description: string) {
    pi.registerCommand(name, {
      description,
      handler: async (args, ctx) => {
        if (args.trim()) {
          ctx.ui.notify(`Usage: /${name}`, 'warning');
          return;
        }
        toggleTier(ctx, tier);
      },
    });
  }

  registerToggle('fast', 'priority', 'Toggle Fast mode for OpenAI Codex');
  registerToggle('ultrafast', 'ultrafast', 'Toggle Ultrafast mode for supported OpenAI Codex models');

  pi.on('session_start', (_event, ctx) => applySavedTier(ctx));
  pi.on('model_select', ({ model }, ctx) => applySavedTier(ctx, model));

  pi.on('before_provider_request', ({ payload }, ctx) => {
    if (activeTier === undefined || !isCodexModel(ctx.model)) {
      return;
    }
    if (!isRecord(payload) || payload.model !== ctx.model.id) {
      return;
    }

    return { ...payload, service_tier: activeTier };
  });
}
