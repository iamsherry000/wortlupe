// P2.5 TV 涵蓋率（開發用防線，正式 TV 由 Tester 用自己的文本做）：
// tests/fixtures/c1-texts/ 的 RD 自寫 C1 文本（書評、官方信件、職場 email、科普），≥ 1,500 字，
// 扣掉人名、地名、數字（數字本來就不是 word token）後，≥ 97% 查得到原形。
import { describe, it, expect } from 'vitest';
import { coverage } from '../build/coverage.mjs';

describe('TV C1 涵蓋率', () => {
  it('TV 文本 ≥ 1,500 字、四種風格', async () => {
    const r = await coverage();
    expect(r.total).toBeGreaterThanOrEqual(1500);
    expect(r.perFile.length).toBeGreaterThanOrEqual(4);
  });
  it('TV 查得到原形 ≥ 97%', async () => {
    const r = await coverage();
    const msg = `涵蓋率 ${(100 * r.ratio).toFixed(2)}%（${r.found}/${r.total}）；查不到：${r.missing.map(([w]) => w).join(', ')}`;
    console.log(msg);
    expect(r.ratio, msg).toBeGreaterThanOrEqual(0.97);
  });
});
