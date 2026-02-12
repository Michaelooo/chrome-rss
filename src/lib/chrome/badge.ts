import { db } from '../storage/db';

const BADGE_MAX = 9999;

const formatBadgeText = (count: number) => {
  if (count <= 0) return '';
  if (count > BADGE_MAX) {
    return `${BADGE_MAX}+`;
  }
  return `${count}`;
};

export async function updateUnreadBadge(): Promise<void> {
  if (!chrome?.action?.setBadgeText) {
    return;
  }

  const feeds = await db.feeds.toArray();
  const totalUnread = feeds.reduce((sum, feed) => sum + (feed.unreadCount || 0), 0);

  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  await chrome.action.setBadgeText({ text: formatBadgeText(totalUnread) });
}

export async function clearUnreadBadge(): Promise<void> {
  if (!chrome?.action?.setBadgeText) {
    return;
  }

  await chrome.action.setBadgeText({ text: '' });
}
