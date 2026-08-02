import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Star, Calendar, User, X, Type, Columns, FileText } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store';
import type { Settings } from '@/types';
import { db, getArticleArtifacts, saveArticleDocument } from '@/lib/storage/db';
import type {
  Article,
  ArticleArtifact,
  ArticleDocument,
  AttentionAnalysisData,
  BodyTranslationData,
  TitleTranslationData,
} from '@/types';
import { enableImageReferer } from '@/lib/chrome/image-referer';
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
import { buildArticleDocument, buildTranslatedDocumentHtml, hashText } from '@/lib/content/article-document';
import { getConfiguredAIProviders, isArtifactFromConfiguredProvider } from '@/lib/ai/client';
import {
  summarizeArticle,
  translateArticleBodyWithAI,
} from '@/lib/ai';

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

export const ArticleReader: React.FC = () => {
  const { t } = useTranslation();
  const { uiState, settings, feeds, updateSettings } = useAppStore();
  const [article, setArticle] = useState<Article | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isFetchingFullContent, setIsFetchingFullContent] = useState(false);
  const [fullContentError, setFullContentError] = useState<string | null>(null);
  const [articleDocument, setArticleDocument] = useState<ArticleDocument | null>(null);
  const [artifacts, setArtifacts] = useState<ArticleArtifact[]>([]);
  const [translationView, setTranslationView] = useState<'original' | 'translated' | 'bilingual'>('original');
  const [failedImages, setFailedImages] = useState<Record<string, string>>({});
  const imageRefererRetriesRef = useRef<Set<string>>(new Set());
  const contentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (uiState.selectedArticleId) {
      loadArticle(uiState.selectedArticleId);
    } else {
      setArticle(null);
    }
    setTranslationError(null);
    setIsTranslating(false);
    setSummaryError(null);
    setFullContentError(null);
    setArticleDocument(null);
    setArtifacts([]);
    setTranslationView(settings?.defaultTranslationView ?? 'original');
    setFailedImages({});
    imageRefererRetriesRef.current.clear();
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
    const loadedArticle = await db.articles.get(id);
    if (!loadedArticle) return;

    setArticle(loadedArticle);
    setTranslationError(null);
    setIsTranslating(false);

    const [document, storedArtifacts] = await Promise.all([
      buildArticleDocument(loadedArticle),
      getArticleArtifacts(id),
    ]);
    if (document) {
      await saveArticleDocument(document);
    }
    const titleHash = await hashText(loadedArticle.title.trim());
    const targetLanguage = settings?.translationTargetLanguage?.trim() || 'zh-CN';
    const validArtifacts = storedArtifacts.filter(artifact => {
      if (artifact.kind === 'title-translation') {
        return artifact.titleHash === titleHash && artifact.targetLanguage === targetLanguage;
      }
      if (!document || artifact.contentHash !== document.contentHash) return false;
      if (artifact.kind === 'body-translation') {
        const provider = settings?.bodyTranslationProvider ?? 'ai';
        const modelMatches = provider === 'google'
          ? artifact.model === 'google-translate'
          : !!settings && isArtifactFromConfiguredProvider(
              artifact,
              getConfiguredAIProviders(settings)
            );
        return artifact.titleHash === titleHash &&
          artifact.targetLanguage === targetLanguage &&
          artifact.provider === provider &&
          modelMatches;
      }
      return true;
    });
    setArticleDocument(document);
    setArtifacts(validArtifacts);
    if (!validArtifacts.some(artifact => artifact.kind === 'body-translation' && artifact.status === 'completed')) {
      setTranslationView('original');
    }
  };

  const handleGenerateSummary = async () => {
    if (!article || isSummarizing) return;
    setIsSummarizing(true);
    setSummaryError(null);
    try {
      const { summary, artifact } = await summarizeArticle({ articleId: article.id });
      setArticle({ ...article, summary });
      if (artifact) updateArtifact(artifact);
      emitArticleUpdated(article.id, { summary });
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : '生成摘要失败');
    } finally {
      setIsSummarizing(false);
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
      const document = await buildArticleDocument(updated);
      if (document) await saveArticleDocument(document);
      setArticleDocument(document);
      setArtifacts(previous => previous.filter(item => item.kind === 'title-translation'));
      setTranslationView(settings?.defaultTranslationView ?? 'original');
      emitArticleUpdated(article.id, { fullContent: html });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('articleReader.fullContentError');
      setFullContentError(message);
    } finally {
      setIsFetchingFullContent(false);
    }
  };

  useEffect(() => {
    if (!article) return;
    if (article.fullContent) return;
    const feed = feeds.find(f => f.id === article.feedId);
    if (!feed?.fullContentFetch && !settings?.autoFetchFullContent) return;
    void handleFetchFullContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id, feeds, settings?.autoFetchFullContent]);

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
    const handleImageError = async (event: Event) => {
      const target = event.currentTarget as HTMLImageElement;
      const src = target.currentSrc || target.src;
      if (!src) return;

      if (article.link && !imageRefererRetriesRef.current.has(src)) {
        imageRefererRetriesRef.current.add(src);
        try {
          await enableImageReferer(src, article.link);
          target.removeAttribute('srcset');
          target.removeAttribute('src');
          requestAnimationFrame(() => {
            target.src = src;
          });
          return;
        } catch (error) {
          console.error('Failed to enable image referer fallback:', error);
        }
      }

      setFailedImages(previous => ({ ...previous, [src]: target.alt || '' }));
      target.classList.add('article-image-failed');
    };
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
      image.addEventListener('error', handleImageError);
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
        image.removeEventListener('error', handleImageError);
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

  const titleTranslationArtifact = useMemo(
    () => artifacts.find(item => item.kind === 'title-translation' && item.status === 'completed'),
    [artifacts]
  );
  const bodyTranslationArtifact = useMemo(
    () => artifacts.find(item => item.kind === 'body-translation' && item.status === 'completed'),
    [artifacts]
  );
  const attentionArtifact = useMemo(
    () => artifacts.find(item => item.kind === 'attention-analysis' && item.status === 'completed'),
    [artifacts]
  );
  const titleTranslation = titleTranslationArtifact?.data as TitleTranslationData | undefined;
  const bodyTranslation = bodyTranslationArtifact?.data as BodyTranslationData | undefined;
  const attentionAnalysis = attentionArtifact?.data as AttentionAnalysisData | undefined;
  const translatedTitle = bodyTranslation?.translatedTitle || titleTranslation?.translatedTitle;
  const displayedTitle = translationView === 'original'
    ? article?.title
    : translatedTitle || article?.title;

  const updateArtifact = (artifact: ArticleArtifact) => {
    setArtifacts(previous => [
      ...previous.filter(item => item.kind !== artifact.kind),
      artifact,
    ]);
  };

  const handleTranslateFullArticle = async (force = false) => {
    if (!article || !translationTargetLanguage || !settings?.enableTranslation || isTranslating) return;
    if (!articleDocument?.blocks.length) {
      setTranslationError(t('articleReader.noTranslatableContent'));
      return;
    }

    setIsTranslating(true);
    setTranslationError(null);
    try {
      const artifact = settings.bodyTranslationProvider === 'google'
        ? await translateArticleWithGoogle({
            articleId: article.id,
            targetLanguage: translationTargetLanguage,
            sourceLanguage: translationSourceLanguage,
            force,
          })
        : await translateArticleBodyWithAI({
            articleId: article.id,
            targetLanguage: translationTargetLanguage,
            force,
          });
      updateArtifact(artifact);
      setTranslationView('translated');
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : t('articleReader.translationFailed'));
    } finally {
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    if (!article || !articleDocument || !settings?.translationAutoFetch) return;
    if (!settings.enableTranslation || bodyTranslation || isTranslating) return;
    void handleTranslateFullArticle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id, articleDocument?.contentHash, settings?.translationAutoFetch, bodyTranslation]);

  useEffect(() => {
    if (!article || !articleDocument || !settings?.enableAI || !settings.aiAutoAnalyzeOnOpen) return;
    if (attentionAnalysis || isSummarizing) return;
    void handleGenerateSummary();
    // The action is intentionally keyed by the prepared content hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id, articleDocument?.contentHash, settings?.enableAI, settings?.aiAutoAnalyzeOnOpen, attentionAnalysis]);

  const translatedBlockMap = useMemo(
    () => new Map(bodyTranslation?.blocks.map(block => [block.blockId, block.translatedText]) || []),
    [bodyTranslation]
  );

  const blockBasedContent = useMemo(() => {
    if (!articleDocument || translationView === 'original' || !bodyTranslation) return null;
    return buildTranslatedDocumentHtml(articleDocument, translatedBlockMap, translationView);
  }, [articleDocument, translationView, bodyTranslation, translatedBlockMap]);
  const renderedContentHtml = articleDocument?.canonicalHtml || '';

  useEffect(() => {
    if (!attentionAnalysis || !settings?.showAttentionHighlights || blockBasedContent) return;
    const container = contentRef.current;
    if (!container) return;
    const marks: HTMLElement[] = [];

    for (const highlight of attentionAnalysis.highlights) {
      const block = container.querySelector<HTMLElement>(`[data-block-id="${highlight.blockId}"]`);
      if (!block) continue;
      const fullText = block.textContent || '';
      const targetStart = fullText.indexOf(highlight.quote);
      if (targetStart < 0) {
        block.classList.add('article-highlight-block');
        block.title = highlight.explanation;
        continue;
      }
      const targetEnd = targetStart + highlight.quote.length;
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let startNode: Text | null = null;
      let startOffset = 0;
      let endNode: Text | null = null;
      let endOffset = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const nextOffset = offset + node.data.length;
        if (!startNode && targetStart >= offset && targetStart <= nextOffset) {
          startNode = node;
          startOffset = targetStart - offset;
        }
        if (targetEnd >= offset && targetEnd <= nextOffset) {
          endNode = node;
          endOffset = targetEnd - offset;
          break;
        }
        offset = nextOffset;
      }
      if (!startNode || !endNode) continue;
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const mark = document.createElement('mark');
      mark.className = `article-ai-highlight article-ai-highlight-${highlight.category}`;
      mark.title = highlight.explanation;
      try {
        range.surroundContents(mark);
        marks.push(mark);
      } catch {
        block.classList.add('article-highlight-block');
        block.title = highlight.explanation;
      }
    }

    return () => {
      marks.forEach(mark => mark.replaceWith(...Array.from(mark.childNodes)));
      container.querySelectorAll('.article-highlight-block').forEach(block => {
        block.classList.remove('article-highlight-block');
        block.removeAttribute('title');
      });
      container.normalize();
    };
  }, [attentionAnalysis, settings?.showAttentionHighlights, renderedContentHtml, blockBasedContent]);

  const translationInfo = useMemo(() => {
    if (translationView === 'original' || !bodyTranslationArtifact?.generatedAt) return null;
    const translatedAt = new Date(bodyTranslationArtifact.generatedAt).toLocaleString();
    const provider = bodyTranslationArtifact.provider === 'ai' ? 'AI' : 'Google';
    const language = bodyTranslation?.detectedSourceLanguage
      ? ` \u00b7 ${t('articleReader.detectedLang', { lang: bodyTranslation.detectedSourceLanguage.toUpperCase() })}`
      : '';
    return `${provider} \u7ffb\u8bd1 \u00b7 ${translatedAt}${language}`;
  }, [translationView, bodyTranslationArtifact, bodyTranslation, t]);

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
                {displayedTitle}
              </h1>
              {translatedTitle && translationView !== 'original' && (
                <p className="text-sm text-gray-500 dark:text-gray-400" title="原标题">
                  {article.title}
                </p>
              )}
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

            <div className="flex flex-wrap items-center gap-2">
              {!settings?.enableTranslation && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(chrome.runtime.getURL('options.html#translation-settings'), '_blank')}
                  title="在设置中选择 AI 或 Google 翻译方式"
                >
                  开启翻译
                </Button>
              )}
              {settings?.enableTranslation && translationTargetLanguage && !bodyTranslation && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleTranslateFullArticle()}
                  disabled={isTranslating}
                >
                  {isTranslating ? t('articleReader.translating') : '翻译全文'}
                </Button>
              )}
              {bodyTranslation && (
                <>
                  <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700 p-0.5">
                    {(['original', 'translated', 'bilingual'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setTranslationView(mode)}
                        className={`rounded px-2 py-1 text-xs ${translationView === mode ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-500'}`}
                      >
                        {mode === 'original' ? '原文' : mode === 'translated' ? '中文' : '双语'}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleTranslateFullArticle(true)}
                    disabled={isTranslating}
                  >
                    {isTranslating ? t('articleReader.translating') : '重新翻译'}
                  </Button>
                </>
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

          {articleDocument && (
            <div className="mb-4 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800">
                完整度：{articleDocument.completeness.level === 'high' ? '高' : articleDocument.completeness.level === 'medium' ? '中' : '低'}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800">
                来源：{articleDocument.source === 'fullContent' ? '抓取全文' : articleDocument.source === 'content' ? 'RSS 正文' : 'RSS 摘要'}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800">
                图片：{articleDocument.completeness.imageCount}
              </span>
            </div>
          )}

          {settings?.enableAI && (
            <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI 摘要</h3>
                <Button variant="ghost" size="sm" onClick={handleGenerateSummary} disabled={isSummarizing}>
                  {isSummarizing ? '生成中...' : article.summary ? '重新生成' : '生成摘要'}
                </Button>
              </div>
              {article.summary ? (
                <>
                  {attentionAnalysis && (
                    <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>聚焦阅读约 {attentionAnalysis.readingGuide.estimatedMinutes} 分钟</span>
                      {settings?.showArticleQuality && (
                        <span>质量：{attentionAnalysis.quality.level === 'high' ? '高' : attentionAnalysis.quality.level === 'medium' ? '中' : '低'}</span>
                      )}
                    </div>
                  )}
                  <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                    {article.summary.text.split('\n').map((line, i) => {
                      const trimmed = line.trim();
                      if (!trimmed) return <br key={i} />;
                      if (trimmed.startsWith('- ')) {
                        return <p key={i} className="pl-3 my-0.5 before:content-['•'] before:mr-2 before:text-gray-400">{trimmed.slice(2)}</p>;
                      }
                      return <p key={i} className="my-1">{trimmed}</p>;
                    })}
                  </div>
                  {attentionAnalysis?.overview && (
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">阅读提示：{attentionAnalysis.overview}</p>
                  )}
                  {attentionAnalysis && settings?.showArticleQuality && attentionAnalysis.quality.reasons.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">质量依据：{attentionAnalysis.quality.reasons.join('；')}</p>
                  )}
                  {article.summary.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {article.summary.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-primary-100 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : summaryError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{summaryError}</p>
              ) : (
                <p className="text-sm text-gray-500">点击"生成摘要"按钮获取包含关键观点和正文依据的 AI 摘要。</p>
              )}
            </div>
          )}

          {blockBasedContent ? (
            <article
              ref={contentRef}
              className={`article-content ${FONT_SIZE_CLASS[settings?.fontSize ?? 'medium']}`}
              dangerouslySetInnerHTML={{ __html: blockBasedContent }}
            />
          ) : renderedContentHtml ? (
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

          {Object.keys(failedImages).length > 0 && (
            <div className="mt-4 space-y-2">
              {Object.entries(failedImages).map(([src, alt]) => (
                <div key={src} className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 dark:border-orange-900/60 dark:bg-orange-900/20 dark:text-orange-300">
                  图片加载失败：{alt || '无图片说明'}
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => window.open(src, '_blank')} className="underline">打开原图</button>
                    <button onClick={() => {
                      const image = contentRef.current?.querySelector<HTMLImageElement>(`img[src="${CSS.escape(src)}"]`);
                      if (image) image.src = src;
                      setFailedImages(previous => {
                        const next = { ...previous };
                        delete next[src];
                        return next;
                      });
                    }} className="underline">重试</button>
                  </div>
                </div>
              ))}
            </div>
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
