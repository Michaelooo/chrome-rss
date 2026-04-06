import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Star, Calendar, User, X, Type, Columns, FileText } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store';
import type { Settings } from '@/types';
import { db } from '@/lib/storage/db';
import type { Article } from '@/types';
import { fetchFullContent } from '@/lib/fetcher/full-content-fetcher';

const FONT_SIZE_OPTIONS: { value: Settings['fontSize']; tKey: string }[] = [
  { value: 'small', tKey: 'settings.fontSizeSmall' },
  { value: 'medium', tKey: 'settings.fontSizeMedium' },
  { value: 'large', tKey: 'settings.fontSizeLarge' },
  { value: 'xlarge', tKey: 'settings.fontSizeXLarge' },
];

const CONTENT_WIDTH_OPTIONS: { value: Settings['contentWidth']; tKey: string }[] = [
  { value: 'narrow', tKey: 'settings.contentWidthNarrow' },
  { value: 'standard', tKey: 'settings.contentWidthStandard' },
  { value: 'wide', tKey: 'settings.contentWidthWide' },
  { value: 'xwide', tKey: 'settings.contentWidthXWide' },
];

const FONT_SIZE_CLASS: Record<Settings['fontSize'], string> = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg',
  xlarge: 'text-xl',
};

const CONTENT_WIDTH_CLASS: Record<Settings['contentWidth'], string> = {
  narrow: 'max-w-2xl',
  standard: 'max-w-4xl',
  wide: 'max-w-6xl',
  xwide: 'max-w-7xl',
};
import { formatRelativeTime } from '@/lib/utils';
import { emitArticleUpdated, subscribeArticleUpdated } from '@/lib/events/articles';
import { translateArticleWithGoogle } from '@/lib/translation';

interface CodeBlockCleanupRecord {
  wrapper: HTMLDivElement;
  pre: HTMLPreElement;
  originalParent: ParentNode | null;
  nextSibling: ChildNode | null;
  copyButton: HTMLButtonElement;
  handleCopy: (event: MouseEvent) => void;
  clearTimer: () => void;
}

