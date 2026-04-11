import type { ArticleSummary, Digest } from '@/types';

import { db } from '@/lib/storage/db';

export async function summarizeArticle(payload: { articleId: string }): Promise<ArticleSummary> {
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
  return response.summary as ArticleSummary;
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
