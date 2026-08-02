// Core data types

export interface Feed {
  id: string;
  url: string;
  title: string;
  description?: string;
  link?: string;
  favicon?: string;
  folderId?: string;
  sortOrder?: number;
  updateInterval: number; // in minutes
  lastFetchTime: number;
  lastFetchStatus: 'success' | 'error' | 'pending';
  lastFetchError?: string;
  unreadCount: number;
  fullContentFetch?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ArticleSummary {
  text: string;
  tags: string[];
  model: string;
  aiProviderId?: string;
  aiProviderName?: string;
  generatedAt: number;
}

export type ArticleContentSource = 'fullContent' | 'content' | 'description';
export type ArticleBlockType =
  | 'heading'
  | 'paragraph'
  | 'list-item'
  | 'blockquote'
  | 'code'
  | 'caption'
  | 'table-cell';

export interface ArticleDocumentBlock {
  id: string;
  type: ArticleBlockType;
  text: string;
  html: string;
  order: number;
}

export interface ArticleCompleteness {
  level: 'high' | 'medium' | 'low';
  reasons: string[];
  imageCount: number;
  restoredImageCount: number;
}

export interface ArticleDocument {
  articleId: string;
  source: ArticleContentSource;
  canonicalHtml: string;
  blocks: ArticleDocumentBlock[];
  contentHash: string;
  pipelineVersion: number;
  textLength: number;
  completeness: ArticleCompleteness;
  createdAt: number;
  updatedAt: number;
}

export interface TitleTranslationData {
  originalTitle: string;
  translatedTitle: string;
  detectedLanguage?: string;
}

export interface TranslatedArticleBlock {
  blockId: string;
  translatedText: string;
}

export interface BodyTranslationData {
  originalTitle: string;
  translatedTitle: string;
  detectedSourceLanguage?: string;
  blocks: TranslatedArticleBlock[];
  completedBlockIds: string[];
  totalBlocks: number;
}

export interface AttentionHighlight {
  id: string;
  blockId: string;
  quote: string;
  importance: 'high' | 'medium' | 'low';
  category: 'conclusion' | 'evidence' | 'action';
  explanation: string;
}

export interface AttentionAnalysisData {
  overview: string;
  tags: string[];
  highlights: AttentionHighlight[];
  quality: {
    level: 'high' | 'medium' | 'low';
    evidenceDensity: 'high' | 'medium' | 'low';
    reasons: string[];
  };
  readingGuide: {
    estimatedMinutes: number;
    priorityBlockIds: string[];
    skippableBlockIds: string[];
  };
}

export interface PersonalRelevanceData {
  relevance: 'high' | 'medium' | 'low' | 'none';
  matchedTopics: string[];
  recommendationReason: string;
}

export type ArticleArtifactKind =
  | 'title-translation'
  | 'body-translation'
  | 'attention-analysis'
  | 'personal-relevance';

export interface ArticleArtifact {
  id: string;
  articleId: string;
  kind: ArticleArtifactKind;
  contentHash?: string;
  titleHash?: string;
  preferenceHash?: string;
  targetLanguage?: string;
  provider: 'ai' | 'google';
  model: string;
  aiProviderId?: string;
  aiProviderName?: string;
  promptVersion: number;
  status: 'pending' | 'running' | 'partial' | 'completed' | 'failed';
  data?: TitleTranslationData | BodyTranslationData | AttentionAnalysisData | PersonalRelevanceData;
  generatedAt?: number;
  updatedAt: number;
  error?: string;
}

export type ArticleProcessingJobType =
  | 'translate-title'
  | 'translate-body'
  | 'analyze-attention'
  | 'score-relevance';

export interface ArticleProcessingJob {
  id: string;
  articleId: string;
  type: ArticleProcessingJobType;
  artifactId: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  contentHash?: string;
  targetLanguage?: string;
  provider?: 'ai' | 'google';
  aiProviderId?: string;
  aiProviderName?: string;
  model?: string;
  runId?: string;
  nextChunkIndex: number;
  totalChunks: number;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

export interface Article {
  id: string;
  feedId: string;
  title: string;
  link: string;
  description?: string;
  content?: string;
  author?: string;
  pubDate: number;
  guid: string;
  isRead: boolean;
  isStarred: boolean;
  readAt?: number;
  starredAt?: number;
  translations?: Record<string, ArticleTranslation>;
  summary?: ArticleSummary;
  createdAt: number;
  fullContent?: string;
}

export interface Digest {
  id: string;
  date: string;
  items: DigestItem[];
  model: string;
  aiProviderId?: string;
  aiProviderName?: string;
  generatedAt: number;
  fullContent?: string;
  createdAt: number;
}

export interface DigestItem {
  articleId: string;
  title: string;
  summary: string;
  feedTitle: string;
  feedId: string;
  importance: 'high' | 'medium' | 'low';
  link: string;
}

export interface ArticleTranslation {
  contentHtml: string;
  translatedAt: number;
  provider: 'google';
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  order: number;
  isExpanded: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FeedFilter {
  id: string;
  feedId?: string; // if undefined, applies globally
  name: string;
  enabled: boolean;
  conditionOperator: 'AND' | 'OR';
  conditions: FilterCondition[];
  actions: FilterAction[];
  createdAt: number;
  updatedAt: number;
}

export interface FilterCondition {
  id: string;
  field: 'title' | 'content' | 'author' | 'url';
  operator: 'contains' | 'not_contains' | 'equals' | 'matches';
  value: string;
  isRegex: boolean;
}

export interface FilterAction {
  type: 'mark-read' | 'star' | 'delete' | 'add-tag';
  value?: string; // for add-tag, the tag name
}

export interface AIProviderSettings {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export interface Settings {
  language: 'zh' | 'en';
  theme: 'light' | 'dark' | 'auto';
  defaultUpdateInterval: number;
  enableNotifications: boolean;
  maxArticlesPerFeed: number;
  articleRetentionDays: number;
  openLinksInNewTab: boolean;
  markAsReadOnScroll: boolean;
  removeScrollReadInUnreadMode: boolean;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  fontFamily: string;
  contentWidth: 'narrow' | 'standard' | 'wide' | 'xwide';
  compactView: boolean;
  showFeedIcons: boolean;
  enableKeyboardShortcuts: boolean;
  defaultArticleFilter: 'all' | 'unread';
  enableTranslation: boolean;
  translationProvider: 'google';
  translationTargetLanguage: string;
  translationSourceLanguage?: string;
  translationAutoFetch: boolean;
  aiAutoTranslateTitles: boolean;
  aiTitleTranslationBatchLimit: number;
  bodyTranslationProvider: 'ai' | 'google';
  defaultTranslationView: 'original' | 'translated' | 'bilingual';
  enableAI: boolean;
  aiApiEndpoint: string;
  aiApiKey: string;
  aiModel: string;
  aiPrimaryProviderId: string;
  aiPrimaryProviderName: string;
  aiFallbackProviders: AIProviderSettings[];
  aiAutoSummarize: boolean;
  aiAttentionAnalysisEnabled: boolean;
  aiAutoAnalyzeOnOpen: boolean;
  showAttentionHighlights: boolean;
  showArticleQuality: boolean;
  showRecommendationReasons: boolean;
  attentionTopics: string[];
  autoFetchFullContent: boolean;
  articleTitleLines: 1 | 2 | 3;
  articleExcerptLines: 1 | 2 | 3;
}

// RSS Feed types
export interface RSSFeed {
  title: string;
  description?: string;
  link?: string;
  items: RSSItem[];
}

export interface RSSItem {
  title: string;
  link: string;
  description?: string;
  content?: string;
  author?: string;
  pubDate?: string;
  guid?: string;
}

// UI State types
export type ViewMode = 'list' | 'compact' | 'card';
export type SortBy = 'date-desc' | 'date-asc' | 'title' | 'feed';
export type FilterBy = 'all' | 'unread' | 'starred' | 'today';

export interface UIState {
  selectedFeedId?: string;
  selectedFolderId?: string;
  selectedArticleId?: string;
  viewMode: ViewMode;
  sortBy: SortBy;
  filterBy: FilterBy;
  searchQuery: string;
  sidebarWidth: number;
  articleListWidth: number;
  specialView?: 'digest';
}
