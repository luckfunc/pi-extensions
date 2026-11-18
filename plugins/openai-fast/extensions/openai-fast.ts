import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

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

export default function register(pi: ExtensionAPI) {
  let activeTier: FastTier | undefined;

  function setTier(ctx: ExtensionContext, tier?: FastTier) {
    activeTier = tier;
    if (tier === undefined) {
      ctx.ui.setStatus('openai-fast', undefined);
    } else {
      ctx.ui.setStatus('openai-fast', statusByTier[tier]);
    }
  }

  function toggleTier(ctx: ExtensionContext, tier: FastTier) {
    if (!isCodexModel(ctx.model)) {
      ctx.ui.notify('Fast modes are only available for OpenAI Codex models.', 'warning');
      return;
    }

    if (activeTier === tier) {
      setTier(ctx);
      ctx.ui.notify(`${statusByTier[tier]} disabled.`, 'info');
      return;
    }

    if (tier === 'ultrafast' && !supportsUltrafast(ctx.model.id)) {
      ctx.ui.notify('Ultrafast is not advertised for this model in the local Codex catalog.', 'warning');
      return;
    }

    setTier(ctx, tier);
    ctx.ui.notify(`${statusByTier[tier]} enabled.`, 'info');
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

  pi.on('session_start', (_event, ctx) => {
    setTier(ctx);
  });

  pi.on('model_select', ({ model }, ctx) => {
    if (!isCodexModel(model) || (activeTier === 'ultrafast' && !supportsUltrafast(model.id))) {
      setTier(ctx);
    }
  });

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
