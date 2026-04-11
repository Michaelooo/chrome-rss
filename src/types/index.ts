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
  generatedAt: number;
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
  enableAI: boolean;
  aiApiEndpoint: string;
  aiApiKey: string;
  aiModel: string;
  aiAutoSummarize: boolean;
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
