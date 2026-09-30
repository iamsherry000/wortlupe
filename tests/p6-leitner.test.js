// P6.2 熟悉度（Leitner 盒子，SPEC §5.1 B、TESTS §12「Leitner 規則單元測試」）。假時鐘：日期用整數「第幾天」傳入。
import { describe, it, expect } from 'vitest';
import {
  GROUPS, newCard, answerCard, buildQueue, ReviewSession, dayNumber, NEW_PER_DAY, KNOWN_MAX,
} from '../src/wordbook/leitner.js';

const TODAY = 20000;
const card = (box, extra = {}) => ({ ...newCard(), box, due: box === 0 ? null : TODAY, interval: [0, 1, 3, 7, 21][box], ...extra });

describe('Leitner 五組與間隔', () => {
  it('五組名稱依序 New / Learning / Familiar / Almost / Known', () => {
    expect(GROUPS).toEqual(['New', 'Learning', 'Familiar', 'Almost', 'Known']);
  });

  // 每組 × 三個按鈕：[起始組, 按鈕, 期望組, 期望幾天後到期]
  const table = [
    [0, 'know', 1, 1], [0, 'unsure', 0, 1], [0, 'forgot', 1, 1],
    [1, 'know', 2, 3], [1, 'unsure', 1, 1], [1, 'forgot', 1, 1],
    [2, 'know', 3, 7], [2, 'unsure', 2, 1], [2, 'forgot', 1, 1],
    [3, 'know', 4, 21], [3, 'unsure', 3, 1], [3, 'forgot', 1, 1],
    [4, 'know', 4, 42], [4, 'unsure', 4, 1], [4, 'forgot', 1, 1],
  ];
  for (const [from, grade, to, days] of table) {
    it(`Leitner ${GROUPS[from]} × ${grade} → ${GROUPS[to]}，${days} 天後到期`, () => {
      const after = answerCard(card(from), grade, TODAY);
      expect(after.box).toBe(to);
      expect(after.due).toBe(TODAY + days);
    });
  }

  it('Leitner Known 答對間隔 ×2、上限 180 天', () => {
    let c = card(4);
    const seen = [];
    for (let k = 0; k < 6; k++) {
      c = answerCard(c, 'know', TODAY);
      seen.push(c.interval);
    }
    expect(seen).toEqual([42, 84, 168, 180, 180, 180]);
    expect(KNOWN_MAX).toBe(180);
  });
  it('Leitner Known 答 Not sure 不改間隔（下次答對仍從原間隔 ×2）', () => {
    let c = answerCard(card(4, { interval: 84 }), 'unsure', TODAY);
    expect(c.interval).toBe(84);
    c = answerCard(c, 'know', TODAY);
    expect(c.interval).toBe(168);
  });
  it('Leitner 答過的 New 卡不再算新字（有到期日）', () => {
    const c = answerCard(card(0), 'unsure', TODAY);
    expect(c.box).toBe(0);
    expect(c.due).toBe(TODAY + 1);
  });
});

describe('Leitner 複習順序與每天新字上限', () => {
  const word = (key, cards) => ({ key, cards, createdAt: 0 });
  it('Leitner 到期的舊字先、新字後', () => {
    const words = [
      word('neu1', { fwd: card(0) }),
      word('alt1', { fwd: card(2, { due: TODAY - 1 }) }),
      word('alt2', { fwd: card(3, { due: TODAY }) }),
      word('later', { fwd: card(3, { due: TODAY + 1 }) }),
    ];
    const q = buildQueue(words, TODAY, { introducedToday: 0 });
    expect(q.map((x) => x.key)).toHaveLength(3);
    expect(q.slice(0, 2).map((x) => x.key).sort()).toEqual(['alt1', 'alt2']);
    expect(q[2].key).toBe('neu1');
  });
  it(`Leitner 每天新字上限 ${NEW_PER_DAY}（以字計，一個字的兩個方向算一個）`, () => {
    const words = Array.from({ length: 25 }, (_, k) => word(`w${k}`, { fwd: card(0), rev: card(0) }));
    const q = buildQueue(words, TODAY, { introducedToday: 0 });
    expect(new Set(q.map((x) => x.key)).size).toBe(20);
    expect(q).toHaveLength(40);
    const q2 = buildQueue(words, TODAY, { introducedToday: 15 });
    expect(new Set(q2.map((x) => x.key)).size).toBe(5);
    expect(buildQueue(words, TODAY, { introducedToday: 20 })).toEqual([]);
  });
  it('Leitner 兩個方向混著出，同一個字的兩張卡不相鄰', () => {
    const words = Array.from({ length: 6 }, (_, k) => word(`w${k}`, { fwd: card(0), rev: card(0) }));
    const q = buildQueue(words, TODAY, { introducedToday: 0 });
    expect(new Set(q.map((x) => x.dir))).toEqual(new Set(['fwd', 'rev']));
    for (let k = 1; k < q.length; k++) expect(q[k].key).not.toBe(q[k - 1].key);
  });
  it('Leitner 沒有反向卡的字只出正向', () => {
    const q = buildQueue([word('x', { fwd: card(0) })], TODAY, { introducedToday: 0 });
    expect(q).toEqual([{ key: 'x', dir: 'fwd' }]);
  });
});

describe('Leitner 一次複習（ReviewSession）', () => {
  it('Leitner Forgot 的字當次重出一次且只重出一次', () => {
    const s = new ReviewSession([{ key: 'a', dir: 'fwd' }, { key: 'b', dir: 'fwd' }]);
    let a = card(2);
    a = s.answer('forgot', a, TODAY); // a → Learning，排到最後再出一次
    expect(a.box).toBe(1);
    s.answer('know', card(1), TODAY); // b
    expect(s.current).toEqual({ key: 'a', dir: 'fwd', reshow: true });
    const again = s.answer('forgot', a, TODAY); // 重出那次再忘也不再排
    expect(again).toEqual(a); // 重出只是練習，組別與到期日不變
    expect(s.done).toBe(true);
  });
  it('Leitner 本次複習結束的統計：複習幾個、各組變動幾個', () => {
    const s = new ReviewSession([{ key: 'a', dir: 'fwd' }, { key: 'b', dir: 'rev' }, { key: 'c', dir: 'fwd' }]);
    s.answer('know', card(2), TODAY); // Familiar → Almost
    s.answer('forgot', card(3), TODAY); // Almost → Learning（重出）
    s.answer('unsure', card(1), TODAY); // Learning 不動
    s.answer('know', card(1), TODAY); // b 重出：不算
    const sum = s.summary();
    expect(sum.reviewed).toBe(3);
    expect(sum.up).toBe(1);
    expect(sum.stayed).toBe(1);
    expect(sum.down).toBe(1);
    expect(sum.changes).toEqual({ New: 0, Learning: 1, Familiar: -1, Almost: 0, Known: 0 });
  });
});

describe('dayNumber（本地日期）', () => {
  it('同一天不同時間是同一個數字，隔天 +1', () => {
    const a = dayNumber(new Date(2026, 8, 30, 0, 5));
    const b = dayNumber(new Date(2026, 8, 30, 23, 55));
    const c = dayNumber(new Date(2026, 9, 1, 0, 1));
    expect(a).toBe(b);
    expect(c).toBe(a + 1);
  });
});
