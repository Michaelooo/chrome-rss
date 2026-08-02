// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { normalizeAIProviderSettings, normalizeSettings } from './db';

describe('AI provider settings normalization', () => {
  it('preserves legacy primary settings without creating fallbacks', () => {
    const settings = normalizeSettings({
      aiApiEndpoint: ' https://saturday.test/v1 ',
      aiApiKey: ' secret ',
      aiModel: ' model ',
    });
    expect(settings.aiApiEndpoint).toBe('https://saturday.test/v1');
    expect(settings.aiApiKey).toBe('secret');
    expect(settings.aiModel).toBe('model');
    expect(settings.aiFallbackProviders).toEqual([]);
  });

  it('keeps valid order, removes incomplete entries, and makes ids unique', () => {
    const providers = normalizeAIProviderSettings([
      { id: 'same', name: 'One', endpoint: 'https://one.test/v1', apiKey: 'one', model: 'a', enabled: true },
      { id: 'same', name: 'Two', endpoint: 'https://two.test/v1', apiKey: 'two', model: 'b', enabled: true },
      { id: 'bad', name: '', endpoint: '', apiKey: '', model: '', enabled: true },
    ]);
    expect(providers.map(provider => provider.name)).toEqual(['One', 'Two']);
    expect(providers.map(provider => provider.id)).toEqual(['same', 'same-2']);
  });
});
