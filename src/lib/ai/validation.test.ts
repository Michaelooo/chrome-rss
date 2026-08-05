// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateAttentionAnalysis, validateBodyTranslation, validateTitleTranslations } from './validation';

describe('AI response validation', () => {
  it('maps translated titles by article id and drops invalid duplicates', () => {
    const result = validateTitleTranslations([
      { articleId: 'a2', translatedTitle: '标题二' },
      { articleId: 'a1', translatedTitle: '标题一' },
      { articleId: 'a1', translatedTitle: '重复' },
      { articleId: 'unknown', translatedTitle: '未知' },
    ], new Set(['a1', 'a2']));
    expect(result).toEqual([
      { articleId: 'a2', translatedTitle: '标题二' },
      { articleId: 'a1', translatedTitle: '标题一' },
    ]);
  });

  it('drops body translation blocks that were not requested', () => {
    expect(validateBodyTranslation([
      { blockId: 'b1', translatedText: '一' },
      { blockId: 'b3', translatedText: '三' },
    ], new Set(['b1', 'b2']))).toEqual([
      { blockId: 'b1', translatedText: '一' },
    ]);
  });

  it('only keeps highlights with exact quotes in existing blocks', () => {
    const data = validateAttentionAnalysis({
      overview: 'overview',
      tags: ['tag'],
      highlights: [
        { id: 'h1', blockId: 'b1', quote: 'exact quote', importance: 'high', category: 'evidence', explanation: 'reason' },
        { id: 'h2', blockId: 'b1', quote: 'invented', importance: 'high', category: 'evidence', explanation: 'reason' },
      ],
      quality: { level: 'high', evidenceDensity: 'medium', reasons: ['data'] },
      readingGuide: { estimatedMinutes: 5, priorityBlockIds: ['b1', 'bad'], skippableBlockIds: [] },
    }, new Map([['b1', 'contains exact quote here']]));

    expect(data.highlights).toHaveLength(1);
    expect(data.readingGuide.priorityBlockIds).toEqual(['b1']);
  });
});
