import { describe, expect, it } from 'vitest';
import type { Settings } from '@/types';
import { swapPrimaryWithFallback } from './providers';

const settings = {
  aiPrimaryProviderId: 'primary',
  aiPrimaryProviderName: 'Primary',
  aiApiEndpoint: 'https://primary.test/v1',
  aiApiKey: 'primary-key',
  aiModel: 'model-primary',
  aiFallbackProviders: [
    { id: 'a', name: 'A', endpoint: 'https://a.test/v1', apiKey: 'a-key', model: 'model-a', enabled: true },
    { id: 'b', name: 'B', endpoint: 'https://b.test/v1', apiKey: 'b-key', model: 'model-b', enabled: true },
    { id: 'c', name: 'C', endpoint: 'https://c.test/v1', apiKey: 'c-key', model: 'model-c', enabled: false },
  ],
} as Settings;

describe('swapPrimaryWithFallback', () => {
  it('swaps complete provider configurations at the same fallback position', () => {
    const result = swapPrimaryWithFallback(settings, 'b');

    expect(result.aiPrimaryProviderId).toBe('b');
    expect(result.aiPrimaryProviderName).toBe('B');
    expect(result.aiApiEndpoint).toBe('https://b.test/v1');
    expect(result.aiApiKey).toBe('b-key');
    expect(result.aiModel).toBe('model-b');
    expect(result.aiFallbackProviders).toEqual([
      settings.aiFallbackProviders[0],
      {
        id: 'primary',
        name: 'Primary',
        endpoint: 'https://primary.test/v1',
        apiKey: 'primary-key',
        model: 'model-primary',
        enabled: true,
      },
      settings.aiFallbackProviders[2],
    ]);
    expect(settings.aiPrimaryProviderId).toBe('primary');
    expect(settings.aiFallbackProviders[1].id).toBe('b');
  });

  it('does nothing for primary, unknown, or disabled providers', () => {
    expect(swapPrimaryWithFallback(settings, 'primary')).toBe(settings);
    expect(swapPrimaryWithFallback(settings, 'missing')).toBe(settings);
    expect(swapPrimaryWithFallback(settings, 'c')).toBe(settings);
  });
});
