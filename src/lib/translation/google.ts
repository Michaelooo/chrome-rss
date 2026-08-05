import type { ArticleArtifact, BodyTranslationData } from '@/types';

interface TranslateArticlePayload {
  articleId: string;
  targetLanguage: string;
  sourceLanguage?: string;
  force?: boolean;
}

interface TranslateArticleResponse {
  artifact?: ArticleArtifact & { data?: BodyTranslationData };
  success: boolean;
  error?: string;
}

export async function translateArticleWithGoogle(
  payload: TranslateArticlePayload
): Promise<ArticleArtifact & { data?: BodyTranslationData }> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('Translation is unavailable in this environment.');
  }

  const response = await chrome.runtime.sendMessage({
    type: 'TRANSLATE_BODY_GOOGLE',
    payload,
  }) as TranslateArticleResponse;

  if (!response?.success || !response.artifact) {
    throw new Error(response?.error || 'Failed to translate article.');
  }

  return response.artifact;
}
