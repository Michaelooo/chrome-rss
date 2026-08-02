import type {
  ArticleArtifact,
  ArticleDocument,
  AttentionAnalysisData,
  BodyTranslationData,
  TitleTranslationData,
} from '@/types';

export type AIBenchmarkTask = 'summary' | 'translation';

export interface AIBenchmarkCaseResult {
  providerId: string;
  providerName: string;
  model: string;
  task: AIBenchmarkTask;
  sampleId: string;
  attempt: number;
  latencyMs: number;
  strictJsonPass: boolean;
  productionParsePass: boolean;
  structureScore: number;
  qualityScore: number;
  preview: string;
}

export interface AIBenchmarkCaseResponse {
  success: boolean;
  result?: AIBenchmarkCaseResult;
  error?: string;
}
export type AIRequest =
  | { type: 'TRANSLATE_TITLES_AI'; payload: { articles: Array<{ articleId: string; title: string }>; targetLanguage: string } }
  | { type: 'TRANSLATE_BODY_AI'; payload: { articleId: string; targetLanguage: string; force?: boolean } }
  | { type: 'TRANSLATE_BODY_GOOGLE'; payload: { articleId: string; targetLanguage: string; sourceLanguage?: string; force?: boolean } }
  | { type: 'ANALYZE_ATTENTION'; payload: { articleId: string } }
  | { type: 'RUN_AI_BENCHMARK_CASE'; payload: { runId: string; providerId: string; task: AIBenchmarkTask; sampleId: string; attempt: number } }
  | { type: 'CANCEL_AI_BENCHMARK'; payload: { runId: string } };
export interface AIArtifactResponse<T> {
  success: boolean;
  artifact?: ArticleArtifact & { data?: T };
  document?: ArticleDocument;
  error?: string;
}

export type TitleTranslationResponse = AIArtifactResponse<TitleTranslationData>;
export type BodyTranslationResponse = AIArtifactResponse<BodyTranslationData>;
export type AttentionAnalysisResponse = AIArtifactResponse<AttentionAnalysisData>;
