const LAZY_SRC_ATTRIBUTES = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-url',
  'data-image',
  'data-flickity-lazyload',
];

const LAZY_SRCSET_ATTRIBUTES = [
  'data-srcset',
  'data-lazy-srcset',
  'data-original-set',
];

const PLACEHOLDER_PATTERN = /(?:spacer|transparent|blank|placeholder)(?:[-_.]|$)/i;

function isPlaceholderSource(src: string | null): boolean {
  if (!src) return true;
  const normalized = src.trim();
  if (!normalized) return true;
  if (PLACEHOLDER_PATTERN.test(normalized)) return true;
  return /^data:image\/gif;base64,R0lGODlhAQABA/i.test(normalized);
}

function firstAttribute(element: Element, attributes: string[]): string | null {
  for (const attribute of attributes) {
    const value = element.getAttribute(attribute)?.trim();
    if (value) return value;
  }
  return null;
}

function resolveUrl(value: string, baseUrl: string): string {
  if (/^(?:data:|blob:|#)/i.test(value)) return value;
  return new URL(value, baseUrl).href;
}

function resolveSrcset(value: string, baseUrl: string): string {
  return value
    .split(',')
    .map(candidate => {
      const parts = candidate.trim().split(/\s+/);
      if (!parts[0]) return '';
      try {
        parts[0] = resolveUrl(parts[0], baseUrl);
      } catch {
        return candidate.trim();
      }
      return parts.join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

export interface MediaRecoveryStats {
  imageCount: number;
  restoredImageCount: number;
}

export function recoverLazyMedia(container: ParentNode): MediaRecoveryStats {
  let restoredImageCount = 0;

  container.querySelectorAll<HTMLImageElement>('img').forEach(image => {
    const currentSrc = image.getAttribute('src');
    const lazySrc = firstAttribute(image, LAZY_SRC_ATTRIBUTES);
    if (lazySrc && isPlaceholderSource(currentSrc)) {
      image.setAttribute('src', lazySrc);
      restoredImageCount += 1;
    }

    if (!image.getAttribute('srcset')) {
      const lazySrcset = firstAttribute(image, LAZY_SRCSET_ATTRIBUTES);
      if (lazySrcset) {
        image.setAttribute('srcset', lazySrcset);
        restoredImageCount += 1;
      }
    }
  });

  container.querySelectorAll<HTMLSourceElement>('picture source').forEach(source => {
    if (!source.getAttribute('srcset')) {
      const lazySrcset = firstAttribute(source, LAZY_SRCSET_ATTRIBUTES);
      if (lazySrcset) source.setAttribute('srcset', lazySrcset);
    }
    if (!source.getAttribute('src')) {
      const lazySrc = firstAttribute(source, LAZY_SRC_ATTRIBUTES);
      if (lazySrc) source.setAttribute('src', lazySrc);
    }
  });

  container.querySelectorAll<HTMLElement>('noscript').forEach(noscript => {
    const template = document.createElement('template');
    template.innerHTML = noscript.textContent || '';
    const replacement = template.content.querySelector('picture, img');
    if (!replacement) return;

    const previous = noscript.previousElementSibling;
    if (previous instanceof HTMLImageElement && isPlaceholderSource(previous.getAttribute('src'))) {
      previous.replaceWith(replacement);
      restoredImageCount += 1;
    } else if (!previous?.matches('picture, img')) {
      noscript.before(replacement);
      restoredImageCount += 1;
    }
    noscript.remove();
  });

  return {
    imageCount: container.querySelectorAll('img').length,
    restoredImageCount,
  };
}

export function resolveArticleUrls(container: ParentNode, baseUrl: string): void {
  container.querySelectorAll<HTMLElement>('[src], [href], [poster]').forEach(element => {
    for (const attribute of ['src', 'href', 'poster']) {
      const value = element.getAttribute(attribute);
      if (!value || (attribute === 'href' && value.startsWith('#'))) continue;
      try {
        element.setAttribute(attribute, resolveUrl(value, baseUrl));
      } catch {
        element.removeAttribute(attribute);
      }
    }
  });

  container.querySelectorAll<HTMLElement>('[srcset]').forEach(element => {
    const srcset = element.getAttribute('srcset');
    if (srcset) element.setAttribute('srcset', resolveSrcset(srcset, baseUrl));
  });
}
