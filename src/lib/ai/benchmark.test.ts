import { describe, expect, it } from 'vitest';
import { evaluateBenchmarkContent, median, SUMMARY_BENCHMARK_SAMPLES, TRANSLATION_BENCHMARK_SAMPLES } from './benchmark';

const provider = { id: 'p', name: 'Provider', model: 'model' };

describe('AI provider benchmark helpers', () => {
  it('uses unique fixed sample ids and block ids', () => {
    const ids = [...SUMMARY_BENCHMARK_SAMPLES, ...TRANSLATION_BENCHMARK_SAMPLES].map(sample => sample.id);
    expect(new Set(ids).size).toBe(ids.length);
    TRANSLATION_BENCHMARK_SAMPLES.forEach(sample => {
      const blockIds = sample.blocks.map(block => block.blockId);
      expect(new Set(blockIds).size).toBe(blockIds.length);
    });
  });

  it('scores summary structure and factual anchors deterministically', () => {
    const content = JSON.stringify({
      summary: 'Northwind Labs 完成 12 周试点。\n\n- 48 个模块，总容量 2.4 MWh\n- 可用性达到 99.98%\n- 柴油运行时间下降 37%\n- 维护成本下降 18%\n\n第四季度将在独立审计后决定扩展。',
      tags: ['电池', '数据中心', '试点'],
    });
    const result = evaluateBenchmarkContent(provider, 'summary', 'summary-battery', 1, 1200, content);
    expect(result.strictJsonPass).toBe(true);
    expect(result.productionParsePass).toBe(true);
    expect(result.structureScore).toBe(100);
    expect(result.qualityScore).toBeGreaterThan(60);
  });

  it('scores translation completeness and protected terms', () => {
    const content = JSON.stringify([
      { blockId: 'b1', translatedText: 'Falcon 2.1 将冷启动时间从 1.8 秒降低到 650 毫秒。' },
      { blockId: 'b2', translatedText: '保持与 v2 API 的向后兼容，并要求 Node.js 20 或更高版本。' },
      { blockId: 'b3', translatedText: '不要翻译命令 npm run migrate --dry-run 或产品名 Cloud Harbor。' },
    ]);
    const result = evaluateBenchmarkContent(provider, 'translation', 'translation-release', 1, 900, content);
    expect(result.structureScore).toBe(100);
    expect(result.qualityScore).toBe(100);
  });

  it('calculates median latency', () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 4, 2, 3])).toBe(3);
  });
});