const enhanceCodeBlocks = (
  container: HTMLElement,
  strings: { copy: string; copied: string; failed: string } = { copy: 'Copy', copied: 'Copied', failed: 'Failed' }
): (() => void) => {
  const records: CodeBlockCleanupRecord[] = [];

  const codeBlocks = Array.from(container.querySelectorAll<HTMLPreElement>('pre'));

  codeBlocks.forEach(pre => {
    const originalParent = pre.parentNode;
    if (!originalParent) {
      return;
    }

    if (originalParent instanceof HTMLDivElement && originalParent.classList.contains('article-code-container')) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'article-code-container';

    const toolbar = document.createElement('div');
    toolbar.className = 'article-code-toolbar';

    const languageLabel = (() => {
      const codeElement = pre.querySelector('code');
      const languageMatch = codeElement?.className.match(/language-([\w-]+)/i);
      if (languageMatch?.[1]) {
        return languageMatch[1].toUpperCase();
      }
      return 'CODE';
    })();

    const badge = document.createElement('span');
    badge.className = 'article-code-badge';
    badge.textContent = languageLabel;

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'article-code-copy';
    copyButton.textContent = strings.copy;

    let resetTimer: number | null = null;
    const clearTimer = () => {
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer);
        resetTimer = null;
      }
    };

    const handleCopy = async (event: MouseEvent) => {
      event.preventDefault();
      clearTimer();

      const codeElement = pre.querySelector('code');
      const rawText = codeElement?.textContent ?? pre.textContent ?? '';

      const setStatus = (label: string) => {
        copyButton.textContent = label;
        clearTimer();
        resetTimer = window.setTimeout(() => {
          copyButton.textContent = strings.copy;
          resetTimer = null;
        }, 2000);
      };

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(rawText);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = rawText;
          textarea.setAttribute('readonly', 'true');
          textarea.style.position = 'absolute';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        setStatus(strings.copied);
      } catch (error) {
        console.error('Failed to copy code:', error);
        setStatus(strings.failed);
      }
    };

    copyButton.addEventListener('click', handleCopy);

    const nextSibling = pre.nextSibling;
    originalParent.insertBefore(wrapper, pre);
    wrapper.appendChild(toolbar);
    toolbar.appendChild(badge);
    toolbar.appendChild(copyButton);
    wrapper.appendChild(pre);
    pre.classList.add('article-code-block');

    records.push({
      wrapper,
      pre,
      originalParent,
      nextSibling,
      copyButton,
      handleCopy,
      clearTimer,
    });
  });

  return () => {
    records.forEach(
      ({ wrapper, pre, originalParent, nextSibling, copyButton, handleCopy, clearTimer }) => {
        clearTimer();
        copyButton.removeEventListener('click', handleCopy);
        pre.classList.remove('article-code-block');

        if (pre.parentElement === wrapper) {
          wrapper.removeChild(pre);
        }

        if (originalParent) {
          if (nextSibling && nextSibling.parentNode === originalParent) {
            originalParent.insertBefore(pre, nextSibling);
          } else {
            originalParent.appendChild(pre);
          }
        }

        wrapper.remove();
      }
    );
  };
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildHtmlFromTranslatedText(text: string): string {
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) {
    return '';
  }

  const paragraphs = normalized.split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean);
  if (paragraphs.length === 0) {
    return `<p>${escapeHtml(normalized).replace(/\n/g, '<br />')}</p>`;
  }

  return paragraphs
    .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export const ArticleReader: React.FC = () => {
  const { t } = useTranslation();
  const { uiState, settings, feeds, updateSettings } = useAppStore();
  const [article, setArticle] = useState<Article | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [detectedSourceLanguage, setDetectedSourceLanguage] = useState<string | undefined>();
  const [isFetchingFullContent, setIsFetchingFullContent] = useState(false);
  const [fullContentError, setFullContentError] = useState<string | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (uiState.selectedArticleId) {
      loadArticle(uiState.selectedArticleId);
    } else {
      setArticle(null);
    }
    setShowTranslation(false);
    setTranslationError(null);
    setIsTranslating(false);
    setDetectedSourceLanguage(undefined);
    setFullContentError(null);
  }, [uiState.selectedArticleId]);

  useEffect(() => {
    const unsubscribe = subscribeArticleUpdated(({ id, updates }) => {
      setArticle(prev => {
        if (!prev || prev.id !== id) {
          return prev;
        }
        return { ...prev, ...updates };
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const loadArticle = async (id: string) => {
    const article = await db.articles.get(id);
    if (article) {
      setArticle(article);
      setShowTranslation(false);
      setTranslationError(null);
      setIsTranslating(false);
      setDetectedSourceLanguage(undefined);
    }
  };

  const handleToggleStar = async () => {
    if (!article) return;

    const newStarred = !article.isStarred;
    const starredAt = newStarred ? Date.now() : undefined;
    
    await db.articles.update(article.id, {
      isStarred: newStarred,
      starredAt,
    });

    setArticle({ ...article, isStarred: newStarred, starredAt });
    emitArticleUpdated(
      article.id,
      { isStarred: newStarred, starredAt },
      { isStarred: article.isStarred }
    );
  };

  const handleOpenLink = () => {
    if (article?.link) {
      window.open(article.link, '_blank');
    }
  };

  const handleFetchFullContent = async (force = false) => {
    if (!article?.link) return;
    if (isFetchingFullContent) return;
    if (article.fullContent && !force) return;

    setIsFetchingFullContent(true);
    setFullContentError(null);
    try {
      const html = await fetchFullContent(article.link);
      await db.articles.update(article.id, { fullContent: html });
      const updated = { ...article, fullContent: html };
      setArticle(updated);
      emitArticleUpdated(article.id, { fullContent: html });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('articleReader.fullContentError');
      setFullContentError(message);
    } finally {
      setIsFetchingFullContent(false);
    }
  };

  // Auto-fetch full content when the feed has fullContentFetch enabled
  // and the article doesn't have full content yet
  useEffect(() => {
    if (!article) return;
    if (article.fullContent) return;
    const feed = feeds.find(f => f.id === article.feedId);
    if (!feed?.fullContentFetch) return;
    void handleFetchFullContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id, feeds]);

  useEffect(() => {
    if (!article) return;
    const container = contentRef.current;
    if (!container) return;

    const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>('a'));
    anchors.forEach(anchor => {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
      anchor.classList.add('article-link');
    });

    const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
    const handleImageClick = (event: Event) => {
      const target = event.currentTarget as HTMLImageElement;
      setPreviewImage({ src: target.currentSrc || target.src, alt: target.alt });
    };
    const handleImageKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleImageClick(event);
      }
    };
    images.forEach(image => {
      image.classList.add('article-image');
      image.setAttribute('loading', 'lazy');
      image.setAttribute('role', 'button');
      image.setAttribute('tabindex', '0');
      image.addEventListener('click', handleImageClick);
      image.addEventListener('keydown', handleImageKeyDown);
    });

    const videos = Array.from(container.querySelectorAll<HTMLVideoElement>('video'));
    videos.forEach(video => {
      video.classList.add('article-media');
      video.setAttribute('controls', 'true');
      video.setAttribute('playsinline', 'true');
      video.setAttribute('preload', 'metadata');
    });

    const iframes = Array.from(container.querySelectorAll<HTMLIFrameElement>('iframe'));
    iframes.forEach(frame => {
      frame.classList.add('article-embed');
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('allowfullscreen', 'true');
    });

    const codeBlocks = Array.from(container.querySelectorAll<HTMLElement>('pre, code, samp, kbd'));
    codeBlocks.forEach(block => block.classList.add('article-code'));

    const cleanupCodeBlocks = enhanceCodeBlocks(container, {
      copy: t('articleReader.copy'),
      copied: t('articleReader.copied'),
      failed: t('articleReader.copyFailed'),
    });

    const mathElements = Array.from(container.querySelectorAll<HTMLElement>('math, .math, .katex-display, .MathJax'));
    mathElements.forEach(el => el.classList.add('article-math'));

    return () => {
      images.forEach(image => {
        image.removeEventListener('click', handleImageClick);
        image.removeEventListener('keydown', handleImageKeyDown);
      });
      cleanupCodeBlocks();
    };
  }, [article, t]);

  useEffect(() => {
    if (!previewImage) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewImage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage]);

  const closePreview = () => setPreviewImage(null);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closePreview();
    }
  };

  const translationTargetLanguage = useMemo(() => {
    if (!settings?.enableTranslation) {
      return undefined;
    }
    return settings.translationTargetLanguage?.trim() || 'zh-CN';
  }, [settings]);

  const translationSourceLanguage = useMemo(() => {
    if (!settings?.enableTranslation) {
      return undefined;
    }
    return settings.translationSourceLanguage?.trim() || undefined;
  }, [settings]);

  const activeTranslation = useMemo(() => {
    if (!article || !translationTargetLanguage) {
      return undefined;
    }
    return article.translations?.[translationTargetLanguage];
  }, [article, translationTargetLanguage]);

  const translateCurrentArticle = async ({
    auto = false,
    signal,
  }: {
    auto?: boolean;
    signal?: AbortSignal;
  } = {}): Promise<void> => {
    if (!article || !translationTargetLanguage || !settings?.enableTranslation) {
      return;
    }

    if (!article.content && !article.description) {
      setTranslationError(t('articleReader.noTranslatableContent'));
      return;
    }

    if (activeTranslation && !auto) {
      setShowTranslation(true);
      return;
    }

    if (isTranslating) {
      return;
    }

    try {
      if (signal?.aborted) {
        return;
      }

      setIsTranslating(true);
      setTranslationError(null);
      const { translatedText, detectedSourceLanguage: detected } =
        await translateArticleWithGoogle({
          articleId: article.id,
          html: article.content || article.description || '',
          targetLanguage: translationTargetLanguage,
          sourceLanguage: translationSourceLanguage,
        });

      if (signal?.aborted) {
        return;
      }

      const contentHtml = buildHtmlFromTranslatedText(translatedText);
      const translations = {
        ...(article.translations ?? {}),
        [translationTargetLanguage]: {
          contentHtml,
          translatedAt: Date.now(),
          provider: 'google' as const,
        },
      };

      await db.articles.update(article.id, { translations });
      const updatedArticle = { ...article, translations };
      setArticle(updatedArticle);
      setShowTranslation(true);
      setDetectedSourceLanguage(detected);
      emitArticleUpdated(article.id, { translations });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('articleReader.translationFailed');
      setTranslationError(message);
    } finally {
      if (signal?.aborted) {
        return;
      }
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    if (!article) return;
    if (!translationTargetLanguage) return;
    if (!settings?.enableTranslation) return;
    if (!settings.translationAutoFetch) return;
    if (activeTranslation) {
      setShowTranslation(true);
      return;
    }
    const controller = new AbortController();
    void translateCurrentArticle({ auto: true, signal: controller.signal });
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article, activeTranslation, translationTargetLanguage, translationSourceLanguage, settings]);

  const handleTranslationButtonClick = async () => {
    if (!settings?.enableTranslation) return;
    if (!translationTargetLanguage) return;

    if (activeTranslation) {
      setShowTranslation(prev => !prev);
      return;
    }

    await translateCurrentArticle();
  };

  const renderedContentHtml = useMemo(() => {
    if (showTranslation && activeTranslation) {
      return activeTranslation.contentHtml;
    }
    return article?.fullContent || article?.content || article?.description || '';
  }, [showTranslation, activeTranslation, article]);

  const translationInfo = useMemo(() => {
    if (!showTranslation || !activeTranslation) {
      return null;
    }
    const translatedAt = new Date(activeTranslation.translatedAt);
    return `${t('articleReader.translatedByGoogle')} \u00b7 ${translatedAt.toLocaleString()}${
      detectedSourceLanguage ? ` \u00b7 ${t('articleReader.detectedLang', { lang: detectedSourceLanguage.toUpperCase() })}` : ''
    }`;
  }, [showTranslation, activeTranslation, detectedSourceLanguage]);

  if (!article) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        {t('articleReader.selectArticle')}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div
          className={`mx-auto w-full px-6 py-6 ${CONTENT_WIDTH_CLASS[settings?.contentWidth ?? 'standard']}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {!article.isRead && (
                  <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                    {t('articleReader.unread')}
                  </span>
                )}
                {article.author && (
                  <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                    <User className="h-4 w-4" />
                    <span>{article.author}</span>
                  </div>
                )}
              </div>
              <h1 className="text-3xl font-semibold leading-tight text-gray-900 dark:text-gray-100">
                {article.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{formatRelativeTime(article.pubDate)}</span>
                </div>
                {article.link && (
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="article-link"
                  >
                    {t('articleReader.viewOriginal')}
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {settings?.enableTranslation && translationTargetLanguage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTranslationButtonClick}
                  title={
                    activeTranslation
                      ? showTranslation
                        ? t('articleReader.viewOriginalTranslated')
                        : t('articleReader.viewTranslated')
                      : t('articleReader.translate')
                  }
                  disabled={isTranslating}
                >
                  {activeTranslation
                    ? showTranslation
                      ? t('articleReader.viewOriginalTranslated')
                      : t('articleReader.viewTranslated')
                    : isTranslating
                      ? t('articleReader.translating')
                      : t('articleReader.translate')}
                </Button>
              )}

              {article.link && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleFetchFullContent(!!article.fullContent)}
                  disabled={isFetchingFullContent}
                  title={
                    article.fullContent
                      ? t('articleReader.refetchFullContent')
                      : t('articleReader.fetchFullContent')
                  }
                  className="gap-1"
                >
                  <FileText className="h-4 w-4" />
                  {isFetchingFullContent
                    ? t('articleReader.fetchingFullContent')
                    : article.fullContent
                      ? t('articleReader.fullContentFetched')
                      : t('articleReader.fetchFullContent')}
                </Button>
              )}

              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    title={t('articleReader.fontSize')}
                    className="gap-1"
                  >
                    <Type className="h-4 w-4" />
                    {t('articleReader.fontSize')}
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="min-w-[120px] rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                    align="end"
                    sideOffset={4}
                  >
                    {FONT_SIZE_OPTIONS.map((opt) => (
                      <DropdownMenu.Item
                        key={opt.value}
                        className={`flex cursor-pointer rounded px-2 py-1.5 text-sm outline-none hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          settings?.fontSize === opt.value
                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                        onSelect={() => updateSettings({ fontSize: opt.value })}
                      >
                        {t(opt.tKey)}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    title={t('articleReader.width')}
                    className="gap-1"
                  >
                    <Columns className="h-4 w-4" />
                    {t('articleReader.width')}
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="min-w-[120px] rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                    align="end"
                    sideOffset={4}
                  >
                    {CONTENT_WIDTH_OPTIONS.map((opt) => (
                      <DropdownMenu.Item
                        key={opt.value}
                        className={`flex cursor-pointer rounded px-2 py-1.5 text-sm outline-none hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          settings?.contentWidth === opt.value
                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                        onSelect={() => updateSettings({ contentWidth: opt.value })}
                      >
                        {t(opt.tKey)}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleStar}
                title={article.isStarred ? t('articleReader.unstar') : t('articleReader.star')}
              >
                <Star
                  className={`h-5 w-5 transition-colors ${
                    article.isStarred ? 'fill-yellow-500 text-yellow-500' : 'text-gray-400'
                  }`}
                />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenLink}
                title={t('articleReader.openInNewTab')}
              >
                <ExternalLink className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div
          className={`mx-auto w-full px-6 py-10 ${CONTENT_WIDTH_CLASS[settings?.contentWidth ?? 'standard']}`}
        >
          {translationInfo && (
            <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900/60 dark:bg-blue-900/20 dark:text-blue-300">
              {translationInfo}
            </div>
          )}

          {translationError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
              {translationError}
            </div>
          )}

          {fullContentError && (
            <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-900/60 dark:bg-orange-900/20 dark:text-orange-300">
              {t('articleReader.fullContentError')}: {fullContentError}
            </div>
          )}

          {renderedContentHtml ? (
            <article
              ref={contentRef}
              className={`article-content ${FONT_SIZE_CLASS[settings?.fontSize ?? 'medium']}`}
              dangerouslySetInnerHTML={{
                __html: renderedContentHtml,
              }}
            />
          ) : (
            <p className="text-gray-500">{t('articleReader.noContent')}</p>
          )}
        </div>
      </ScrollArea>

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="absolute right-6 top-6 text-white transition-opacity hover:opacity-75"
            onClick={closePreview}
            aria-label={t('articleReader.closeImagePreview')}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={previewImage.src}
            alt={previewImage.alt || t('articleReader.imagePreviewAlt')}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
