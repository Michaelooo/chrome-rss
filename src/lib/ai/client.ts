import type { ArticleArtifact, Settings } from '@/types';
import { getSettings } from '@/lib/storage/db';

export interface AIProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface AIConfig {
  providers: AIProviderConfig[];
  timeoutMs: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionResult<T = string> {
  content: string;
  provider: AIProviderConfig;
  value: T;
}

export type AIContentValidator<T> = (content: string) => T;

interface AIRequestError extends Error {
  retryable: boolean;
  status?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

function createRequestError(message: string, retryable: boolean, status?: number): AIRequestError {
  return Object.assign(new Error(message), { retryable, status });
}

export function getConfiguredAIProviders(settings: Settings): AIProviderConfig[] {
  const providers: AIProviderConfig[] = [];
  const primary = {
    id: settings.aiPrimaryProviderId || 'primary',
    name: settings.aiPrimaryProviderName || '主服务商',
    endpoint: settings.aiApiEndpoint.trim(),
    apiKey: settings.aiApiKey.trim(),
    model: settings.aiModel.trim(),
  };
  if (primary.endpoint && primary.apiKey && primary.model) providers.push(primary);

  for (const provider of settings.aiFallbackProviders || []) {
    if (!provider.enabled) continue;
    const candidate = {
      id: provider.id,
      name: provider.name.trim(),
      endpoint: provider.endpoint.trim(),
      apiKey: provider.apiKey.trim(),
      model: provider.model.trim(),
    };
    if (candidate.id && candidate.name && candidate.endpoint && candidate.apiKey && candidate.model) {
      providers.push(candidate);
    }
  }
  return providers;
}

export function isArtifactFromConfiguredProvider(
  artifact: Pick<ArticleArtifact, 'aiProviderId' | 'model'>,
  providers: AIProviderConfig[]
): boolean {
  if (artifact.aiProviderId) {
    return providers.some(provider => provider.id === artifact.aiProviderId && provider.model === artifact.model);
  }
  return providers.some(provider => provider.model === artifact.model);
}

export async function getAIConfig(): Promise<AIConfig | null> {
  const settings = await getSettings();
  if (!settings.enableAI) return null;
  const providers = getConfiguredAIProviders(settings);
  if (providers.length === 0) return null;
  return { providers, timeoutMs: DEFAULT_TIMEOUT_MS };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function requestProvider(provider: AIProviderConfig, messages: ChatMessage[], timeoutMs: number): Promise<string> {
  const url = `${provider.endpoint.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0.3,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw createRequestError(
        timedOut ? `${provider.name} 请求超时` : `${provider.name} 网络请求失败`,
        true
      );
    }

    if (!response.ok) {
      throw createRequestError(
        `${provider.name} 请求失败，状态码 ${response.status}`,
        isRetryableStatus(response.status),
        response.status
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw createRequestError(`${provider.name} 返回了无效响应`, true);
    }
    const content = (data as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }> })
      ?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw createRequestError(`${provider.name} 返回了无效响应`, true);
    }
    const finishReason = (data as { choices?: Array<{ finish_reason?: string }> })?.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn(`AI response truncated for provider ${provider.name}`);
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export interface AICompletionSession {
  complete<T = string>(messages: ChatMessage[], validator?: AIContentValidator<T>): Promise<AICompletionResult<T>>;
  getActiveProvider(): AIProviderConfig | undefined;
}

export function createAICompletionSession(
  config: AIConfig,
  preferredProviderId?: string
): AICompletionSession {
  let activeProviderId = preferredProviderId && config.providers.some(provider => provider.id === preferredProviderId)
    ? preferredProviderId
    : undefined;

  return {
    async complete<T = string>(messages: ChatMessage[], validator?: AIContentValidator<T>) {
      const activeIndex = activeProviderId
        ? config.providers.findIndex(provider => provider.id === activeProviderId)
        : -1;
      const ordered = activeIndex >= 0
        ? [...config.providers.slice(activeIndex), ...config.providers.slice(0, activeIndex)]
        : config.providers;
      let lastRetryableError: Error | undefined;

      for (const provider of ordered) {
        try {
          const content = await requestProvider(provider, messages, config.timeoutMs);
          let value: T;
          try {
            value = validator ? validator(content) : content as T;
          } catch {
            throw createRequestError(`${provider.name} 返回内容格式无效`, true);
          }
          activeProviderId = provider.id;
          return { content, provider, value };
        } catch (error) {
          const requestError = error as Partial<AIRequestError>;
          if (!requestError.retryable) throw error;
          lastRetryableError = error instanceof Error ? error : new Error('AI 请求失败');
        }
      }

      throw createRequestError(
        lastRetryableError ? '所有已配置的 AI 服务均暂时不可用' : 'AI 未配置',
        false
      );
    },
    getActiveProvider() {
      return activeProviderId
        ? config.providers.find(provider => provider.id === activeProviderId)
        : undefined;
    },
  };
}

export async function chatCompletion<T = string>(
  config: AIConfig,
  messages: ChatMessage[],
  validator?: AIContentValidator<T>
): Promise<AICompletionResult<T>> {
  return createAICompletionSession(config).complete(messages, validator);
}
