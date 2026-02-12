interface TranslateArticlePayload {
  articleId: string;
  html: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

interface TranslateArticleResponse {
  translatedText: string;
  detectedSourceLanguage?: string;
}

export async function translateArticleWithGoogle(
  payload: TranslateArticlePayload
): Promise<TranslateArticleResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('Translation is unavailable in this environment.');
  }

  const response = await chrome.runtime.sendMessage({
    type: 'TRANSLATE_ARTICLE',
    payload,
  });

  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to translate article.');
  }

  return {
    translatedText: response.translatedText as string,
    detectedSourceLanguage: response.detectedSourceLanguage as string | undefined,
  };
}
