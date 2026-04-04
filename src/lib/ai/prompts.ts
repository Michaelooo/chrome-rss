import type { ChatMessage } from './client';

const MAX_CONTENT_LENGTH = 3000;

export function buildSummarizePrompt(title: string, content: string): ChatMessage[] {
  const truncated = content.length > MAX_CONTENT_LENGTH
    ? content.slice(0, MAX_CONTENT_LENGTH) + '...'
    : content;

  return [
    {
      role: 'system',
      content: `你是一个信息提取助手。请对以下文章生成：
1. 一段 2-3 句话的核心摘要（只保留最有价值的信息，去掉废话）
2. 3-5 个关键词标签

以纯 JSON 格式返回，不允许添加 markdown 代码围栏或其他文字：
{"summary": "...", "tags": ["...", "..."]}`,
    },
    {
      role: 'user',
      content: `文章标题： ${title}\n\n文章内容: ${truncated}`,
    },
  ];
}



interface DigestInput {
  title: string;
  summary: string;
  feedTitle: string;
  feedId: string;
  articleId: string;
  link: string;
}

export function buildDigestPrompt(articles: DigestInput[]): ChatMessage[] {
  const articlesText = articles
    .map(
      (a, i) =>
        `${i + 1}. ${a.title}\n   摘要: ${a.summary}\n   来源: ${a.feedTitle}`
      )
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是一个信息筛选助手。以下是是过去 24 小时内的 RSS 文章摘要。请从中筛选出 5-10 条最重要的信息，按重要度排序。

对每条信息生成：
- title: 核心要点标题
不要重复原文标题
30- summary: 1-2 句话的要点描述
- feedTitle: 原始来源
- feedId: 来源 ID
- articleId: 原文 ID
- link: 原文链接
- importance: "high" | "medium" | "low"

其中的一个)

以纯 JSON 数组格式返回，不允许添加 markdown 代码围栏或其他文字：`,
    },
    {
      role: 'user',
      content: articlesText,
    },
  ];
}

export function parseJSONResponse<T>(raw: string): T {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```json\s*\n?/g, '')
    .replace(/\n?``$/g, '')
    .trim();

  return JSON.parse(cleaned);
}
