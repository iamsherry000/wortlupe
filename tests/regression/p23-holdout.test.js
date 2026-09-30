// TH 集外迴歸 round4（P2.3 Tester 第四輪 40 句 WhatsApp）。每一期都要跑。
import { describe, it, expect } from 'vitest';
import { HOLDOUT4 } from './p23-holdout.js';
import { runCase } from './run-case.js';

describe('TH 集外迴歸 round4（P2.3 Tester 40 句）', () => {
  for (const c of HOLDOUT4) it(`TH4 ${c.id ? `#${c.id} ` : ''}${c.text}`, runCase(c));
  it('TH4 題庫完整：40 句', () => expect(HOLDOUT4.length).toBe(40));
});
