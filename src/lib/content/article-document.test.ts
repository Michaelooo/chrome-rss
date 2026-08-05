// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Article } from '@/types';
import { buildArticleDocument, selectArticleContent } from './article-document';

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'article-1',
    feedId: 'feed-1',
    title: 'Test',
    link: 'https://example.com/posts/1',
    pubDate: 1,
    guid: 'guid-1',
    isRead: false,
    isStarred: false,
    createdAt: 1,
    ...overrides,
  };
}

describe('selectArticleContent', () => {
  it('prefers full content over feed content and description', () => {
    expect(selectArticleContent(article({ fullContent: '<p>full</p>', content: '<p>feed</p>', description: 'desc' })))
      .toEqual({ source: 'fullContent', html: '<p>full</p>' });
  });

  it('ignores blank values', () => {
    expect(selectArticleContent(article({ fullContent: ' ', content: '<p>feed</p>' })))
      .toEqual({ source: 'content', html: '<p>feed</p>' });
  });
});

describe('buildArticleDocument', () => {
  it('restores lazy images, resolves URLs and removes unsafe content', async () => {
    const document = await buildArticleDocument(article({
      content: '<script>alert(1)</script><p onclick="alert(1)">Hello world</p><img src="spacer.gif" data-src="/images/real.png"><a href="javascript:alert(1)">bad</a>',
    }));

    expect(document?.canonicalHtml).not.toContain('<script');
    expect(document?.canonicalHtml).not.toContain('onclick');
    expect(document?.canonicalHtml).not.toContain('javascript:');
    expect(document?.canonicalHtml).toContain('https://example.com/images/real.png');
    expect(document?.blocks[0].id).toMatch(/^b-/);
    expect(document?.completeness.restoredImageCount).toBe(1);
  });

  it('produces stable hashes for the same semantic document', async () => {
    const first = await buildArticleDocument(article({ content: '<p>Hello   world</p>' }));
    const second = await buildArticleDocument(article({ content: '<p>Hello world</p>' }));
    expect(first?.contentHash).toBe(second?.contentHash);
    expect(first?.blocks[0].id).toBe(second?.blocks[0].id);
  });

  it('preserves document structure when rendering translations', async () => {
    const document = await buildArticleDocument(article({
      content: '<figure><img src="/image.png"><figcaption>Caption</figcaption></figure><ul><li>First</li></ul><table><tbody><tr><td>Cell</td></tr></tbody></table>',
    }));
    expect(document).not.toBeNull();
    const translations = new Map(document!.blocks.map(block => [block.id, `T:${block.text}`]));
    const { buildTranslatedDocumentHtml } = await import('./article-document');
    const html = buildTranslatedDocumentHtml(document!, translations, 'bilingual');
    expect(html).toContain('<figure>');
    expect(html).toContain('<img');
    expect(html).toContain('<ul>');
    expect(html).toContain('<table>');
    expect(html).toContain('T:First');
    expect(html).toContain('T:Cell');
  });
});
