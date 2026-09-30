// P2.3：迴歸句組共用的執行器（p22-holdout、chat-style、p23 單元測試共用）。欄位同 p21-holdout.js，另外：
//   cards 的期望可以有 colloquial（口語還原要包含這些）、lowercaseNoun（小寫名詞規則要指向這個名詞）、glossAll（任一義項符合）
import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../../src/tokenize.js';
import { createDictionary } from '../../src/dict.js';
import { analyzeSentence, analyzeWord } from '../../src/grammar/engine.js';
import { buildCard } from '../../src/card-model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fileFetch = async (url) => {
  const body = readFileSync(join(ROOT, url.replace(/^\.?\//, '')), 'utf8');
  return { ok: true, status: 200, text: async () => body };
};
let dictPromise = null;
export function getDict() {
  if (!dictPromise) {
    const dict = createDictionary({ base: './', fetchImpl: fileFetch });
    dictPromise = dict.ready().then(() => dict);
  }
  return dictPromise;
}

export async function prep(text) {
  const dict = await getDict();
  const tokens = tokenize(text);
  await dict.ensure(tokens.filter((t) => t.type === 'word').map((t) => t.text));
  return { dict, tokens };
}
const find = (tokens, word, nth = 0) => tokens.filter((t) => t.type === 'word' && t.text === word)[nth];
const textOf = (m) => `${m.what} ${m.why} ${m.pattern}`;

export async function sentenceMatches(text) {
  const { dict, tokens } = await prep(text);
  const sentences = [...new Set(tokens.filter((t) => t.type === 'word').map((t) => t.sentence))];
  return { sentences, matches: sentences.flatMap((s) => analyzeSentence(tokens, s, dict)) };
}

export async function cardOf(text, word, nth = 0) {
  const { dict, tokens } = await prep(text);
  const tok = find(tokens, word, nth);
  expect(tok, `找不到字 ${word}`).toBeTruthy();
  return buildCard(tokens, tok.index, dict);
}

export function checkCard(card, exp, label) {
  if (exp.notfound) {
    expect(card.status, label).toBe('notfound');
    return;
  }
  if (exp.colloquial) {
    expect(card.colloquial && card.colloquial.expansions, `${label} 口語還原`).toEqual(expect.arrayContaining(exp.colloquial));
    expect(card.status, label).toBe('found');
    if (!exp.lemma) return;
  }
  if (exp.contraction) {
    expect(card.contraction && card.contraction.parts, label).toEqual(exp.contraction);
    return;
  }
  const top = card.readings[0];
  const all = card.readings.map((r) => `${r.lemma}/${r.pos}`).join(', ');
  if (exp.lemma) {
    const ok = [].concat(exp.lemma).map((l) => `${l}/${exp.pos}`);
    expect(ok, `${label}：讀法順序 ${all}`).toContain(top && `${top.lemma}/${top.pos}`);
  }
  const forms = (top.formDescriptions || []).join(' | ');
  if (exp.form) expect(forms, `${label} 的形`).toMatch(exp.form);
  if (exp.notForm) expect(forms, `${label} 的形`).not.toMatch(exp.notForm);
  if (exp.gloss) expect(top.glosses.join(' | '), `${label} 的首要義項`).toMatch(exp.gloss);
  if (exp.firstGloss) expect(top.glosses[0], `${label} 的第一個義項`).toMatch(exp.firstGloss);
  if (exp.notGloss) expect(top.glosses[0], `${label} 的首要義項`).not.toMatch(exp.notGloss);
  if (exp.posLabel) expect(top.posLabel, `${label} 的詞性標籤`).toMatch(exp.posLabel);
  if (exp.notPosLabel) expect(top.posLabel, `${label} 的詞性標籤`).not.toMatch(exp.notPosLabel);
  if (exp.lowercaseNoun) expect(card.lowercaseNoun, `${label} 小寫名詞`).toBe(exp.lowercaseNoun);
}

export function runCase(c) {
  return async () => {
    const { dict, tokens } = await prep(c.text);
    const sentences = [...new Set(tokens.filter((t) => t.type === 'word').map((t) => t.sentence))];
    if (c.sentences) expect(sentences.length, '斷句').toBe(c.sentences);
    const matches = sentences.flatMap((s) => analyzeSentence(tokens, s, dict));
    const ids = matches.map((m) => m.id);
    const seen = matches.map((m) => `${m.id}: ${m.what}`).join('\n');
    for (const r of c.fire || []) expect(ids, `${r} 必須觸發\n${seen}`).toContain(r);
    for (const r of c.not || []) expect(ids, `${r} 不可觸發\n${seen}`).not.toContain(r);
    for (const [r, re] of Object.entries(c.say || {})) {
      const ms = matches.filter((m) => m.id === r);
      expect(ms.length, `${r} 必須觸發\n${seen}`).toBeGreaterThan(0);
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
    for (const [word, exp, nth] of c.cards || []) {
      const tok = find(tokens, word, nth);
      expect(tok, `找不到字 ${word}`).toBeTruthy();
      checkCard(buildCard(tokens, tok.index, dict), exp, word);
    }
    for (const t of tokens.filter((x) => x.type === 'word')) expect(() => buildCard(tokens, t.index, dict)).not.toThrow();
  };
}
