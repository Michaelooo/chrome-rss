import type { RSSFeed, RSSItem } from '@/types';

interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  parent?: XmlNode;
  innerXML: string;
  startInner: number;
}

const TOKEN_REGEX = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/g;

export class RSSParser {
  async parse(xmlString: string): Promise<RSSFeed> {
    const doc = parseXmlDocument(xmlString);

    const rssNode = findChild(doc, 'rss');
    if (rssNode) {
      return this.parseRSS(rssNode);
    }

    const atomNode = findChild(doc, 'feed');
    if (atomNode) {
      return this.parseAtom(atomNode);
    }

    throw new Error('Unknown feed format');
  }

  private parseRSS(rssNode: XmlNode): RSSFeed {
    const channel = findChild(rssNode, 'channel');
    if (!channel) {
      throw new Error('Invalid RSS feed: No channel element');
    }

    const title = getTextContent(findChild(channel, 'title')) || '未命名订阅源';
    const description = getInnerHTML(findChild(channel, 'description'));
    const link = getTextContent(findChild(channel, 'link'));

    const items = findChildren(channel, 'item').map(item => this.parseRSSItem(item));

    return {
      title,
      description: description || undefined,
      link,
      items,
    };
  }

  private parseRSSItem(item: XmlNode): RSSItem {
    const title = getTextContent(findChild(item, 'title')) || 'Untitled';
    const link = getTextContent(findChild(item, 'link')) || '';

    const descriptionNode = findChild(item, 'description');
    const contentEncoded = getInnerHTML(findChild(item, 'content:encoded'));
    const contentNode = findChild(item, 'content');

    const description = contentEncoded || getInnerHTML(descriptionNode);
    const content = contentEncoded || getInnerHTML(contentNode);

    const author =
      getTextContent(findChild(item, 'author')) ||
      getTextContent(findChild(item, 'dc:creator'));

    const pubDate = getTextContent(findChild(item, 'pubDate'));
    const guid = getTextContent(findChild(item, 'guid')) || link;

    return {
      title,
      link,
      description: description || undefined,
      content: content || undefined,
      author: author || undefined,
      pubDate,
      guid,
    };
  }

  private parseAtom(feed: XmlNode): RSSFeed {
    const title = getTextContent(findChild(feed, 'title')) || '未命名订阅源';
    const description = getInnerHTML(findChild(feed, 'subtitle'));

    const linkNode =
      findChildren(feed, 'link').find(node => (node.attributes.rel || 'alternate') === 'alternate') ||
      findChild(feed, 'link');
    const link = linkNode?.attributes.href;

    const items = findChildren(feed, 'entry').map(entry => this.parseAtomEntry(entry));

    return {
      title,
      description: description || undefined,
      link,
      items,
    };
  }

  private parseAtomEntry(entry: XmlNode): RSSItem {
    const title = getTextContent(findChild(entry, 'title')) || 'Untitled';

    const linkNode =
      findChildren(entry, 'link').find(node => (node.attributes.rel || 'alternate') === 'alternate') ||
      findChild(entry, 'link');
    const link = linkNode?.attributes.href || '';

    const summary = getInnerHTML(findChild(entry, 'summary'));
    const content = getInnerHTML(findChild(entry, 'content')) || summary;
    const description = content || summary;

    const authorNode = findChild(entry, 'author');
    const author =
      getTextContent(findChild(authorNode, 'name')) ||
      getTextContent(authorNode);

    const published = getTextContent(findChild(entry, 'published'));
    const updated = getTextContent(findChild(entry, 'updated'));
    const pubDate = published || updated;

    const id = getTextContent(findChild(entry, 'id'));
    const guid = id || link;

    return {
      title,
      link,
      description: description || undefined,
      content: content || undefined,
      author: author || undefined,
      pubDate,
      guid,
    };
  }
}

function parseXmlDocument(xml: string): XmlNode {
  TOKEN_REGEX.lastIndex = 0;
  const root: XmlNode = {
    name: '#document',
    attributes: {},
    children: [],
    innerXML: '',
    startInner: 0,
  };

  const stack: XmlNode[] = [root];
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(xml))) {
    const token = match[0];

    if (token.startsWith('<!--') || token.startsWith('<?')) {
      continue;
    }

    if (token.startsWith('</')) {
      const node = stack.pop();
      if (!node || stack.length === 0) {
        continue;
      }
      node.innerXML = xml.slice(node.startInner, match.index);
      continue;
    }

    if (!token.startsWith('<') || token.startsWith('<![CDATA[')) {
      continue;
    }

    const selfClosing = token.endsWith('/>');
    const content = token.slice(1, token.length - (selfClosing ? 2 : 1)).trim();

    if (!content || content.startsWith('!')) {
      continue;
    }

    const spaceIndex = content.search(/\s/);
    const tagName = (spaceIndex === -1 ? content : content.slice(0, spaceIndex)).trim().toLowerCase();
    const attrString = spaceIndex === -1 ? '' : content.slice(spaceIndex + 1).trim();

    const parent = stack[stack.length - 1];
    const node: XmlNode = {
      name: tagName,
      attributes: parseAttributes(attrString),
      children: [],
      parent,
      innerXML: '',
      startInner: TOKEN_REGEX.lastIndex,
    };

    parent.children.push(node);

    if (!selfClosing) {
      stack.push(node);
    }
  }

  return root;
}

function parseAttributes(attrString: string): Record<string, string> {
  if (!attrString) {
    return {};
  }

  const attributes: Record<string, string> = {};
  const attrRegex = /([^\s=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(attrString))) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? '';
    attributes[name] = decodeEntities(value);
  }

  return attributes;
}

function findChild(node: XmlNode | undefined, name: string): XmlNode | undefined {
  const target = name.toLowerCase();
  return node?.children.find(child => child.name === target);
}

function findChildren(node: XmlNode | undefined, name: string): XmlNode[] {
  if (!node) return [];
  const target = name.toLowerCase();
  return node.children.filter(child => child.name === target);
}

function normalizeCData(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, data) => data);
}

function getInnerHTML(node: XmlNode | undefined): string | undefined {
  if (!node) {
    return undefined;
  }

  const normalized = normalizeCData(node.innerXML);
  const decoded = decodeEntities(normalized);
  const trimmed = decoded.trim();
  return trimmed || undefined;
}

function getTextContent(node: XmlNode | undefined): string | undefined {
  const html = getInnerHTML(node);
  if (!html) {
    return undefined;
  }

  const withoutTags = html.replace(/<[^>]*>/g, ' ');
  const text = withoutTags.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return _;
      }
    })
    .replace(/&#(\d+);/g, (_, num) => {
      try {
        return String.fromCodePoint(parseInt(num, 10));
      } catch {
        return _;
      }
    });
}

export const rssParser = new RSSParser();
