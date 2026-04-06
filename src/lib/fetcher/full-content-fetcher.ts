import { Readability } from '@mozilla/readability';

/**
 * Detects the character encoding from an ArrayBuffer by inspecting HTTP Content-Type
 * and HTML meta tags, with fallback to UTF-8.
 */
function detectEncoding(buffer: ArrayBuffer, contentType: string): string {
  const charsetMatch = /charset=([^\s;]+)/i.exec(contentType);
  let encoding = charsetMatch?.[1] ?? 'utf-8';

  // Sniff the first 2 KB for meta charset declarations
  const sniff = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 2048));
  const metaCharset =
    /charset=["']?([^\s"';>]+)/i.exec(sniff)?.[1] ??
    /<meta[^>]+http-equiv=["']?content-type["'][^>]+content=["'][^"']*charset=([^\s"';>]+)/i.exec(sniff)?.[1];
  if (metaCharset) {
    encoding = metaCharset;
  }

  // Normalize common CJK encoding aliases that TextDecoder doesn't accept directly
  const enc = encoding.toLowerCase().trim();
  if (enc === 'gbk' || enc === 'gb2312' || enc === 'gb_2312-80') return 'gb18030';
  return enc || 'utf-8';
}

/**
 * Resolves relative img/a/video/source URLs against the page base URL.
 */
function resolveRelativeUrls(container: Element, baseUrl: string): void {
  const base = new URL(baseUrl);

  container.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('data:')) {
      try { img.setAttribute('src', new URL(src, base).href); } catch { /* ignore */ }
    }
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      const resolved = srcset.split(',').map(part => {
        const [u, descriptor] = part.trim().split(/\s+/);
        try {
          const abs = new URL(u, base).href;
          return descriptor ? `${abs} ${descriptor}` : abs;
        } catch { return part; }
      }).join(', ');
      img.setAttribute('srcset', resolved);
    }
  });

  container.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      try { a.setAttribute('href', new URL(href, base).href); } catch { /* ignore */ }
    }
  });

  container.querySelectorAll('video[src], source[src]').forEach(el => {
    const src = el.getAttribute('src');
    if (src) {
      try { el.setAttribute('src', new URL(src, base).href); } catch { /* ignore */ }
    }
  });
}

/**
 * Fetches the full article content from the given URL using @mozilla/readability
 * to extract only the main article body, stripping ads, navigation and boilerplate.
 * Returns cleaned inner HTML.
 */
export async function fetchFullContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const encoding = detectEncoding(buffer, response.headers.get('content-type') ?? '');

  let html: string;
  try {
    html = new TextDecoder(encoding).decode(buffer);
  } catch {
    html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Resolve the effective base URL (honours <base href> if present)
  const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
  const resolvedBase = baseHref ? new URL(baseHref, url).href : url;

  // Set the document URL so Readability can resolve relative links internally
  Object.defineProperty(doc, 'documentURI', { value: resolvedBase, configurable: true });
  Object.defineProperty(doc, 'baseURI', { value: resolvedBase, configurable: true });

  const reader = new Readability(doc, { keepClasses: false });
  const article = reader.parse();

  if (!article || !article.content) {
    throw new Error('Readability could not extract article content');
  }

  // Readability returns a self-contained HTML fragment; resolve any remaining relative URLs
  const wrapper = document.createElement('div');
  wrapper.innerHTML = article.content;
  resolveRelativeUrls(wrapper, resolvedBase);

  return wrapper.innerHTML;
}
