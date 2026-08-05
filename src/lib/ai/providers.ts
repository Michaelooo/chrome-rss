import type { AIProviderSettings, Settings } from '@/types';

export function swapPrimaryWithFallback(settings: Settings, providerId: string): Settings {
  if (providerId === settings.aiPrimaryProviderId) return settings;
  const targetIndex = settings.aiFallbackProviders.findIndex(provider => provider.id === providerId && provider.enabled);
  if (targetIndex < 0) return settings;

  const target = settings.aiFallbackProviders[targetIndex];
  const previousPrimary: AIProviderSettings = {
    id: settings.aiPrimaryProviderId,
    name: settings.aiPrimaryProviderName,
    endpoint: settings.aiApiEndpoint,
    apiKey: settings.aiApiKey,
    model: settings.aiModel,
    enabled: true,
  };
  const aiFallbackProviders = [...settings.aiFallbackProviders];
  aiFallbackProviders[targetIndex] = previousPrimary;

  return {
    ...settings,
    aiPrimaryProviderId: target.id,
    aiPrimaryProviderName: target.name,
    aiApiEndpoint: target.endpoint,
    aiApiKey: target.apiKey,
    aiModel: target.model,
    aiFallbackProviders,
  };
}
