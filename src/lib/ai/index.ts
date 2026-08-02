import type {
  ArticleArtifact,
  ArticleSummary,
  AttentionAnalysisData,
  BodyTranslationData,
  Digest,
  PersonalRelevanceData,
  TitleTranslationData,
} from '@/types';
import type {
  AttentionAnalysisResponse,
  BodyTranslationResponse,
  RelevanceResponse,
  TitleTranslationResponse,
} from '@/types/messages';

import { db } from '@/lib/storage/db';

export async function summarizeArticle(payload: { articleId: string }): Promise<{
  summary: ArticleSummary;
  artifact?: ArticleArtifact & { data?: AttentionAnalysisData };
}> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('AI 摘要在当前环境下不可用');
  }
  const response = await chrome.runtime.sendMessage({
    type: 'SUMMARIZE_ARTICLE',
    payload,
  });
  if (!response || !response.success) {
    throw new Error(response?.error || '生成摘要失败');
  }
  return {
    summary: response.summary as ArticleSummary,
    artifact: response.artifact as ArticleArtifact & { data?: AttentionAnalysisData } | undefined,
  };
}


async function sendAIMessage<T extends { success: boolean; error?: string }>(message: unknown): Promise<T> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('AI 功能在当前环境下不可用');
  }
  const response = await chrome.runtime.sendMessage(message) as T;
  if (!response?.success) throw new Error(response?.error || 'AI 请求失败');
  return response;
}

export async function translateArticleTitleWithAI(payload: {
  articleId: string;
  title: string;
  targetLanguage: string;
}): Promise<ArticleArtifact & { data?: TitleTranslationData }> {
  const response = await sendAIMessage<TitleTranslationResponse>({
    type: 'TRANSLATE_TITLES_AI',
    payload: { articles: [{ articleId: payload.articleId, title: payload.title }], targetLanguage: payload.targetLanguage },
  });
  if (!response.artifact) throw new Error('标题翻译结果为空');
  return response.artifact;
}

export async function translateArticleBodyWithAI(payload: {
  articleId: string;
  targetLanguage: string;
  force?: boolean;
}): Promise<ArticleArtifact & { data?: BodyTranslationData }> {
  const response = await sendAIMessage<BodyTranslationResponse>({
    type: 'TRANSLATE_BODY_AI',
    payload,
  });
  if (!response.artifact) throw new Error('正文翻译结果为空');
  return response.artifact;
}

export async function analyzeArticleAttention(payload: {
  articleId: string;
}): Promise<ArticleArtifact & { data?: AttentionAnalysisData }> {
  const response = await sendAIMessage<AttentionAnalysisResponse>({
    type: 'ANALYZE_ATTENTION',
    payload,
  });
  if (!response.artifact) throw new Error('阅读分析结果为空');
  return response.artifact;
}

export async function analyzeArticleRelevance(payload: {
  articleId: string;
  topics: string[];
}): Promise<ArticleArtifact & { data?: PersonalRelevanceData }> {
  const response = await sendAIMessage<RelevanceResponse>({
    type: 'ANALYZE_RELEVANCE',
    payload,
  });
  if (!response.artifact) throw new Error('推荐分析结果为空');
  return response.artifact;
}

export async function generateDigest(): Promise<Digest> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('每日简报在当前环境下不可用');
  }
  const response = await chrome.runtime.sendMessage({
    type: 'GENERATE_DIGEST',
  });
  if (!response || !response.success) {
    throw new Error(response?.error || '生成简报失败');
  }
  return response.digest as Digest;
}

// Direct DB access for non-extension contexts (e.g., background worker)
export async function getDigestFromDB(date: string): Promise<Digest | undefined> {
  const results = await db.digests
    .where('date')
    .equals(date)
    .reverse()
    .sortBy('generatedAt');
  return results[0];
}
