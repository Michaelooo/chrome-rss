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
    endpoint: settings.aiApiEndpoint || 'https://aigc.sankuai.com/v1/openai/native/',
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
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API request failed with status ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('AI API returned unexpected response format');
  }
  return content;
}
