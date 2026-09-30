// TH 集外迴歸（TESTS §0）：P2 Tester 的 81 句抽測＋TC 字卡內容。每一期都要跑。
// 測試名稱：`TH <報告編號> <句子>`、`TC <報告編號> <字>`，對得回 docs/tester/P2-acceptance.md。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../../src/tokenize.js';
import { createDictionary } from '../../src/dict.js';
import { analyzeSentence, analyzeWord } from '../../src/grammar/engine.js';
import { buildCard } from '../../src/card-model.js';
import { HOLDOUT, CARD_TC, RD_PROBE } from './p2-holdout.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fileFetch = async (url) => {
  const body = readFileSync(join(ROOT, url.replace(/^\.?\//, '')), 'utf8');
  return { ok: true, status: 200, text: async () => body };
};
let dict;
beforeAll(async () => {
  dict = createDictionary({ base: './', fetchImpl: fileFetch });
  await dict.ready();
});

async function prep(text) {
  const tokens = tokenize(text);
  await dict.ensure(tokens.filter((t) => t.type === 'word').map((t) => t.text));
  return tokens;
}
const find = (tokens, word, nth = 0) => tokens.filter((t) => t.type === 'word' && t.text === word)[nth];
const textOf = (m) => `${m.what} ${m.why} ${m.pattern}`;

function checkCard(card, exp, label) {
  if (exp.notfound) {
    expect(card.status, label).toBe('notfound');
    expect(card.readings, label).toEqual([]);
    return;
  }
  if (exp.contraction) {
    expect(card.contraction && card.contraction.parts, label).toEqual(exp.contraction);
    // 兩個字各自有解釋（介系詞＋冠詞）
    expect(card.readings.some((r) => r.pos === 'prep' && r.lemma === exp.contraction[0]), `${label} 缺介系詞讀法`).toBe(true);
    expect(card.readings.some((r) => r.pos === 'article'), `${label} 缺冠詞讀法`).toBe(true);
    return;
  }
  const top = card.readings[0];
  const all = card.readings.map((r) => `${r.lemma}/${r.pos}`).join(', ');
  const ok = [].concat(exp.lemma).map((l) => `${l}/${exp.pos}`);
  expect(ok, `${label}：讀法順序 ${all}`).toContain(top && `${top.lemma}/${top.pos}`);
  if (exp.gloss) expect(top.glosses.join(' | '), label).toMatch(exp.gloss);
}

const SUITES = [['TH 集外迴歸（P2 Tester 81 句）', 'TH', HOLDOUT], ['RD 探測（P2.1 修完後另寫）', 'RD', RD_PROBE]];
for (const [title, prefix, list] of SUITES) describe(title, () => {
  for (const c of list) {
    const tag = c.id ? `${c.id} ` : '';
    it(`${prefix} ${tag}${c.text}`, async () => {
      const tokens = await prep(c.text);
      const sentences = [...new Set(tokens.filter((t) => t.type === 'word').map((t) => t.sentence))];
      const matches = sentences.flatMap((s) => analyzeSentence(tokens, s, dict));
      const ids = matches.map((m) => m.id);
      if (c.none) expect(ids, '不可有任何句型規則').toEqual([]);
      for (const r of c.fire || []) expect(ids, `${r} 必須觸發`).toContain(r);
      for (const r of c.not || []) expect(ids, `${r} 不可觸發`).not.toContain(r);
      for (const [r, re] of Object.entries(c.say || {})) {
        const ms = matches.filter((m) => m.id === r);
        expect(ms.length, `${r} 必須觸發`).toBeGreaterThan(0);
        expect(ms.some((m) => re.test(textOf(m))), `${r} 講解要有 ${re}：${ms.map((m) => m.what).join(' / ')}`).toBe(true);
      }
      for (const [r, re] of Object.entries(c.notSay || {})) {
        for (const m of matches.filter((x) => x.id === r)) expect(textOf(m), `${r} 講錯`).not.toMatch(re);
      }
      for (const [word, exp, nth] of c.word || []) {
        const tok = find(tokens, word, nth);
        const wm = analyzeWord(tokens, tok.index, dict);
        const wids = wm.map((m) => m.id);
        for (const r of exp.fire || []) expect(wids, `${word}：${r} 必須觸發`).toContain(r);
        for (const r of exp.not || []) expect(wids, `${word}：${r} 不可觸發`).not.toContain(r);
        for (const m of wm) {
          if (exp.notSay) expect(textOf(m), `${word} ${m.id} 講錯`).not.toMatch(exp.notSay);
        }
        if (exp.say) expect(wm.some((m) => exp.say.test(textOf(m))), `${word} 講解要有 ${exp.say}`).toBe(true);
        if (exp.certain) expect(wm.find((m) => m.id === 'G15').data.certain, `${word} G15 應該能確定`).toBe(true);
      }
      for (const [word, exp] of c.cards || []) {
        const tok = find(tokens, word);
        checkCard(buildCard(tokens, tok.index, dict), exp, word);
      }
      // 不管期望值寫了什麼，所有字的字形規則都不可以丟例外
      for (const t of tokens.filter((x) => x.type === 'word')) expect(() => buildCard(tokens, t.index, dict)).not.toThrow();
    });
  }

});

it('TH 題庫完整：Tester 的 81 句全部在迴歸裡', () => {
  expect(HOLDOUT.length).toBe(81);
});

describe('TC 字卡內容（高頻功能詞首要讀法）', () => {
  for (const c of CARD_TC) {
    it(`TC ${c.id} ${c.word}（${c.text}）`, async () => {
      const tokens = await prep(c.text);
      const tok = find(tokens, c.word);
      checkCard(buildCard(tokens, tok.index, dict), c, c.word);
    });
  }
});
