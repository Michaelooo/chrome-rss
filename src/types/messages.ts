import type {
  ArticleArtifact,
  ArticleDocument,
  AttentionAnalysisData,
  BodyTranslationData,
  PersonalRelevanceData,
  TitleTranslationData,
} from '@/types';

export type AIRequest =
  | { type: 'TRANSLATE_TITLES_AI'; payload: { articles: Array<{ articleId: string; title: string }>; targetLanguage: string } }
  | { type: 'TRANSLATE_BODY_AI'; payload: { articleId: string; targetLanguage: string; force?: boolean } }
  | { type: 'TRANSLATE_BODY_GOOGLE'; payload: { articleId: string; targetLanguage: string; sourceLanguage?: string; force?: boolean } }
  | { type: 'ANALYZE_ATTENTION'; payload: { articleId: string } }
  | { type: 'ANALYZE_RELEVANCE'; payload: { articleId: string; topics: string[] } };

export interface AIArtifactResponse<T> {
  success: boolean;
  artifact?: ArticleArtifact & { data?: T };
  document?: ArticleDocument;
  error?: string;
}

export type TitleTranslationResponse = AIArtifactResponse<TitleTranslationData>;
export type BodyTranslationResponse = AIArtifactResponse<BodyTranslationData>;
export type AttentionAnalysisResponse = AIArtifactResponse<AttentionAnalysisData>;
export type RelevanceResponse = AIArtifactResponse<PersonalRelevanceData>;
