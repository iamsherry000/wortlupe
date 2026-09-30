// TH 集外迴歸 round3（P2.2 Tester 第三輪 62 句）。每一期都要跑。
import { describe, it, expect } from 'vitest';
import { HOLDOUT3 } from './p22-holdout.js';
import { runCase } from './run-case.js';

describe('TH 集外迴歸 round3（P2.2 Tester 62 句）', () => {
  for (const c of HOLDOUT3) it(`TH3 ${c.id ? `${c.id} ` : ''}${c.text}`, runCase(c));
  it('TH3 題庫完整：62 句', () => expect(HOLDOUT3.length).toBe(62));
});
