import type { Article, FeedFilter, FilterCondition } from '@/types';

type ArticleLike = Pick<Article, 'title' | 'link' | 'description' | 'content' | 'author'> & {
  isRead?: boolean;
  isStarred?: boolean;
  readAt?: number;
  starredAt?: number;
};

function getArticleField(article: ArticleLike, field: FilterCondition['field']): string {
  switch (field) {
    case 'title': return article.title || '';
    case 'content': return article.content || article.description || '';
    case 'author': return article.author || '';
    case 'url': return article.link || '';
  }
}

function matchCondition(article: ArticleLike, condition: FilterCondition): boolean {
  const text = getArticleField(article, condition.field);

  if (condition.isRegex) {
    try {
      const regex = new RegExp(condition.value, 'i');
      const matches = regex.test(text);
      return condition.operator === 'not_contains' ? !matches : matches;
    } catch {
      return false;
    }
  }

  const lowerText = text.toLowerCase();
  const lowerValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'contains': return lowerText.includes(lowerValue);
    case 'not_contains': return !lowerText.includes(lowerValue);
    case 'equals': return lowerText === lowerValue;
    case 'matches': return lowerText.includes(lowerValue);
    default: return false;
  }
}

export function matchFilter(article: ArticleLike, filter: FeedFilter): boolean {
  if (!filter.enabled || filter.conditions.length === 0) return false;

  const results = filter.conditions.map(c => matchCondition(article, c));
  return filter.conditionOperator === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean);
}

export function applyFilters<T extends ArticleLike>(
  articles: T[],
  filters: FeedFilter[]
): T[] {
  const activeFilters = filters.filter(f => f.enabled && f.conditions.length > 0);
  if (activeFilters.length === 0) return articles;

  const results: T[] = [];

  for (const article of articles) {
    let modified = { ...article };
    let shouldDelete = false;

    for (const filter of activeFilters) {
      if (!matchFilter(modified, filter)) continue;

      for (const action of filter.actions) {
        switch (action.type) {
          case 'mark-read':
            modified.isRead = true;
            modified.readAt = Date.now();
            break;
          case 'star':
            modified.isStarred = true;
            modified.starredAt = Date.now();
            break;
          case 'delete':
            shouldDelete = true;
            break;
          case 'add-tag':
            // Tags stored in summary.tags or a dedicated field in future
            break;
        }
      }
    }

    if (!shouldDelete) {
      results.push(modified);
    }
  }

  return results;
}
