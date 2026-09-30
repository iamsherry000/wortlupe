// TH 集外迴歸 round2（P2.1 Tester 68 句）＋ T7 round2。每一期都要跑。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../../src/tokenize.js';
import { createDictionary } from '../../src/dict.js';
import { analyzeSentence, analyzeWord } from '../../src/grammar/engine.js';
import { buildCard } from '../../src/card-model.js';
import { HOLDOUT2, T7_ROUND2 } from './p21-holdout.js';

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

export function checkCard(card, exp, label) {
  if (exp.notfound) {
    expect(card.status, label).toBe('notfound');
    expect(card.readings, label).toEqual([]);
    return;
  }
  if (exp.contraction) {
    expect(card.contraction && card.contraction.parts, label).toEqual(exp.contraction);
    return;
  }
  const top = card.readings[0];
  const all = card.readings.map((r) => `${r.lemma}/${r.pos}`).join(', ');
  const ok = [].concat(exp.lemma).map((l) => `${l}/${exp.pos}`);
  expect(ok, `${label}：讀法順序 ${all}`).toContain(top && `${top.lemma}/${top.pos}`);
  const forms = (top.formDescriptions || []).join(' | ');
  if (exp.form) expect(forms, `${label} 的形`).toMatch(exp.form);
  if (exp.notForm) expect(forms, `${label} 的形`).not.toMatch(exp.notForm);
  if (exp.gloss) expect(top.glosses.join(' | '), `${label} 的首要義項`).toMatch(exp.gloss);
  if (exp.notGloss) expect(top.glosses[0], `${label} 的首要義項`).not.toMatch(exp.notGloss);
}

function runCase(c) {
  return async () => {
    const tokens = await prep(c.text);
    const sentences = [...new Set(tokens.filter((t) => t.type === 'word').map((t) => t.sentence))];
    if (c.sentences) expect(sentences.length, '斷句').toBe(c.sentences);
    const matches = sentences.flatMap((s) => analyzeSentence(tokens, s, dict));
    const ids = matches.map((m) => m.id);
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
      for (const m of wm) if (exp.notSay) expect(textOf(m), `${word} ${m.id} 講錯`).not.toMatch(exp.notSay);
      if (exp.say) expect(wm.some((m) => exp.say.test(textOf(m))), `${word} 講解要有 ${exp.say}`).toBe(true);
    }
    for (const [word, exp] of c.cards || []) {
      const tok = find(tokens, word);
      expect(tok, `找不到字 ${word}`).toBeTruthy();
      checkCard(buildCard(tokens, tok.index, dict), exp, word);
    }
    for (const t of tokens.filter((x) => x.type === 'word')) expect(() => buildCard(tokens, t.index, dict)).not.toThrow();
  };
}

describe('TH 集外迴歸 round2（P2.1 Tester 68 句）', () => {
  for (const c of HOLDOUT2) it(`TH2 ${c.id ? `${c.id} ` : ''}${c.text}`, runCase(c));
  it('TH2 題庫完整：68 句', () => expect(HOLDOUT2.length).toBe(68));
});

describe('T7 round2 零編造＋壞資料＋英文段落', () => {
  for (const c of T7_ROUND2) it(`T7r2 ${c.id ? `${c.id} ` : ''}${c.text}`, runCase(c));
});
