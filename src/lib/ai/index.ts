import type { ArticleSummary, Digest } from '@/types';

import { db } from '@/lib/storage/db';

export async function summarizeArticle(payload: { articleId: string }): Promise<ArticleSummary> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('AI summarization is unavailable in this environment.');
  }
  const response = await chrome.runtime.sendMessage({
    type: 'SUMMARIZE_ARTICLE',
    payload,
  });
  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to summarize article.');
  }
  return response.summary as ArticleSummary;
}

export async function generateDigest(): Promise<Digest> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('Digest generation is unavailable in this environment.');
  }
  const response = await chrome.runtime.sendMessage({
    type: 'GENERATE_DIGEST',
  });
  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to generate digest.');
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
