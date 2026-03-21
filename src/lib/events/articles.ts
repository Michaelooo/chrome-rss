import type { Article } from '@/types';

const ARTICLE_UPDATED_EVENT = 'rss-article-updated';

export interface ArticleUpdatedDetail {
  id: string;
  updates: Partial<Article>;
  previous?: Partial<Article>;
  source?: 'scroll' | 'click';
}

export function emitArticleUpdated(
  id: string,
  updates: Partial<Article>,
  previous?: Partial<Article>,
  source?: 'scroll' | 'click'
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const detail: ArticleUpdatedDetail = { id, updates, previous, source };
  window.dispatchEvent(new CustomEvent<ArticleUpdatedDetail>(ARTICLE_UPDATED_EVENT, { detail }));
}

export function subscribeArticleUpdated(
  callback: (detail: ArticleUpdatedDetail) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => void 0;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ArticleUpdatedDetail>;
    callback(customEvent.detail);
  };

  window.addEventListener(ARTICLE_UPDATED_EVENT, handler as EventListener);

  return () => {
    window.removeEventListener(ARTICLE_UPDATED_EVENT, handler as EventListener);
  };
}
