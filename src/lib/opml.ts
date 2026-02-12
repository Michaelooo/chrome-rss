import type { Feed, Folder } from '@/types';

export interface OpmlFeedEntry {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  category?: string;
}

export interface OpmlFolder {
  name: string;
  feeds: OpmlFeedEntry[];
}

export interface OpmlParseResult {
  folders: OpmlFolder[];
  rootFeeds: OpmlFeedEntry[];
}

const attributeNames = {
  xmlUrl: ['xmlUrl', 'xmlurl', 'xmlURL'],
  htmlUrl: ['htmlUrl', 'htmlurl', 'htmlURL'],
  text: ['text', 'title'],
  category: ['category'],
};

const getAttribute = (element: Element, names: string[]): string | undefined => {
  for (const name of names) {
    const value = element.getAttribute(name);
    if (value) {
      return value.trim();
    }
  }
  return undefined;
};

/** Parses OPML and returns flat feed list (legacy). */
export function parseOpml(opmlString: string): OpmlFeedEntry[] {
  const result = parseOpmlWithStructure(opmlString);
  const feeds: OpmlFeedEntry[] = [...result.rootFeeds];
  for (const folder of result.folders) {
    for (const feed of folder.feeds) {
      feeds.push({ ...feed, category: folder.name });
    }
  }
  return feeds;
}

/** Parses OPML preserving folder hierarchy (two levels: folder -> feeds). */
export function parseOpmlWithStructure(opmlString: string): OpmlParseResult {
  if (typeof DOMParser === 'undefined') {
    throw new Error('无法解析 OPML：当前环境缺少 DOMParser。');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(opmlString, 'text/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('OPML 文件解析失败，请确认文件格式是否正确。');
  }

  const folders: OpmlFolder[] = [];
  const rootFeeds: OpmlFeedEntry[] = [];

  const body = doc.querySelector('body');
  if (!body) return { folders, rootFeeds };

  const rootOutlines = Array.from(body.children).filter(
    el => el.tagName.toLowerCase() === 'outline'
  );

  for (const outline of rootOutlines) {
    const xmlUrl = getAttribute(outline, attributeNames.xmlUrl);
    const text = getAttribute(outline, attributeNames.text) || '';
    const childOutlines = Array.from(outline.children).filter(
      el => el.tagName.toLowerCase() === 'outline'
    );

    if (xmlUrl) {
      rootFeeds.push({
        title: text || xmlUrl,
        xmlUrl,
        htmlUrl: getAttribute(outline, attributeNames.htmlUrl),
        category: getAttribute(outline, attributeNames.category),
      });
    } else if (childOutlines.length > 0 && text) {
      const feeds: OpmlFeedEntry[] = [];
      for (const child of childOutlines) {
        const childXmlUrl = getAttribute(child, attributeNames.xmlUrl);
        if (!childXmlUrl) continue;
        const childText = getAttribute(child, attributeNames.text) || childXmlUrl;
        feeds.push({
          title: childText,
          xmlUrl: childXmlUrl,
          htmlUrl: getAttribute(child, attributeNames.htmlUrl),
          category: getAttribute(child, attributeNames.category),
        });
      }
      if (feeds.length > 0) {
        folders.push({ name: text, feeds });
      }
    }
  }

  return { folders, rootFeeds };
}

const escapeAttribute = (value: string | undefined): string => {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

function formatFeedOutline(feed: Feed, indentLevel: number): string {
  const text = escapeAttribute(feed.title || feed.url);
  const xmlUrl = escapeAttribute(feed.url);
  const htmlUrl = escapeAttribute(feed.link);
  const description = escapeAttribute(feed.description);

  const attributes = [
    'type="rss"',
    `text="${text}"`,
    `title="${text}"`,
    `xmlUrl="${xmlUrl}"`,
  ];

  if (htmlUrl) attributes.push(`htmlUrl="${htmlUrl}"`);
  if (description) attributes.push(`description="${description}"`);

  const pad = '  '.repeat(indentLevel);
  return `${pad}<outline ${attributes.join(' ')} />`;
}

/** Generates OPML with folder structure preserved. */
export function generateOpml(feeds: Feed[], folders: Folder[]): string {
  const now = new Date();
  const dateString = now.toUTCString();

  const feedByFolderId = new Map<string | 'root', Feed[]>();
  feedByFolderId.set('root', []);

  for (const feed of feeds) {
    const key = feed.folderId ?? 'root';
    if (!feedByFolderId.has(key)) {
      feedByFolderId.set(key, []);
    }
    feedByFolderId.get(key)!.push(feed);
  }

  const sortedFolders = [...folders].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const rootFeeds = feedByFolderId.get('root') ?? [];

  const rootFeedsSorted = [...rootFeeds].sort(
    (a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt)
  );

  const lines: string[] = [];

  for (const folder of sortedFolders) {
    const folderFeeds = feedByFolderId.get(folder.id) ?? [];
    const sorted = [...folderFeeds].sort(
      (a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt)
    );
    if (sorted.length === 0) continue;

    const folderName = escapeAttribute(folder.name);
    const feedLines = sorted.map(f => formatFeedOutline(f, 3)).join('\n');
    lines.push('    <outline text="' + folderName + '">');
    lines.push(feedLines);
    lines.push('    </outline>');
  }

  for (const feed of rootFeedsSorted) {
    lines.push(formatFeedOutline(feed, 2));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>RSS Reader Subscriptions</title>
    <dateCreated>${dateString}</dateCreated>
    <dateModified>${dateString}</dateModified>
  </head>
  <body>
${lines.join('\n')}
  </body>
</opml>
`;
}
