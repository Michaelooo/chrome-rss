import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'a', 'abbr', 'audio', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup',
  'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'iframe', 'img', 'ins', 'kbd', 'li', 'mark',
  'ol', 'p', 'picture', 'pre', 's', 'samp', 'small', 'source', 'span', 'strong',
  'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u',
  'ul', 'video',
];

const ALLOWED_ATTR = [
  'alt', 'aria-label', 'class', 'colspan', 'controls', 'data-block-id', 'decoding',
  'height', 'href', 'loading', 'poster', 'preload', 'rel', 'rowspan', 'sizes', 'src',
  'srcset', 'target', 'title', 'type', 'width',
];

const URI_ATTRIBUTES = ['href', 'src', 'poster'];
const SAFE_URI_PATTERN = /^(?:https?:|data:image\/|blob:|#|\/|\.\/|\.\.\/)/i;

function removeUnsafeUris(node: Element): void {
  for (const attribute of URI_ATTRIBUTES) {
    const value = node.getAttribute(attribute)?.trim();
    if (value && !SAFE_URI_PATTERN.test(value)) {
      node.removeAttribute(attribute);
    }
  }

  const srcset = node.getAttribute('srcset');
  if (srcset) {
    const safeCandidates = srcset
      .split(',')
      .map(candidate => candidate.trim())
      .filter(candidate => {
        const [url] = candidate.split(/\s+/, 1);
        return SAFE_URI_PATTERN.test(url);
      });
    if (safeCandidates.length > 0) {
      node.setAttribute('srcset', safeCandidates.join(', '));
    } else {
      node.removeAttribute('srcset');
    }
  }
}

export function sanitizeArticleHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['form', 'input', 'button', 'script', 'style', 'object', 'embed'],
  });

  const template = document.createElement('template');
  template.innerHTML = clean;
  template.content.querySelectorAll('*').forEach(node => {
    Array.from(node.attributes).forEach(attribute => {
      if (attribute.name.toLowerCase().startsWith('on')) {
        node.removeAttribute(attribute.name);
      }
    });
    removeUnsafeUris(node);
  });

  return template.innerHTML;
}
