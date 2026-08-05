// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chatCompletion,
  createAICompletionSession,
  getConfiguredAIProviders,
  isArtifactFromConfiguredProvider,
  type AIConfig,
} from './client';
import type { Settings } from '@/types';

const providers = [
  { id: 'primary', name: 'Primary', endpoint: 'https://primary.test/v1/', apiKey: 'primary-secret', model: 'model-a' },
  { id: 'backup', name: 'Backup', endpoint: 'https://backup.test/v1', apiKey: 'backup-secret', model: 'model-b' },
];
const config: AIConfig = { providers, timeoutMs: 50 };
const messages = [{ role: 'user' as const, content: 'hello' }];

function response(content = 'OK', status = 200) {
  return new Response(
    status === 200 ? JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) : '',
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

afterEach(() => vi.restoreAllMocks());

describe('AI provider failover', () => {
  it('stops after the primary provider succeeds', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response());
    const result = await chatCompletion(config, messages);
    expect(result.provider.id).toBe('primary');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://primary.test/v1/chat/completions');
  });

  it.each([408, 429, 500, 503])('falls back after HTTP %s', async status => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response('', status))
      .mockResolvedValueOnce(response('backup'));
    const result = await chatCompletion(config, messages);
    expect(result.provider.id).toBe('backup');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 422])('does not fall back after HTTP %s', async status => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response('', status));
    await expect(chatCompletion(config, messages)).rejects.toThrow(String(status));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back after a network error or invalid response', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(response('backup'));
    expect((await chatCompletion(config, messages)).provider.id).toBe('backup');

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockResolvedValueOnce(response('backup'));
    expect((await chatCompletion(config, messages)).provider.id).toBe('backup');
  });

  it('falls back when feature validation rejects content', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response('bad'))
      .mockResolvedValueOnce(response('{"ok":true}'));
    const result = await chatCompletion(config, messages, content => {
      const value = JSON.parse(content) as { ok?: boolean };
      if (!value.ok) throw new Error('invalid');
      return value;
    });
    expect(result.provider.id).toBe('backup');
    expect(result.value.ok).toBe(true);
  });

  it('keeps the successful provider sticky and can fail over again', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response('', 503))
      .mockResolvedValueOnce(response('backup-1'))
      .mockResolvedValueOnce(response('backup-2'))
      .mockResolvedValueOnce(response('', 429))
      .mockResolvedValueOnce(response('primary'));
    const session = createAICompletionSession(config);
    expect((await session.complete(messages)).provider.id).toBe('backup');
    expect((await session.complete(messages)).provider.id).toBe('backup');
    expect((await session.complete(messages)).provider.id).toBe('primary');
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      'https://primary.test/v1/chat/completions',
      'https://backup.test/v1/chat/completions',
      'https://backup.test/v1/chat/completions',
      'https://backup.test/v1/chat/completions',
      'https://primary.test/v1/chat/completions',
    ]);
  });

  it('does not expose configured keys when every provider fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network'));
    let error: Error | undefined;
    try {
      await chatCompletion(config, messages);
    } catch (value) {
      error = value as Error;
    }
    expect(error?.message).not.toContain('primary-secret');
    expect(error?.message).not.toContain('backup-secret');
  });
});

describe('AI provider settings helpers', () => {
  const settings = {
    enableAI: true,
    aiPrimaryProviderId: 'primary',
    aiPrimaryProviderName: 'Primary',
    aiApiEndpoint: 'https://primary.test/v1',
    aiApiKey: 'key',
    aiModel: 'model-a',
    aiFallbackProviders: [
      { id: 'disabled', name: 'Disabled', endpoint: 'https://disabled.test/v1', apiKey: 'key', model: 'x', enabled: false },
      { id: 'backup', name: 'Backup', endpoint: 'https://backup.test/v1', apiKey: 'key', model: 'model-b', enabled: true },
    ],
  } as Settings;

  it('builds primary followed by enabled fallbacks', () => {
    expect(getConfiguredAIProviders(settings).map(provider => provider.id)).toEqual(['primary', 'backup']);
  });

  it('matches new artifacts by provider id and model, and legacy artifacts by model', () => {
    const configured = getConfiguredAIProviders(settings);
    expect(isArtifactFromConfiguredProvider({ aiProviderId: 'backup', model: 'model-b' }, configured)).toBe(true);
    expect(isArtifactFromConfiguredProvider({ aiProviderId: 'backup', model: 'old' }, configured)).toBe(false);
    expect(isArtifactFromConfiguredProvider({ model: 'model-b' }, configured)).toBe(true);
  });
});
