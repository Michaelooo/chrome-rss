import { buildBodyTranslationPrompt, buildSummarizePrompt, parseJSONResponse } from './prompts';
import { validateBodyTranslation } from './validation';
import type { ChatMessage } from './client';
import type { AIBenchmarkCaseResult, AIBenchmarkTask } from '@/types/messages';

interface SummarySample {
  id: string;
  title: string;
  content: string;
  anchors: string[][];
}

interface TranslationSample {
  id: string;
  blocks: Array<{ blockId: string; type: string; text: string }>;
  anchors: string[][];
}

export const SUMMARY_BENCHMARK_SAMPLES: SummarySample[] = [
  {
    id: 'summary-battery',
    title: 'Aurora Battery Pilot Cuts Data-Center Backup Costs',
    content: 'Northwind Labs completed a 12-week sodium-ion battery pilot across four data centers. The company installed 48 modules with a combined capacity of 2.4 MWh. Backup-power availability reached 99.98 percent. Diesel-generator runtime fell by 37 percent and maintenance costs fell by 18 percent. The safety review recorded no fires or other safety incidents. Northwind will consider expansion in the fourth quarter after an independent audit.',
    anchors: [['Northwind'], ['12'], ['4', '四'], ['48'], ['2.4'], ['99.98'], ['37'], ['18'], ['无安全事故', '没有安全事故', 'no safety'], ['第四季度', 'Q4'], ['审计']],
  },
  {
    id: 'summary-transit',
    title: 'Cedar City Reports Results From Electric Bus Trial',
    content: 'Cedar City Transit tested 18 electric buses on Route 7 from January 15 through April 15. Ridership increased by 14 percent, while on-time performance improved from 82 percent to 91 percent. The project cost 1.2 million dollars, with 63 percent funded by a regional grant. There was no fare increase. The city council will vote on June 3 after reviewing cold-weather battery performance.',
    anchors: [['Cedar City'], ['18'], ['Route 7'], ['14'], ['82'], ['91'], ['1.2'], ['63'], ['未涨价', '没有涨价', '票价'], ['6月3', 'June 3'], ['低温', '寒冷']],
  },
  {
    id: 'summary-incident',
    title: 'Atlas Sync Publishes May 6 Service Incident Review',
    content: 'Atlas Sync experienced a 47-minute disruption on May 6 beginning at 09:12 UTC and affecting 28 percent of synchronization requests. The cause was a schema migration that omitted cache invalidation. Rollback began at 09:41 UTC and recovery completed at 09:59 UTC. No customer data was lost. The company will add a migration preflight check and cache-invalidation integration test by May 20.',
    anchors: [['Atlas Sync'], ['47'], ['5月6', 'May 6'], ['09:12'], ['28'], ['迁移'], ['缓存失效', '缓存无效'], ['09:41'], ['09:59'], ['无数据丢失', '没有数据丢失'], ['预检'], ['集成测试'], ['5月20', 'May 20']],
  },
];

export const TRANSLATION_BENCHMARK_SAMPLES: TranslationSample[] = [
  {
    id: 'translation-release',
    blocks: [
      { blockId: 'b1', type: 'paragraph', text: 'The Falcon 2.1 release reduced cold-start time from 1.8 seconds to 650 milliseconds.' },
      { blockId: 'b2', type: 'paragraph', text: 'It keeps backward compatibility with the v2 API and requires Node.js 20 or later.' },
      { blockId: 'b3', type: 'paragraph', text: 'Do not translate the command `npm run migrate --dry-run` or the product name Cloud Harbor.' },
    ],
    anchors: [['Falcon 2.1'], ['1.8'], ['650'], ['v2 API'], ['Node.js 20'], ['npm run migrate --dry-run'], ['Cloud Harbor'], ['冷启动'], ['向后兼容', '后向兼容']],
  },
  {
    id: 'translation-trial',
    blocks: [
      { blockId: 'b1', type: 'paragraph', text: 'Although the trial missed its 10% revenue target, churn fell from 4.2% to 3.1%.' },
      { blockId: 'b2', type: 'paragraph', text: 'The team will not expand the trial before the privacy review ends on September 30.' },
    ],
    anchors: [['10%'], ['4.2%'], ['3.1%'], ['流失率'], ['不会扩大', '不扩大'], ['隐私审查', '隐私审核'], ['9月30', 'September 30']],
  },
  {
    id: 'translation-patch',
    blocks: [
      { blockId: 'b1', type: 'paragraph', text: 'Set `retry_after=30`, restart Gateway Pro, and leave the JSON key `user_id` unchanged.' },
      { blockId: 'b2', type: 'paragraph', text: 'Only nodes running version 5.4 or earlier require the patch.' },
    ],
    anchors: [['retry_after=30'], ['Gateway Pro'], ['user_id'], ['5.4'], ['补丁'], ['更早', '以下', '不高于'], ['只有', '仅']],
  },
];

