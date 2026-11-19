import { getAgentDir, SettingsManager, type ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function register(pi: ExtensionAPI) {
  pi.on('model_select', async ({ model, source }, ctx) => {
    if (!ctx.hasUI || (source !== 'set' && source !== 'cycle')) {
      return;
    }

    const settings = SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: false });
    const { defaultProvider, defaultModel } = settings.getGlobalSettings();
    if (defaultProvider === model.provider && defaultModel === model.id) {
      return;
    }

    settings.setDefaultModelAndProvider(model.provider, model.id);
    await settings.flush();

    const [failure] = settings.drainErrors();
    if (failure) {
      ctx.ui.notify(`Remember model: ${failure.error.message}`, 'warning');
    }
  });
}
