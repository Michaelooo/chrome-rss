import { getSettings } from '@/lib/storage/db';

export interface AIConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function getAIConfig(): Promise<AIConfig | null> {
  const settings = await getSettings();
  if (!settings.enableAI || !settings.aiApiKey) {
    return null;
  }
  return {
    endpoint: settings.aiApiEndpoint || 'https://api.openai.com/v1',
    apiKey: settings.aiApiKey,
    model: settings.aiModel || 'gpt-4o-2024-11-20',
  };
}

export async function chatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
): Promise<string> {
  const url = `${config.endpoint.replace(/\/+$/, '')}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API 请求失败，状态码 ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('AI API 返回了意外的响应格式');
  }
  const finishReason = data?.choices?.[0]?.finish_reason;
  if (finishReason === 'length') {
    console.warn('AI response truncated (finish_reason=length). Consider increasing max_tokens or reducing input.');
  }
  return content;
}
