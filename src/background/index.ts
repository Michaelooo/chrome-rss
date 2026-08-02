// Background service worker for Chrome extension
import { db, getAllFeeds, getSettings, addDigest } from '../lib/storage/db';
import { feedFetcher } from '../lib/fetcher/feed-fetcher';
import { updateUnreadBadge } from '../lib/chrome/badge';
import { getAIConfig, chatCompletion, createAICompletionSession, isArtifactFromConfiguredProvider } from '../lib/ai/client';
import { buildSummarizePrompt, buildDigestPrompt, buildTitleTranslationPrompt, buildBodyTranslationPrompt, buildAttentionAnalysisPrompt, parseJSONResponse } from '../lib/ai/prompts';
import type {
  ArticleArtifact,
  ArticleProcessingJob,
  ArticleSummary,
  BodyTranslationData,
  DigestItem,
  TitleTranslationData,
} from '@/types';
import { hashText } from '@/lib/content/article-document';
import { validateAttentionAnalysis, validateBodyTranslation, validateTitleTranslations } from '@/lib/ai/validation';
import type { ImageRefererRuleRequest } from '@/lib/chrome/image-referer';

// Listen for extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed:', details.reason);

  if (details.reason === 'install') {
    // Set up default alarm for feed updates
    await setupUpdateAlarm();
  }
});

// Set up periodic alarm for feed updates
async function setupUpdateAlarm() {
  // Clear existing alarm
  await chrome.alarms.clear('feedUpdate');

  // Create new alarm - check every 15 minutes
  await chrome.alarms.create('feedUpdate', {
    periodInMinutes: 15,
  });

  // Set up daily digest alarm (every 24 hours)
  await chrome.alarms.clear('dailyDigest');
  await chrome.alarms.create('dailyDigest', {
    periodInMinutes: 1440,
  });

  console.log('Feed update alarm created');
}

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('Alarm triggered:', alarm.name);

  if (alarm.name === 'feedUpdate') {
    await updateAllFeeds();
  }

  if (alarm.name === 'dailyDigest') {
    await generateDailyDigest();
  }
});