export function getBenchmarkSample(task: AIBenchmarkTask, sampleId: string): SummarySample | TranslationSample | undefined {
  return task === 'summary'
    ? SUMMARY_BENCHMARK_SAMPLES.find(sample => sample.id === sampleId)
    : TRANSLATION_BENCHMARK_SAMPLES.find(sample => sample.id === sampleId);
}

export function buildBenchmarkMessages(task: AIBenchmarkTask, sampleId: string): ChatMessage[] {
  const sample = getBenchmarkSample(task, sampleId);
  if (!sample) throw new Error('未知测试样本');
  if (task === 'summary') {
    const summary = sample as SummarySample;
    return buildSummarizePrompt(summary.title, summary.content);
  }
  return buildBodyTranslationPrompt((sample as TranslationSample).blocks, 'zh-CN');
}

function strictJSON(raw: string): boolean {
  const cleaned = raw.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try {
    JSON.parse(cleaned);
    return true;
  } catch {
    return false;
  }
}

function anchorScore(text: string, anchors: string[][]): number {
  if (anchors.length === 0) return 100;
  const matched = anchors.filter(group => group.some(value => text.toLowerCase().includes(value.toLowerCase()))).length;
  return Math.round(matched / anchors.length * 100);
}

export function evaluateBenchmarkContent(
  provider: { id: string; name: string; model: string },
  task: AIBenchmarkTask,
  sampleId: string,
  attempt: number,
  latencyMs: number,
  content: string
): AIBenchmarkCaseResult {
  const sample = getBenchmarkSample(task, sampleId);
  if (!sample) throw new Error('未知测试样本');
  let productionParsePass = false;
  let structureScore = 0;
  let qualityScore = 0;

  try {
    const parsed = parseJSONResponse<unknown>(content);
    productionParsePass = true;
    if (task === 'summary') {
      const value = parsed as { summary?: unknown; tags?: unknown };
      const summary = typeof value.summary === 'string' ? value.summary : '';
      const tags = Array.isArray(value.tags) ? value.tags.filter(item => typeof item === 'string') as string[] : [];
      structureScore = (summary.trim() ? 60 : 0) + (tags.length >= 3 && tags.length <= 5 ? 40 : 0);
      qualityScore = anchorScore(`${summary}\n${tags.join(' ')}`, (sample as SummarySample).anchors);
    } else {
      const translation = sample as TranslationSample;
      const valid = validateBodyTranslation(parsed, new Set(translation.blocks.map(block => block.blockId)));
      structureScore = Math.round(valid.length / translation.blocks.length * 100);
      qualityScore = anchorScore(valid.map(block => block.translatedText).join('\n'), translation.anchors);
    }
  } catch {
    productionParsePass = false;
  }

  return {
    providerId: provider.id,
    providerName: provider.name,
    model: provider.model,
    task,
    sampleId,
    attempt,
    latencyMs,
    strictJsonPass: strictJSON(content),
    productionParsePass,
    structureScore,
    qualityScore,
    preview: content.length > 1000 ? `${content.slice(0, 1000)}…` : content,
  };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
