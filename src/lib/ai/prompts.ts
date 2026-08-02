import type { ChatMessage } from './client';

const MAX_CONTENT_LENGTH = 6000;

export function buildSummarizePrompt(
  title: string,
  content: string,
  blocks: Array<{ id: string; type: string; text: string }> = []
): ChatMessage[] {
  const truncated = content.length > MAX_CONTENT_LENGTH
    ? content.slice(0, MAX_CONTENT_LENGTH) + '...'
    : content;

  return [
    {
      role: 'system',
      content: `你是一个克制、可核验的信息提取助手。无论文章是什么语言，输出必须全部使用中文。

你的任务是生成结构化摘要，并识别支撑摘要的少量原文依据：

1. summary 字段必须包含以下三个部分，用换行符分隔：
   - 第一段：2-3句话概括文章的核心主题和背景
   - 第二段：列出 4-8 个关键要点，每个要点独占一行，以"- "开头，要点必须包含具体的数据、技术细节、人名或事实
   - 第三段：1-2句话总结文章的结论、影响或意义
2. tags 字段提取 3-5 个关键词标签。
3. highlights 最多 6 处，只选择能支撑关键观点的结论、证据或行动建议。quote 必须逐字复制自对应 block，blockId 必须来自输入；没有带 ID 的 blocks 时返回空数组。
4. quality 和 readingGuide 用于帮助用户判断阅读价值，不要夸大文章质量，也不要让整篇文章都成为重点。

summary 总长度应在 200-500 字之间。只返回纯 JSON，不允许添加 markdown 代码围栏或其他文字：
{"summary":"核心概括\\n\\n- 关键要点\\n\\n结论与意义","tags":[],"overview":"一句话阅读提示","highlights":[{"id":"h1","blockId":"","quote":"","importance":"high|medium|low","category":"conclusion|evidence|action","explanation":"该原文支撑了哪个关键观点"}],"quality":{"level":"high|medium|low","evidenceDensity":"high|medium|low","reasons":[]},"readingGuide":{"estimatedMinutes":1,"priorityBlockIds":[],"skippableBlockIds":[]}}`,
    },
    {
      role: 'user',
      content: JSON.stringify({ title, content: truncated, blocks }),
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


export interface TitleTranslationInput {
  articleId: string;
  title: string;
}

export function buildTitleTranslationPrompt(
  articles: TitleTranslationInput[],
  targetLanguage: string
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是专业标题翻译助手。将输入标题忠实翻译为 ${targetLanguage}，符合中文技术文章标题习惯，保留产品名、模型名和常用技术术语。不得夸张或改写事实。只返回 JSON 数组，每项包含 articleId 和 translatedTitle。`,
    },
    { role: 'user', content: JSON.stringify(articles) },
  ];
}

export function buildBodyTranslationPrompt(
  blocks: Array<{ blockId: string; type: string; text: string }>,
  targetLanguage: string
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是专业文章翻译助手。将每个 block 的 text 忠实、自然地翻译为 ${targetLanguage}。技术术语保持一致，代码内容不要翻译。只返回 JSON 数组，每项严格包含 blockId 和 translatedText，不得遗漏或创造 blockId。`,
    },
    { role: 'user', content: JSON.stringify(blocks) },
  ];
}

export function buildAttentionAnalysisPrompt(
  title: string,
  blocks: Array<{ id: string; type: string; text: string }>
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是克制、可核验的阅读助手。根据带 ID 的原文段落生成中文阅读指南。重点最多 8 处，quote 必须逐字复制自对应 block，blockId 必须来自输入。不要让整篇文章都成为重点。质量只用 high/medium/low，并说明依据。
只返回 JSON：
{"overview":"","tags":[],"highlights":[{"id":"h1","blockId":"","quote":"","importance":"high|medium|low","category":"conclusion|evidence|action","explanation":""}],"quality":{"level":"high|medium|low","evidenceDensity":"high|medium|low","reasons":[]},"readingGuide":{"estimatedMinutes":1,"priorityBlockIds":[],"skippableBlockIds":[]}}`,
    },
    { role: 'user', content: JSON.stringify({ title, blocks }) },
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
