import type {
  ArticleArtifact,
  AttentionAnalysisData,
  BodyTranslationData,
} from '@/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateTitleTranslations(
  value: unknown,
  articleIds: Set<string>
): Array<{ articleId: string; translatedTitle: string }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const articleId = item.articleId;
    const translatedTitle = item.translatedTitle;
    if (
      typeof articleId !== 'string' ||
      typeof translatedTitle !== 'string' ||
      !translatedTitle.trim() ||
      !articleIds.has(articleId) ||
      seen.has(articleId)
    ) return [];
    seen.add(articleId);
    return [{ articleId, translatedTitle: translatedTitle.trim() }];
  });
}

export function validateBodyTranslation(
  value: unknown,
  validBlockIds: Set<string>
): BodyTranslationData['blocks'] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    if (!isRecord(item)) return [];
    const blockId = item.blockId;
    const translatedText = item.translatedText;
    if (
      typeof blockId !== 'string' ||
      typeof translatedText !== 'string' ||
      !validBlockIds.has(blockId) ||
      seen.has(blockId)
    ) return [];
    seen.add(blockId);
    return [{ blockId, translatedText: translatedText.trim() }];
  });
}

const LEVELS = new Set(['high', 'medium', 'low']);
const CATEGORIES = new Set(['conclusion', 'evidence', 'action']);

export function validateAttentionAnalysis(
  value: unknown,
  blockTextMap: Map<string, string>
): AttentionAnalysisData {
  if (!isRecord(value)) throw new Error('AI 阅读分析格式无效');
  const highlights = Array.isArray(value.highlights)
    ? value.highlights.slice(0, 8).flatMap((item, index) => {
        if (!isRecord(item)) return [];
        const blockId = item.blockId;
        const quote = item.quote;
        const importance = item.importance;
        const category = item.category;
        const explanation = item.explanation;
        const blockText = typeof blockId === 'string' ? blockTextMap.get(blockId) : undefined;
        if (
          typeof blockId !== 'string' ||
          !blockText ||
          typeof quote !== 'string' ||
          !quote.trim() ||
          !blockText.includes(quote.trim()) ||
          typeof importance !== 'string' ||
          !LEVELS.has(importance) ||
          typeof category !== 'string' ||
          !CATEGORIES.has(category) ||
          typeof explanation !== 'string'
        ) return [];
        return [{
          id: typeof item.id === 'string' ? item.id : `h${index + 1}`,
          blockId,
          quote: quote.trim(),
          importance: importance as 'high' | 'medium' | 'low',
          category: category as 'conclusion' | 'evidence' | 'action',
          explanation: explanation.trim(),
        }];
      })
    : [];

  const quality = isRecord(value.quality) ? value.quality : {};
  const readingGuide = isRecord(value.readingGuide) ? value.readingGuide : {};
  const validIds = new Set(blockTextMap.keys());
  const filterIds = (candidate: unknown) =>
    Array.isArray(candidate)
      ? candidate.filter((id): id is string => typeof id === 'string' && validIds.has(id))
      : [];

  return {
    overview: typeof value.overview === 'string' ? value.overview.trim() : '',
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
      : [],
    highlights,
    quality: {
      level: typeof quality.level === 'string' && LEVELS.has(quality.level)
        ? quality.level as 'high' | 'medium' | 'low'
        : 'medium',
      evidenceDensity: typeof quality.evidenceDensity === 'string' && LEVELS.has(quality.evidenceDensity)
        ? quality.evidenceDensity as 'high' | 'medium' | 'low'
        : 'medium',
      reasons: Array.isArray(quality.reasons)
        ? quality.reasons.filter((reason): reason is string => typeof reason === 'string').slice(0, 5)
        : [],
    },
    readingGuide: {
      estimatedMinutes: typeof readingGuide.estimatedMinutes === 'number'
        ? Math.max(1, Math.min(120, Math.round(readingGuide.estimatedMinutes)))
        : 1,
      priorityBlockIds: filterIds(readingGuide.priorityBlockIds),
      skippableBlockIds: filterIds(readingGuide.skippableBlockIds),
    },
  };
}

export function isArtifactData<T>(
  artifact: ArticleArtifact | undefined,
  kind: ArticleArtifact['kind']
): artifact is ArticleArtifact & { data: T } {
  return artifact?.kind === kind && artifact.status === 'completed' && artifact.data !== undefined;
}
