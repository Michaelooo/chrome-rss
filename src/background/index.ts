// Background service worker for Chrome extension
import { db, getAllFeeds } from '../lib/storage/db';
import { feedFetcher } from '../lib/fetcher/feed-fetcher';
import { updateUnreadBadge } from '../lib/chrome/badge';

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

  console.log('Feed update alarm created');
}

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('Alarm triggered:', alarm.name);

  if (alarm.name === 'feedUpdate') {
    await updateAllFeeds();
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

  if (message.type === 'TRANSLATE_ARTICLE') {
    handleTranslateArticle(message.payload)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Update a single feed
async function updateSingleFeed(feedId: string) {
  const feed = await db.feeds.get(feedId);
  if (!feed) {
    throw new Error('Feed not found');
  }

  const result = await feedFetcher.updateFeedArticles(feed);
  await updateUnreadBadge();
  return result;
}

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('Service worker started');
  updateUnreadBadge();
});

updateUnreadBadge().catch(console.error);
console.log('Background service worker loaded');

const BLOCK_LEVEL_TAG_REGEX = /<\/(p|div|section|article|header|footer|h[1-6]|ul|ol|li|blockquote|pre|table|tr|td)>/gi;
const BREAK_TAG_REGEX = /<br\s*\/?>/gi;
const SCRIPT_STYLE_REGEX = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_REGEX = /<[^>]+>/g;
const MAX_CHARS_PER_TRANSLATE_CHUNK = 1500;

async function handleTranslateArticle(payload: {
  articleId: string;
  html: string;
  targetLanguage: string;
  sourceLanguage?: string;
}) {
  const { html, targetLanguage, sourceLanguage } = payload;
  if (!html || !targetLanguage) {
    throw new Error('Invalid translation payload.');
  }

  const plainText = normalizeHtmlToText(html);
  if (!plainText) {
    return {
      translatedText: '',
      detectedSourceLanguage: sourceLanguage,
    };
  }

  const chunks = createTextChunks(plainText, MAX_CHARS_PER_TRANSLATE_CHUNK);
  const translatedChunks: string[] = [];
  let detectedSourceLanguage: string | undefined = sourceLanguage;

  for (const chunk of chunks) {
    const result = await translateTextChunk(chunk, targetLanguage, sourceLanguage);
    if (result.detectedSourceLanguage && !detectedSourceLanguage) {
      detectedSourceLanguage = result.detectedSourceLanguage;
    }
    translatedChunks.push(result.text);
    await delay(150);
  }

  const translatedText = joinChunksWithParagraphs(translatedChunks);

  return {
    translatedText,
    detectedSourceLanguage,
  };
}

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

function createTextChunks(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean);
  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  const flushCurrent = () => {
    if (current.length > 0) {
      chunks.push(current.join('\n\n'));
      current = [];
      currentLength = 0;
    }
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flushCurrent();
      const subParagraphs = splitLargeParagraph(paragraph, maxChars);
      chunks.push(...subParagraphs);
      continue;
    }

    const additionLength = currentLength === 0 ? paragraph.length : paragraph.length + 2;
    if (currentLength + additionLength > maxChars) {
      flushCurrent();
    }

    current.push(paragraph);
    currentLength += currentLength === 0 ? paragraph.length : paragraph.length + 2;
  }

  flushCurrent();
  return chunks;
}

function splitLargeParagraph(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) {
    return [paragraph];
  }

  const sentences = paragraph.split(/(?<=[。！？!?\.])\s*/).map(sentence => sentence.trim()).filter(Boolean);
  if (sentences.length === 0) {
    return sliceText(paragraph, maxChars);
  }

  const parts: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + (current ? ' ' : '') + sentence).length > maxChars) {
      if (current) {
        parts.push(current);
      }
      if (sentence.length > maxChars) {
        parts.push(...sliceText(sentence, maxChars));
        current = '';
      } else {
        current = sentence;
      }
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function sliceText(text: string, maxChars: number): string[] {
  const slices: string[] = [];
  let index = 0;
  while (index < text.length) {
    slices.push(text.slice(index, index + maxChars));
    index += maxChars;
  }
  return slices;
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

function joinChunksWithParagraphs(chunks: string[]): string {
  return chunks.join('\n\n').replace(/\n{3,}/g, '\n\n');
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
