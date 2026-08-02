import type {
  Article,
  ArticleBlockType,
  ArticleContentSource,
  ArticleDocument,
  ArticleDocumentBlock,
} from '@/types';
import { recoverLazyMedia, resolveArticleUrls } from './media';
import { sanitizeArticleHtml } from './sanitize';

export const ARTICLE_DOCUMENT_PIPELINE_VERSION = 1;

const ENTITY_TAG_PATTERN = /&lt;\s*(\/?\s*(?:img|br|hr|source|video|audio|picture|figure|figcaption|p|div|span|a|table|tbody|thead|tfoot|tr|td|th|ul|ol|li|h[1-6]|blockquote|pre|code|em|strong|b|i|u|s|del|ins|mark|sub|sup|iframe)\b)([^]*?)&gt;/gi;
const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,td,th';

export function selectArticleContent(article: Article): {
  source: ArticleContentSource;
  html: string;
} | null {
  const candidates: Array<[ArticleContentSource, string | undefined]> = [
    ['fullContent', article.fullContent],
    ['content', article.content],
    ['description', article.description],
  ];

  for (const [source, html] of candidates) {
    if (html?.trim()) return { source, html };
  }
  return null;
}

function normalizeText(value: string): string {
  return value.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function blockTypeFor(element: Element): ArticleBlockType {
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'li') return 'list-item';
  if (tag === 'blockquote') return 'blockquote';
  if (tag === 'pre') return 'code';
  if (tag === 'figcaption') return 'caption';
  if (tag === 'td' || tag === 'th') return 'table-cell';
  return 'paragraph';
}

export async function hashText(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function assignBlocks(container: HTMLElement): Promise<ArticleDocumentBlock[]> {
  let elements = Array.from(container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  if (elements.length === 0) {
    elements = Array.from(container.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && !!normalizeText(element.textContent || '')
    );
  }

  const occurrences = new Map<string, number>();
  const blocks: ArticleDocumentBlock[] = [];

  for (const element of elements) {
    const text = normalizeText(element.textContent || '');
    if (!text) continue;
    const type = blockTypeFor(element);
    const textHash = (await hashText(`${type}\n${text}`)).slice(0, 12);
    const occurrence = (occurrences.get(textHash) || 0) + 1;
    occurrences.set(textHash, occurrence);
    const id = `b-${textHash}-${occurrence}`;
    element.setAttribute('data-block-id', id);
    blocks.push({ id, type, text, html: element.innerHTML, order: blocks.length });
  }

  return blocks;
}

function calculateCompleteness(
  source: ArticleContentSource,
  textLength: number,
  imageCount: number,
  restoredImageCount: number
): ArticleDocument['completeness'] {
  const reasons: string[] = [];
  if (source === 'description') reasons.push('当前仅获取到文章摘要');
  if (textLength < 500) reasons.push('正文内容较短，可能不完整');
  if (restoredImageCount > 0) reasons.push(`已恢复 ${restoredImageCount} 个懒加载图片资源`);

  const level = source === 'description' || textLength < 500
    ? 'low'
    : source === 'content' || textLength < 1500
      ? 'medium'
      : 'high';

  return { level, reasons, imageCount, restoredImageCount };
}

export function buildTranslatedDocumentHtml(
  document: ArticleDocument,
  translations: Map<string, string>,
  mode: 'translated' | 'bilingual'
): string {
  const container = window.document.createElement('div');
  container.innerHTML = document.canonicalHtml;

  container.querySelectorAll<HTMLElement>('[data-block-id]').forEach(block => {
    const blockId = block.dataset.blockId;
    const translatedText = blockId ? translations.get(blockId) : undefined;
    if (!translatedText) return;

    if (mode === 'translated') {
      const media = Array.from(block.querySelectorAll(':scope > img, :scope > picture, :scope > video, :scope > figure'))
        .map(element => element.cloneNode(true));
      block.replaceChildren(...media, window.document.createTextNode(translatedText));
      block.classList.add('article-translation-block');
      return;
    }

    const translation = window.document.createElement(block.matches('li') ? 'li' : 'div');
    translation.className = 'article-translation-block';
    translation.textContent = translatedText;
    if (block.matches('li')) {
      translation.classList.add('article-translation-list-item');
      block.insertAdjacentElement('afterend', translation);
    } else if (block.matches('td, th')) {
      block.appendChild(translation);
    } else {
      block.insertAdjacentElement('afterend', translation);
    }
  });

  return container.innerHTML;
}

export async function buildArticleDocument(article: Article): Promise<ArticleDocument | null> {
  const selected = selectArticleContent(article);
  if (!selected) return null;

  const container = document.createElement('div');
  container.innerHTML = selected.html.replace(ENTITY_TAG_PATTERN, '<$1$2>');
  const mediaStats = recoverLazyMedia(container);
  if (article.link) resolveArticleUrls(container, article.link);
  container.innerHTML = sanitizeArticleHtml(container.innerHTML);

  const blocks = await assignBlocks(container);
  const normalizedText = blocks.map(block => `${block.type}\n${block.text}`).join('\n\n');
  const contentHash = await hashText(
    `${ARTICLE_DOCUMENT_PIPELINE_VERSION}\n${selected.source}\n${normalizedText}`
  );
  const now = Date.now();
  const textLength = blocks.reduce((total, block) => total + block.text.length, 0);

  return {
    articleId: article.id,
    source: selected.source,
    canonicalHtml: container.innerHTML,
    blocks,
    contentHash,
    pipelineVersion: ARTICLE_DOCUMENT_PIPELINE_VERSION,
    textLength,
    completeness: calculateCompleteness(
      selected.source,
      textLength,
      mediaStats.imageCount,
      mediaStats.restoredImageCount
    ),
    createdAt: now,
    updatedAt: now,
  };
}
