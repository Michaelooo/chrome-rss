import type {
  ArticleArtifact,
  AttentionAnalysisData,
  BodyTranslationData,
  TitleTranslationData,
} from '@/types';
import { db } from '@/lib/storage/db';

export interface ArticlePresentation {
  title?: TitleTranslationData;
  attention?: AttentionAnalysisData;
}

export async function getArticlePresentations(
  articleIds: string[]
): Promise<Map<string, ArticlePresentation>> {
  const result = new Map<string, ArticlePresentation>();
  if (articleIds.length === 0) return result;

  const artifacts = await db.articleArtifacts.where('articleId').anyOf(articleIds).toArray();
  const titleSources = new Map<string, 'title' | 'body'>();
  for (const artifact of artifacts) {
    if (artifact.status !== 'completed' || !artifact.data) continue;
    const current = result.get(artifact.articleId) || {};
    if (artifact.kind === 'body-translation') {
      const data = artifact.data as BodyTranslationData;
      current.title = {
        originalTitle: data.originalTitle,
        translatedTitle: data.translatedTitle,
        detectedLanguage: data.detectedSourceLanguage,
      };
      titleSources.set(artifact.articleId, 'body');
    } else if (artifact.kind === 'title-translation' && titleSources.get(artifact.articleId) !== 'body') {
      current.title = artifact.data as TitleTranslationData;
      titleSources.set(artifact.articleId, 'title');
    } else if (artifact.kind === 'attention-analysis') {
      current.attention = artifact.data as AttentionAnalysisData;
    }
    result.set(artifact.articleId, current);
  }
  return result;
}

export function getArtifactData<T>(
  artifact: ArticleArtifact | undefined,
  kind: ArticleArtifact['kind']
): T | undefined {
  if (artifact?.kind !== kind || artifact.status !== 'completed') return undefined;
  return artifact.data as T | undefined;
}
