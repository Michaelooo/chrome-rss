import type { ChatMessage } from './client';

const MAX_CONTENT_LENGTH = 3000;

export function buildSummarizePrompt(title: string, content: string): ChatMessage[] {
  const truncated = content.length > MAX_CONTENT_LENGTH
    ? content.slice(0, MAX_CONTENT_LENGTH) + '...'
    : content;

  return [
    {
      role: 'system',
      content: `你是一个信息提取助手。无论文章是什么语言，输出必须全部使用中文。请对以下文章生成：
1. 一段 4-6 句话的核心摘要，包含：文章的核心观点、关键数据或事实、结论或影响
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
      content: `你是一个信息筛选助手。以下是过去 24 小时内的 RSS 文章摘要。请从中筛选出 5-10 条最重要的信息，按重要度排序。

对每条信息生成：
- title: 核心要点标题（不要重复原文标题）
- summary: 1-2 句话的要点描述
- feedTitle: 原始来源
- feedId: 来源 ID
- articleId: 原文 ID
- link: 原文链接
- importance: "high" | "medium" | "low"（high=重要, medium=推荐, low=一般）

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

  try {
    return JSON.parse(cleaned);
  } catch {
    // Response may be truncated (finish_reason=length). Try to repair.
    return repairTruncatedJSON<T>(cleaned);
  }
}

function repairTruncatedJSON<T>(raw: string): T {
  // Attempt to find the last complete object in a JSON array
  const lastComplete = raw.lastIndexOf('},');
  if (lastComplete !== -1) {
    const repaired = raw.slice(0, lastComplete + 1) + '\n]';
    try {
      return JSON.parse(repaired);
    } catch {
      // fall through
    }
  }

  // Attempt to close a truncated JSON object
  let obj = raw;
  // Count unclosed braces
  let braces = 0, brackets = 0, inStr = false, escaped = false;
  for (const ch of obj) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }
  // If inside a string, close it
  if (inStr) obj += '"';
  // Remove trailing incomplete value (e.g. `"key": "partial`)
  obj = obj.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, '');
  // Close open structures
  for (let i = 0; i < braces; i++) obj += '}';
  for (let i = 0; i < brackets; i++) obj += ']';

  return JSON.parse(obj);
}
