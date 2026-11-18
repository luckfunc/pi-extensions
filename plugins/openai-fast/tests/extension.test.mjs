import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import register from '../extensions/openai-fast.ts';

const codexModel = { provider: 'openai-codex', api: 'openai-codex-responses', id: 'gpt-6-astra' };
const request = { model: codexModel.id, input: [] };

function useCatalog(t, models) {
  const home = mkdtempSync(join(tmpdir(), 'pi-fast-'));
  const previousHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = home;
  t.after(() => {
    if (previousHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
  });
  if (models !== undefined) {
    writeFileSync(join(home, 'models_cache.json'), JSON.stringify({ models }));
  }
}

function session(model = codexModel) {
  const hooks = new Map();
  const commands = new Map();
  const footer = new Map();
  const notices = [];
  const ctx = {
    model,
    ui: {
      setStatus(key, text) {
        if (text === undefined) {
          footer.delete(key);
        } else {
          footer.set(key, text);
        }
      },
      notify: (text, level) => notices.push({ text, level }),
    },
  };
  register({
    on: (name, handler) => hooks.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
  });
  const emit = (name, event = {}) => hooks.get(name)?.(event, ctx);
  emit('session_start');
  return {
    notices,
    badge: () => [...footer.values()].join(' '),
    fast: (args = '') => commands.get('fast').handler(args, ctx),
    payload: (payload = request) => emit('before_provider_request', { payload }) ?? payload,
    ultrafast: () => commands.get('ultrafast').handler('', ctx),
    select(model) {
      ctx.model = model;
      emit('model_select', { model });
    },
    start: () => emit('session_start'),
  };
}

test('/fast toggles the badge and the priority tier for the current session', async () => {
  const pi = session();
  assert.equal(pi.badge(), '');
  assert.deepEqual(pi.payload(), request);

  await pi.fast();
  assert.equal(pi.badge(), '⚡ Fast');
  assert.deepEqual(pi.payload(), { ...request, service_tier: 'priority' });
  const otherRequest = { ...request, model: 'other-model' };
  assert.deepEqual(pi.payload(otherRequest), otherRequest);
  assert.deepEqual(request, { model: codexModel.id, input: [] });

  await pi.fast();
  assert.equal(pi.badge(), '');
  assert.deepEqual(pi.payload(), request);
});

test('unknown arguments do not accidentally turn Fast on', async () => {
  const pi = session();
  await pi.fast('off');
  assert.equal(pi.notices.at(-1).level, 'warning');
  assert.equal(pi.badge(), '');
  assert.deepEqual(pi.payload(), request);
});

test('a new OpenAI Codex model can enable Fast without a model allowlist', async () => {
  const model = { ...codexModel, id: 'new-codex-model' };
  const pi = session(model);
  await pi.fast();
  assert.equal(pi.badge(), '⚡ Fast');
  assert.equal(pi.payload({ model: model.id }).service_tier, 'priority');
});

test('rejects a different provider or incompatible API', async () => {
  for (const model of [
    { ...codexModel, provider: 'custom' },
    { ...codexModel, api: 'openai-completions' },
  ]) {
    const pi = session(model);
    await pi.fast();
    assert.equal(pi.notices.at(-1).level, 'warning');
    assert.equal(pi.badge(), '');
    const payload = { model: model.id, input: [] };
    assert.deepEqual(pi.payload(payload), payload);
  }
});

test('switching to an unsupported model or starting a session disarms Fast', async () => {
  const pi = session();
  await pi.fast();
  const next = { ...codexModel, id: 'gpt-6.1-sol' };
  pi.select(next);
  assert.equal(pi.badge(), '⚡ Fast');
  assert.equal(pi.payload({ model: next.id }).service_tier, 'priority');

  pi.select({ ...codexModel, provider: 'custom' });
  assert.equal(pi.badge(), '');
  pi.select(codexModel);
  assert.deepEqual(pi.payload(), request);

  await pi.fast();
  pi.start();
  assert.equal(pi.badge(), '');
  assert.deepEqual(pi.payload(), request);
});

test('/ultrafast replaces Fast with a single lightning badge and toggles back off', async (t) => {
  const model = { ...codexModel, id: 'new-ultrafast-model' };
  useCatalog(t, [{ slug: model.id, service_tiers: [{ id: 'ultrafast' }] }]);
  const pi = session(model);
  const payload = { model: model.id };
  await pi.fast();
  await pi.ultrafast();
  assert.equal(pi.badge(), '⚡ Ultrafast');
  assert.deepEqual(pi.payload(payload), { ...payload, service_tier: 'ultrafast' });

  await pi.ultrafast();
  assert.equal(pi.badge(), '');
  assert.deepEqual(pi.payload(payload), payload);
});

test('Ultrafast turns off when switching to a Codex model without that tier', async (t) => {
  useCatalog(t, [{ slug: codexModel.id, service_tiers: [{ id: 'ultrafast' }] }]);
  const pi = session();
  await pi.ultrafast();
  pi.select({ ...codexModel, id: 'fast-only-model' });
  assert.equal(pi.badge(), '');
  pi.select(codexModel);
  assert.deepEqual(pi.payload(), request);
});

test('missing capability data blocks Ultrafast without disabling ordinary Fast', async (t) => {
  useCatalog(t);
  const pi = session();
  await pi.fast();
  await pi.ultrafast();
  assert.equal(pi.notices.at(-1).level, 'warning');
  assert.equal(pi.badge(), '⚡ Fast');
  assert.equal(pi.payload().service_tier, 'priority');
});
