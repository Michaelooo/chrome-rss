import type { ChatMessage } from './client';

const MAX_CONTENT_LENGTH = 6000;

export function buildSummarizePrompt(title: string, content: string): ChatMessage[] {
  const truncated = content.length > MAX_CONTENT_LENGTH
    ? content.slice(0, MAX_CONTENT_LENGTH) + '...'
    : content;

  return [
    {
      role: 'system',
      content: `你是一个专业的信息提取助手。无论文章是什么语言，输出必须全部使用中文。

你的任务是对文章生成一份详细的结构化摘要，要求如下：

1. summary 字段必须包含以下三个部分，用换行符分隔：
   - 第一段：2-3句话概括文章的核心主题和背景
   - 第二段：列出 4-8 个关键要点，每个要点独占一行，以"- "开头，要点必须包含具体的数据、技术细节、人名或事实，不要泛泛而谈
   - 第三段：1-2句话总结文章的结论、影响或意义

2. tags 字段：提取 3-5 个关键词标签

重要：summary 的总长度应在 200-500 字之间，不要过于精简。

以纯 JSON 格式返回，不允许添加 markdown 代码围栏或其他文字：
{"summary": "核心概括（2-3句话）\\n\\n- 要点1（含具体数据或事实）\\n- 要点2\\n- 要点3\\n- 要点4\\n\\n结论与意义", "tags": ["标签1", "标签2", "标签3"]}`,
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
    .replace(/^```[a-z]*\s*\n?/g, '')
    .replace(/\n?```\s*$/g, '')
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