// Update all feeds
async function updateAllFeeds(force = false) {
  console.log('Starting feed update...', force ? '(forced)' : '');

  try {
    const feeds = await getAllFeeds();
    let updatedCount = 0;
    let newArticlesCount = 0;

    for (const feed of feeds) {
      // Check if feed needs update based on its update interval
      // force=true 时跳过时间间隔检查
      if (!force) {
        const timeSinceLastFetch = Date.now() - feed.lastFetchTime;
        const updateIntervalMs = feed.updateInterval * 60 * 1000;

        if (timeSinceLastFetch < updateIntervalMs) {
          console.log(`Skipping feed (too recent): ${feed.title}`);
          continue;
        }
      }

      console.log(`Updating feed: ${feed.title}`);
      const result = await feedFetcher.updateFeedArticles(feed);

      if (result.success) {
        updatedCount++;
        newArticlesCount += result.newArticlesCount || 0;
      }

      // Add small delay between requests to avoid overwhelming servers
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Feed update complete. Updated ${updatedCount} feeds, ${newArticlesCount} new articles`);

    await updateUnreadBadge();

    // Notify UI pages to reload feeds
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'FEEDS_UPDATED' }).catch(() => {/* tab may not have listener */});
      }
    }

    // Auto-summarize new articles if AI is enabled
    await autoSummarizeNewArticles();

    // Show notification if there are new articles
    if (newArticlesCount > 0) {
      await showNotification(newArticlesCount);
    }
  } catch (error) {
    console.error('Error updating feeds:', error);
  }
}

// Show notification for new articles
async function showNotification(count: number) {
  // Check if notifications are enabled in settings
  const settings = await db.settings.toArray();
  if (settings.length === 0 || !settings[0].enableNotifications) {
    return;
  }

  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: 'RSS Reader',
    message: `${count} new article${count > 1 ? 's' : ''} available`,
    priority: 1,
  });
}

// Listen for messages from popup/content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Message received:', message);

  if (message.type === 'UPDATE_FEED') {
    updateSingleFeed(message.feedId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'UPDATE_ALL_FEEDS') {
    updateAllFeeds(message.force)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'RESET_ALARM') {
    setupUpdateAlarm()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'TRANSLATE_BODY_GOOGLE') {
    handleTranslateBodyGoogle(message.payload)
      .then(artifact => sendResponse({ success: true, artifact }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'SUMMARIZE_ARTICLE') {
    handleSummarizeArticle(message.payload)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'ENABLE_IMAGE_REFERER') {
    enableImageRefererRule(message as ImageRefererRuleRequest)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'TRANSLATE_TITLES_AI') {
    handleTranslateTitlesAI(message.payload)
      .then(artifacts => sendResponse({ success: true, artifact: artifacts[0], artifacts }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'TRANSLATE_BODY_AI') {
    handleTranslateBodyAI(message.payload)
      .then(artifact => sendResponse({ success: true, artifact }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'ANALYZE_ATTENTION') {
    handleAnalyzeAttention(message.payload)
      .then(artifact => sendResponse({ success: true, artifact }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GENERATE_DIGEST') {
    generateDailyDigest()
      .then(digest => sendResponse({ success: true, digest }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

const IMAGE_REFERER_RULE_ID_MIN = 10000;
const IMAGE_REFERER_RULE_ID_RANGE = 20000;

function hashRuleKey(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return IMAGE_REFERER_RULE_ID_MIN + (hash >>> 0) % IMAGE_REFERER_RULE_ID_RANGE;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function enableImageRefererRule(request: ImageRefererRuleRequest): Promise<void> {
  const { imageUrl, articleUrl } = request.payload;
  if (!isHttpUrl(imageUrl) || !isHttpUrl(articleUrl)) {
    throw new Error('图片或文章地址无效');
  }

  const image = new URL(imageUrl);
  const article = new URL(articleUrl);
  const ruleId = hashRuleKey(`${image.origin}|${article.origin}`);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleId],
    addRules: [{
      id: ruleId,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [{
          header: 'Referer',
          operation: chrome.declarativeNetRequest.HeaderOperation.SET,
          value: article.href,
        }],
      },
      condition: {
        urlFilter: `|${image.origin}/`,
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.IMAGE],
        initiatorDomains: [chrome.runtime.id],
      },
    }],
  });
}


async function updateSingleFeed(feedId: string) {
  const feed = await db.feeds.get(feedId);
  if (!feed) {
    throw new Error('Feed not found');
  }

  const result = await feedFetcher.updateFeedArticles(feed);
  await updateUnreadBadge();
  return result;
}

async function resumeInterruptedJobs(): Promise<void> {
  const interrupted = await db.processingJobs
    .where('status')
    .anyOf(['running', 'paused'])
    .toArray();

  for (const job of interrupted) {
    if (job.type !== 'translate-body' || !job.targetLanguage) {
      await db.processingJobs.update(job.id, {
        status: 'failed',
        lastError: '任务无法恢复：缺少恢复参数',
        updatedAt: Date.now(),
      });
      continue;
    }

    const document = await db.articleDocuments.get(job.articleId);
    if (!document || document.contentHash !== job.contentHash) {
      await db.processingJobs.update(job.id, {
        status: 'failed',
        lastError: '正文已变化，请重新开始翻译',
        updatedAt: Date.now(),
      });
      continue;
    }

    await db.processingJobs.update(job.id, { status: 'paused', updatedAt: Date.now() });
    try {
      const existingArtifact = await db.articleArtifacts.get(job.artifactId);
      const existingData = existingArtifact?.data as BodyTranslationData | undefined;
      if (job.provider === 'google') {
        await handleTranslateBodyGoogle({
          articleId: job.articleId,
          targetLanguage: job.targetLanguage,
          resumeFromBlock: existingData?.completedBlockIds.length || 0,
        });
      } else {
        const resumeFromChunk = existingData?.completedBlockIds.length
          ? chunkBlocks(document.blocks).findIndex(chunk =>
              chunk.some(block => !existingData.completedBlockIds.includes(block.id))
            )
          : 0;
        await handleTranslateBodyAI({
          articleId: job.articleId,
          targetLanguage: job.targetLanguage,
          resumeFromChunk: resumeFromChunk < 0 ? job.totalChunks : resumeFromChunk,
          preferredProviderId: job.aiProviderId,
        });
      }
    } catch (error) {
      console.error(`Failed to resume translation job ${job.id}:`, error);
    }
  }
}

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('Service worker started');
  updateUnreadBadge();
  void resumeInterruptedJobs();
});

updateUnreadBadge().catch(console.error);
resumeInterruptedJobs().catch(console.error);
console.log('Background service worker loaded');

const BLOCK_LEVEL_TAG_REGEX = /<\/(p|div|section|article|header|footer|h[1-6]|ul|ol|li|blockquote|pre|table|tr|td)>/gi;
const BREAK_TAG_REGEX = /<br\s*\/?>/gi;
const SCRIPT_STYLE_REGEX = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_REGEX = /<[^>]+>/g;
function normalizeHtmlToText(html: string): string {
  return html
    .replace(SCRIPT_STYLE_REGEX, '')
    .replace(BLOCK_LEVEL_TAG_REGEX, '\n\n')
    .replace(BREAK_TAG_REGEX, '\n')
    .replace(TAG_REGEX, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const GOOGLE_TRANSLATE_CHUNK_CHARS = 1500;

async function translateGoogleText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<{ text: string; detectedSourceLanguage?: string }> {
  if (text.length <= GOOGLE_TRANSLATE_CHUNK_CHARS) {
    return translateTextChunk(text, targetLanguage, sourceLanguage);
  }

  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += GOOGLE_TRANSLATE_CHUNK_CHARS) {
    chunks.push(text.slice(index, index + GOOGLE_TRANSLATE_CHUNK_CHARS));
  }
  const translated: string[] = [];
  let detectedSourceLanguage: string | undefined;
  for (const chunk of chunks) {
    const result = await translateTextChunk(chunk, targetLanguage, sourceLanguage);
    translated.push(result.text);
    detectedSourceLanguage ||= result.detectedSourceLanguage;
    await delay(150);
  }
  return { text: translated.join(''), detectedSourceLanguage };
}

async function translateTextChunk(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<{ text: string; detectedSourceLanguage?: string }> {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLanguage?.trim() || 'auto',
    tl: targetLanguage,
    dt: 't',
    q: text,
  });

  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Translation request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Unexpected translation response format.');
  }

  const sentences = Array.isArray(data[0]) ? data[0] : [];
  const translated = sentences
    .map((entry: any) => (Array.isArray(entry) && typeof entry[0] === 'string' ? entry[0] : ''))
    .join('')
    .trim();

  const detectedSourceLanguage =
    typeof data[2] === 'string' && data[2].length > 0 ? data[2] : undefined;

  return {
    text: translated,
    detectedSourceLanguage,
  };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const AI_PROMPT_VERSION = 1;
const BODY_TRANSLATION_CHUNK_CHARS = 4500;

function artifactId(articleId: string, kind: ArticleArtifact['kind']): string {
  return `${articleId}|${kind}`;
}

async function createJob(
  articleId: string,
  type: ArticleProcessingJob['type'],
  artifact: ArticleArtifact,
  totalChunks: number,
  targetLanguage?: string,
  nextChunkIndex = 0,
  provider: ArticleArtifact['provider'] = artifact.provider
): Promise<ArticleProcessingJob> {
  const now = Date.now();
  const existing = await db.processingJobs.get(`${articleId}|${type}`);
  if (existing?.status === 'running') {
    throw new Error('该文章已有相同 AI 任务正在执行');
  }
  const runId = crypto.randomUUID();
  const job: ArticleProcessingJob = {
    id: `${articleId}|${type}`,
    articleId,
    type,
    artifactId: artifact.id,
    status: 'running',
    contentHash: artifact.contentHash,
    targetLanguage,
    provider,
    aiProviderId: artifact.aiProviderId,
    aiProviderName: artifact.aiProviderName,
    model: artifact.model,
    runId,
    nextChunkIndex,
    totalChunks,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.processingJobs.put(job);
  return job;
}

async function saveCompletedArtifact<T>(artifact: ArticleArtifact, data: T): Promise<ArticleArtifact> {
  const completed: ArticleArtifact = {
    ...artifact,
    data: data as ArticleArtifact['data'],
    status: 'completed',
    generatedAt: Date.now(),
    updatedAt: Date.now(),
    error: undefined,
  };
  await db.articleArtifacts.put(completed);
  return completed;
}

async function handleTranslateTitlesAI(payload: {
  articles: Array<{ articleId: string; title: string }>;
  targetLanguage: string;
}): Promise<ArticleArtifact[]> {
  const config = await getAIConfig();
  if (!config) throw new Error('AI 未配置，请在设置中启用 AI 并填写 API Key');
  if (!Array.isArray(payload.articles) || !payload.targetLanguage) throw new Error('标题翻译参数无效');

  const input = payload.articles.slice(0, 40).filter(item => item.articleId && item.title.trim());
  const completion = await chatCompletion(
    config,
    buildTitleTranslationPrompt(input, payload.targetLanguage),
    content => {
      const valid = validateTitleTranslations(
        parseJSONResponse<unknown>(content),
        new Set(input.map(item => item.articleId))
      );
      if (valid.length !== input.length) throw new Error('标题翻译结果不完整');
      return valid;
    }
  );
  const valid = completion.value;
  const inputMap = new Map(input.map(item => [item.articleId, item.title]));
  const artifacts: ArticleArtifact[] = [];

  for (const item of valid) {
    const title = inputMap.get(item.articleId) || '';
    const data: TitleTranslationData = {
      originalTitle: title,
      translatedTitle: item.translatedTitle,
    };
    const now = Date.now();
    const artifact: ArticleArtifact = {
      id: artifactId(item.articleId, 'title-translation'),
      articleId: item.articleId,
      kind: 'title-translation',
      titleHash: await hashText(title.trim()),
      targetLanguage: payload.targetLanguage,
      provider: 'ai',
      model: completion.provider.model,
      aiProviderId: completion.provider.id,
      aiProviderName: completion.provider.name,
      promptVersion: AI_PROMPT_VERSION,
      status: 'completed',
      data,
      generatedAt: now,
      updatedAt: now,
    };
    await db.articleArtifacts.put(artifact);
    artifacts.push(artifact);
  }
  return artifacts;
}

function chunkBlocks(
  blocks: Array<{ id: string; type: string; text: string }>
): Array<Array<{ id: string; type: string; text: string }>> {
  const chunks: Array<Array<{ id: string; type: string; text: string }>> = [];
  let current: Array<{ id: string; type: string; text: string }> = [];
  let length = 0;
  for (const block of blocks) {
    if (current.length > 0 && length + block.text.length > BODY_TRANSLATION_CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(block);
    length += block.text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function translateTitleWithAI(
  title: string,
  targetLanguage: string,
  session: ReturnType<typeof createAICompletionSession>
) {
  const completion = await session.complete(
    buildTitleTranslationPrompt([{ articleId: 'current', title }], targetLanguage),
    content => {
      const translatedTitle = validateTitleTranslations(
        parseJSONResponse<unknown>(content),
        new Set(['current'])
      )[0]?.translatedTitle;
      if (!translatedTitle) throw new Error('标题翻译结果为空');
      return translatedTitle;
    }
  );
  return { translatedTitle: completion.value, provider: completion.provider };
}

async function handleTranslateBodyGoogle(payload: {
  articleId: string;
  targetLanguage: string;
  sourceLanguage?: string;
  force?: boolean;
  resumeFromBlock?: number;
}): Promise<ArticleArtifact> {
  const [article, document] = await Promise.all([
    db.articles.get(payload.articleId),
    db.articleDocuments.get(payload.articleId),
  ]);
  if (!article || !document) throw new Error('请先打开文章以准备完整正文');

  const titleHash = await hashText(article.title.trim());
  const existingArtifact = await db.articleArtifacts.get(artifactId(payload.articleId, 'body-translation'));
  const cacheMatches = existingArtifact?.status === 'completed' &&
    existingArtifact.contentHash === document.contentHash &&
    existingArtifact.titleHash === titleHash &&
    existingArtifact.targetLanguage === payload.targetLanguage &&
    existingArtifact.provider === 'google' &&
    existingArtifact.model === 'google-translate';
  if (cacheMatches && !payload.force) return existingArtifact;

  const reusableData = !payload.force &&
    existingArtifact?.contentHash === document.contentHash &&
    existingArtifact.titleHash === titleHash &&
    existingArtifact.targetLanguage === payload.targetLanguage &&
    existingArtifact.provider === 'google'
    ? existingArtifact.data as BodyTranslationData | undefined
    : undefined;
  const titleResult = reusableData?.translatedTitle
    ? { text: reusableData.translatedTitle, detectedSourceLanguage: reusableData.detectedSourceLanguage }
    : await translateGoogleText(article.title, payload.targetLanguage, payload.sourceLanguage);
  const initialData: BodyTranslationData = {
    originalTitle: article.title,
    translatedTitle: titleResult.text,
    detectedSourceLanguage: titleResult.detectedSourceLanguage,
    blocks: reusableData?.blocks || [],
    completedBlockIds: reusableData?.completedBlockIds || [],
    totalBlocks: document.blocks.length,
  };
  const now = Date.now();
  const baseArtifact: ArticleArtifact = {
    id: artifactId(payload.articleId, 'body-translation'),
    articleId: payload.articleId,
    kind: 'body-translation',
    contentHash: document.contentHash,
    titleHash,
    targetLanguage: payload.targetLanguage,
    provider: 'google',
    model: 'google-translate',
    promptVersion: AI_PROMPT_VERSION,
    status: 'running',
    data: initialData,
    updatedAt: now,
  };
  await db.articleArtifacts.put(baseArtifact);
  const startIndex = Math.max(0, Math.min(payload.resumeFromBlock || 0, document.blocks.length));
  const job = await createJob(
    payload.articleId,
    'translate-body',
    baseArtifact,
    document.blocks.length,
    payload.targetLanguage,
    startIndex,
    'google'
  );
  const translatedBlocks = [...initialData.blocks];
  const completedBlockIds = new Set(initialData.completedBlockIds);

  try {
    for (let index = startIndex; index < document.blocks.length; index += 1) {
      const block = document.blocks[index];
      if (!completedBlockIds.has(block.id)) {
        const result = await translateGoogleText(block.text, payload.targetLanguage, payload.sourceLanguage);
        translatedBlocks.push({ blockId: block.id, translatedText: result.text });
        completedBlockIds.add(block.id);
        if (!initialData.detectedSourceLanguage && result.detectedSourceLanguage) {
          initialData.detectedSourceLanguage = result.detectedSourceLanguage;
        }
        await delay(150);
      }
      const partialData: BodyTranslationData = {
        ...initialData,
        blocks: translatedBlocks,
        completedBlockIds: Array.from(completedBlockIds),
      };
      await db.transaction('rw', [db.articleArtifacts, db.processingJobs], async () => {
        const currentJob = await db.processingJobs.get(job.id);
        if (currentJob?.runId !== job.runId) throw new Error('任务已被新的运行替代');
        await db.articleArtifacts.put({ ...baseArtifact, status: 'partial', data: partialData, updatedAt: Date.now() });
        await db.processingJobs.put({
          ...job,
          aiProviderId: baseArtifact.aiProviderId,
          aiProviderName: baseArtifact.aiProviderName,
          model: baseArtifact.model,
          nextChunkIndex: index + 1,
          updatedAt: Date.now(),
        });
      });
    }
    const data: BodyTranslationData = {
      ...initialData,
      blocks: translatedBlocks,
      completedBlockIds: Array.from(completedBlockIds),
    };
    const completed = await saveCompletedArtifact(baseArtifact, data);
    await db.processingJobs.put({
      ...job,
      status: 'completed',
      nextChunkIndex: document.blocks.length,
      updatedAt: Date.now(),
    });
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : '正文翻译失败';
    const partialData: BodyTranslationData = {
      ...initialData,
      blocks: translatedBlocks,
      completedBlockIds: Array.from(completedBlockIds),
    };
    await db.transaction('rw', [db.articleArtifacts, db.processingJobs], async () => {
      const currentJob = await db.processingJobs.get(job.id);
      if (currentJob?.runId !== job.runId) return;
      await db.articleArtifacts.put({
        ...baseArtifact,
        status: translatedBlocks.length > 0 ? 'partial' : 'failed',
        data: partialData,
        error: message,
        updatedAt: Date.now(),
      });
      await db.processingJobs.put({ ...job, status: 'failed', lastError: message, updatedAt: Date.now() });
    });
    throw error;
  }
}

async function handleTranslateBodyAI(payload: {
  articleId: string;
  targetLanguage: string;
  force?: boolean;
  resumeFromChunk?: number;
  preferredProviderId?: string;
}): Promise<ArticleArtifact> {
  const config = await getAIConfig();
  if (!config) throw new Error('AI 未配置，请在设置中启用 AI 并填写 API Key');
  const [article, document] = await Promise.all([
    db.articles.get(payload.articleId),
    db.articleDocuments.get(payload.articleId),
  ]);
  if (!article || !document) throw new Error('请先打开文章以准备完整正文');

  const titleHash = await hashText(article.title.trim());
  const existingArtifact = await db.articleArtifacts.get(artifactId(payload.articleId, 'body-translation'));
  const artifactProviderMatches = existingArtifact
    ? isArtifactFromConfiguredProvider(existingArtifact, config.providers)
    : false;
  const cacheMatches = existingArtifact?.status === 'completed' &&
    existingArtifact.contentHash === document.contentHash &&
    existingArtifact.titleHash === titleHash &&
    existingArtifact.targetLanguage === payload.targetLanguage &&
    existingArtifact.provider === 'ai' &&
    artifactProviderMatches &&
    existingArtifact.promptVersion === AI_PROMPT_VERSION;
  if (cacheMatches && !payload.force) return existingArtifact;

  const reusableData = !payload.force &&
    existingArtifact?.contentHash === document.contentHash &&
    existingArtifact.titleHash === titleHash &&
    existingArtifact.targetLanguage === payload.targetLanguage &&
    existingArtifact.provider === 'ai' &&
    artifactProviderMatches
    ? existingArtifact.data as BodyTranslationData | undefined
    : undefined;
  const session = createAICompletionSession(config, payload.preferredProviderId || existingArtifact?.aiProviderId);
  const titleResult = reusableData?.translatedTitle
    ? {
        translatedTitle: reusableData.translatedTitle,
        provider: session.getActiveProvider() || config.providers[0],
      }
    : await translateTitleWithAI(article.title, payload.targetLanguage, session);
  const translatedTitle = titleResult.translatedTitle;
  const chunks = chunkBlocks(document.blocks);
  const now = Date.now();
  const initialData: BodyTranslationData = {
    originalTitle: article.title,
    translatedTitle,
    detectedSourceLanguage: reusableData?.detectedSourceLanguage,
    blocks: reusableData?.blocks || [],
    completedBlockIds: reusableData?.completedBlockIds || [],
    totalBlocks: document.blocks.length,
  };
  const baseArtifact: ArticleArtifact = {
    id: artifactId(payload.articleId, 'body-translation'),
    articleId: payload.articleId,
    kind: 'body-translation',
    contentHash: document.contentHash,
    titleHash,
    targetLanguage: payload.targetLanguage,
    provider: 'ai',
    model: titleResult.provider.model,
    aiProviderId: titleResult.provider.id,
    aiProviderName: titleResult.provider.name,
    promptVersion: AI_PROMPT_VERSION,
    status: 'running',
    data: initialData,
    updatedAt: now,
  };
  await db.articleArtifacts.put(baseArtifact);
  const resumeFromChunk = Math.max(0, Math.min(payload.resumeFromChunk || 0, chunks.length));
  const job = await createJob(payload.articleId, 'translate-body', baseArtifact, chunks.length, payload.targetLanguage, resumeFromChunk);
  const translatedBlocks: BodyTranslationData['blocks'] = [...initialData.blocks];
  const completedBlockIds = new Set(initialData.completedBlockIds);

  try {
    for (let index = resumeFromChunk; index < chunks.length; index += 1) {
      const chunk = chunks[index].filter(block => !completedBlockIds.has(block.id));
      if (chunk.length > 0) {
        const completion = await session.complete(
          buildBodyTranslationPrompt(
            chunk.map(block => ({ blockId: block.id, type: block.type, text: block.text })),
            payload.targetLanguage
          ),
          content => {
            const translated = validateBodyTranslation(
              parseJSONResponse<unknown>(content),
              new Set(chunk.map(block => block.id))
            );
            if (translated.length !== chunk.length) throw new Error(`第 ${index + 1} 批翻译结果不完整`);
            return translated;
          }
        );
        const translatedChunk = completion.value;
        baseArtifact.model = completion.provider.model;
        baseArtifact.aiProviderId = completion.provider.id;
        baseArtifact.aiProviderName = completion.provider.name;
        translatedBlocks.push(...translatedChunk);
        translatedChunk.forEach(block => completedBlockIds.add(block.blockId));
      }
      const partialData: BodyTranslationData = {
        ...initialData,
        blocks: translatedBlocks,
        completedBlockIds: Array.from(completedBlockIds),
      };
      await db.transaction('rw', [db.articleArtifacts, db.processingJobs], async () => {
        const currentJob = await db.processingJobs.get(job.id);
        if (currentJob?.runId !== job.runId) throw new Error('任务已被新的运行替代');
        await db.articleArtifacts.put({ ...baseArtifact, status: 'partial', data: partialData, updatedAt: Date.now() });
        await db.processingJobs.put({
          ...job,
          aiProviderId: baseArtifact.aiProviderId,
          aiProviderName: baseArtifact.aiProviderName,
          model: baseArtifact.model,
          nextChunkIndex: index + 1,
          updatedAt: Date.now(),
        });
      });
    }
    const data: BodyTranslationData = {
      ...initialData,
      blocks: translatedBlocks,
      completedBlockIds: Array.from(completedBlockIds),
    };
    const completed = await saveCompletedArtifact(baseArtifact, data);
    await db.processingJobs.put({ ...job, status: 'completed', nextChunkIndex: chunks.length, updatedAt: Date.now() });
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : '正文翻译失败';
    const partialData: BodyTranslationData = {
      ...initialData,
      blocks: translatedBlocks,
      completedBlockIds: Array.from(completedBlockIds),
    };
    await db.transaction('rw', [db.articleArtifacts, db.processingJobs], async () => {
      const currentJob = await db.processingJobs.get(job.id);
      if (currentJob?.runId !== job.runId) return;
      await db.articleArtifacts.put({
        ...baseArtifact,
        status: translatedBlocks.length > 0 ? 'partial' : 'failed',
        data: partialData,
        error: message,
        updatedAt: Date.now(),
      });
      await db.processingJobs.put({ ...job, status: 'failed', lastError: message, updatedAt: Date.now() });
    });
    throw error;
  }
}

async function handleAnalyzeAttention(payload: { articleId: string }): Promise<ArticleArtifact> {
  const config = await getAIConfig();
  if (!config) throw new Error('AI 未配置，请在设置中启用 AI 并填写 API Key');
  const [article, document] = await Promise.all([
    db.articles.get(payload.articleId),
    db.articleDocuments.get(payload.articleId),
  ]);
  if (!article || !document) throw new Error('请先打开文章以准备完整正文');

  const blocks = document.blocks.slice(0, 120);
  const completion = await chatCompletion(
    config,
    buildAttentionAnalysisPrompt(article.title, blocks.map(block => ({ id: block.id, type: block.type, text: block.text }))),
    content => validateAttentionAnalysis(
      parseJSONResponse<unknown>(content),
      new Map(blocks.map(block => [block.id, block.text]))
    )
  );
  const data = completion.value;
  const now = Date.now();
  return saveCompletedArtifact({
    id: artifactId(payload.articleId, 'attention-analysis'),
    articleId: payload.articleId,
    kind: 'attention-analysis',
    contentHash: document.contentHash,
    provider: 'ai',
    model: completion.provider.model,
    aiProviderId: completion.provider.id,
    aiProviderName: completion.provider.name,
    promptVersion: AI_PROMPT_VERSION,
    status: 'running',
    updatedAt: now,
  }, data);
}

async function handleSummarizeArticle(payload: { articleId: string }) {
  const config = await getAIConfig();
  if (!config) {
    throw new Error('AI 未配置，请在设置中启用 AI 并填写 API Key');
  }

  const [article, document] = await Promise.all([
    db.articles.get(payload.articleId),
    db.articleDocuments.get(payload.articleId),
  ]);
  if (!article) {
    throw new Error('文章未找到');
  }

  const rawContent = article.content || article.description || '';
  const plainText = document?.blocks.map(block => block.text).join('\n\n') || normalizeHtmlToText(rawContent);
  if (!plainText) {
    throw new Error('文章没有可摘要的内容');
  }

  const blocks = document?.blocks.slice(0, 120) || [];
  const messages = buildSummarizePrompt(
    article.title,
    plainText,
    blocks.map(block => ({ id: block.id, type: block.type, text: block.text }))
  );
  const completion = await chatCompletion(config, messages, content => {
    const parsed = parseJSONResponse<Record<string, unknown>>(content);
    const text = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!text) throw new Error('AI 摘要格式无效');
    return parsed;
  });
  const parsed = completion.value;

  const summary: ArticleSummary = {
    text: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
      : [],
    model: completion.provider.model,
    aiProviderId: completion.provider.id,
    aiProviderName: completion.provider.name,
    generatedAt: Date.now(),
  };
  if (!summary.text) throw new Error('AI 摘要格式无效');

  let artifact: ArticleArtifact | undefined;
  if (document) {
    const data = validateAttentionAnalysis(
      parsed,
      new Map(blocks.map(block => [block.id, block.text]))
    );
    artifact = await saveCompletedArtifact({
      id: artifactId(payload.articleId, 'attention-analysis'),
      articleId: payload.articleId,
      kind: 'attention-analysis',
      contentHash: document.contentHash,
      provider: 'ai',
      model: completion.provider.model,
      aiProviderId: completion.provider.id,
      aiProviderName: completion.provider.name,
      promptVersion: AI_PROMPT_VERSION,
      status: 'running',
      updatedAt: Date.now(),
    }, data);
  }

  await db.articles.update(payload.articleId, { summary });
  return { summary, artifact };
}

// === Auto-summarize after feed update ===

async function autoSummarizeNewArticles() {
  const settings = await getSettings();
  if (!settings.enableAI || !settings.aiAutoSummarize || !(await getAIConfig())) {
    return;
  }

  const cutoff = Date.now() - 15 * 60 * 1000; // last 15 min
  const recentArticles = await db.articles
    .orderBy('pubDate')
    .reverse()
    .limit(100)
    .toArray();

  const toSummarize = recentArticles.filter(
    a => !a.isRead && !a.summary && a.pubDate >= cutoff
  ).slice(0, 20); // max 20 per cycle

  if (toSummarize.length === 0) return;

  console.log(`Auto-summarizing ${toSummarize.length} articles`);

  for (const article of toSummarize) {
    try {
      await handleSummarizeArticle({ articleId: article.id });
      await delay(500);
    } catch (error) {
      console.error(`Failed to summarize article ${article.id}:`, error);
    }
  }
}

// === Daily Digest Handler ===

async function generateDailyDigest() {
  const config = await getAIConfig();
  if (!config) {
    throw new Error('AI 未配置，请在设置中启用 AI 并填写 API Key');
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  const articles = await db.articles
    .where('pubDate')
    .above(cutoff)
    .toArray();

  if (articles.length === 0) {
    throw new Error('过去 24 小时内没有文章，无法生成简报');
  }

  // Build input with feed titles
  const inputArticles = await Promise.all(
    articles.slice(0, 50).map(async (article) => {
      const feed = await db.feeds.get(article.feedId);
      return {
        title: article.title,
        summary: article.summary?.text
          || truncateText(normalizeHtmlToText(article.description || ''), 200),
        feedTitle: feed?.title || 'Unknown',
        feedId: article.feedId,
        articleId: article.id,
        link: article.link,
      };
    })
  );

  const messages = buildDigestPrompt(inputArticles);
  const completion = await chatCompletion(config, messages, content => {
    const items = parseJSONResponse<DigestItem[]>(content);
    if (!Array.isArray(items)) throw new Error('每日简报格式无效');
    return items;
  });
  const items = completion.value;

  await addDigest({
    date: today,
    items,
    model: completion.provider.model,
    aiProviderId: completion.provider.id,
    aiProviderName: completion.provider.name,
    generatedAt: Date.now(),
  });

  const digest = await db.digests
    .where('date')
    .equals(today)
    .reverse()
    .sortBy('generatedAt')
    .then(arr => arr[0]);

  return digest;
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}
