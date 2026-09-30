// P2.2：封閉詞類首要讀法表（TC）、資料健檢（T7：amtshandeln 汙染）、斷句（縮寫／序數）、英文段落偵測。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/tokenize.js';
import { createDictionary } from '../src/dict.js';
import { buildCard } from '../src/card-model.js';
import { analyzeSentence } from '../src/grammar/engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fileFetch = async (url) => {
  const body = readFileSync(join(ROOT, url.replace(/^\.?\//, '')), 'utf8');
  return { ok: true, status: 200, text: async () => body };
};
const CLOSED_PATH = join(ROOT, 'data/closed-class.json');
const closed = existsSync(CLOSED_PATH) ? JSON.parse(readFileSync(CLOSED_PATH, 'utf8')) : { forms: {} };

let dict;
beforeAll(async () => {
  dict = createDictionary({ base: './', fetchImpl: fileFetch });
  await dict.ready();
});
async function card(text, word, nth = 0) {
  const tokens = tokenize(text);
  await dict.ensure(tokens.filter((t) => t.type === 'word').map((t) => t.text));
  const tok = tokens.filter((t) => t.type === 'word' && t.text === word)[nth];
  return buildCard(tokens, tok.index, dict);
}
const sig = (r) => `${r.lemma}/${r.pos}`;

// ---------- 表格本身 ----------
describe('TC closed-class.json 格式', () => {
  it('TC 表格存在，而且涵蓋 Charles 指定的類別', () => {
    expect(existsSync(CLOSED_PATH)).toBe(true);
    const need = [
      'ich', 'mich', 'mir', 'du', 'dich', 'dir', 'er', 'ihn', 'ihm', 'sie', 'es', 'wir', 'uns', 'ihr', 'euch', 'Sie', 'Ihnen',
      'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines', 'dein', 'deine', 'sein', 'seine', 'ihre', 'ihren', 'unser', 'unsere',
      'euer', 'eure', 'euren', 'Ihr', 'Ihre', 'Ihren', 'Ihrem',
      'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines',
      'wo', 'wer', 'wen', 'wem', 'was', 'wann', 'wie', 'warum', 'woher', 'wohin', 'welcher', 'welche', 'welches', 'welchen', 'welchem',
      'und', 'aber', 'oder', 'denn', 'weil', 'dass', 'wenn', 'ob', 'als', 'damit', 'bevor', 'nachdem',
      'noch', 'nur', 'schon', 'leider', 'bitte', 'doch', 'mal', 'ja', 'halt', 'eben', 'auch', 'sehr', 'gern', 'immer', 'oft', 'heute', 'morgen', 'jetzt', 'dann', 'hier', 'da', 'dort',
      'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'zwanzig', 'hundert',
    ];
    const missing = need.filter((k) => !closed.forms[k]);
    expect(missing).toEqual([]);
  });
  it('TC 每一筆都有原形、詞性、這個形、英文，而且不是空的', () => {
    const bad = [];
    for (const [k, list] of Object.entries(closed.forms)) {
      if (!Array.isArray(list) || !list.length) { bad.push(`${k}：空`); continue; }
      for (const r of list) {
        if (r.useDict) continue; // 動詞等開放詞類讀法直接用字典（例 meinen 的 to think）
        for (const f of ['lemma', 'pos', 'form', 'gloss']) if (!r[f]) bad.push(`${k}：缺 ${f}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('TC 有歧義的形列出全部可能：ihr、sie、Sie、meine、sein、das', () => {
    const lemmas = (k) => closed.forms[k].map((r) => `${r.lemma}/${r.pos}`);
    expect(lemmas('ihr')).toEqual(expect.arrayContaining(['ihr/pron', 'sie/pron', 'ihr/det']));
    expect(new Set(closed.forms.sie.map((r) => r.form)).size).toBeGreaterThanOrEqual(2); // she / they
    expect(lemmas('Sie')).toContain('Sie/pron');
    expect(lemmas('meine')).toEqual(expect.arrayContaining(['mein/det', 'meinen/verb']));
    expect(lemmas('sein')).toEqual(expect.arrayContaining(['sein/det', 'sein/verb']));
    expect(lemmas('das')).toEqual(expect.arrayContaining(['der/article', 'das/pron']));
  });
});

// 每一筆一支：放在中性位置（前面 und、後面沒有字），字卡要列出表上每一個讀法，而且第一個＝表上第一個
describe('TC closed-class.json 每一筆', () => {
  for (const [k, list] of Object.entries(closed.forms)) {
    it(`TC ${k}`, async () => {
      const c = await card(`und ${k}`, k);
      const got = c.readings.map(sig);
      if (list[0].pos === 'contraction') { expect(c.contraction && c.contraction.parts, `${k} 縮寫`).toEqual(list[0].parts); return; }
      for (const r of list) expect(got, `${k} 缺讀法 ${r.lemma}/${r.pos}`).toContain(`${r.lemma}/${r.pos}`);
      expect(got[0], `${k} 的首要讀法`).toBe(`${list[0].lemma}/${list[0].pos}`);
      if (!list[0].useDict) expect(c.readings[0].glosses[0]).toBe(list[0].gloss);
    });
  }
});

describe('TC 依句中位置排序', () => {
  const cases = [
    ['Ihr Kind spielt.', 'Ihr', 'ihr/det'], // 後接名詞 → 所有格
    ['Wo wohnt ihr?', 'ihr', 'ihr/pron'],
    ['Ich gebe ihr das Buch.', 'ihr', 'sie/pron'], // 子句已經有主詞 ich → ihr 是「對她」（sie 的第三格）
    ['Gestern habe ich meinen Pass verloren.', 'meinen', 'mein/det'],
    ['Was meinen Sie?', 'meinen', 'meinen/verb'], // 後面不是名詞 → 動詞
    ['Das kann sein.', 'sein', 'sein/verb'],
    ['Das ist sein Auto.', 'sein', 'sein/det'],
    ['Das Haus ist groß.', 'Das', 'der/article'],
    ['Das kriegen wir hin.', 'Das', 'das/pron'], // 後接變位動詞 → 指示代名詞
    ['Sie hat sich die Hände gewaschen.', 'Sie', 'sie/pron'], // 後接第三人稱單數動詞 → she
    ['Kommen Sie morgen?', 'Sie', 'Sie/pron'], // 句中大寫 → 您
    ['Damit kann ich leben.', 'Damit', 'damit/adv'],
    ['Ich spare, damit ich reisen kann.', 'damit', 'damit/conj'],
    ['Das ist zu laut.', 'zu', 'zu/adv'], // 後接形容詞 → too
    ['Ich gehe zu Anna.', 'zu', 'zu/prep'],
  ];
  for (const [text, word, want] of cases) {
    it(`TC 語境 ${text} → ${word} = ${want}`, async () => {
      const c = await card(text, word);
      expect(c.readings.map(sig)[0], c.readings.map(sig).join(', ')).toBe(want);
    });
  }
});

describe('TC 覆蓋率：詞頻前 300 名的封閉詞類全部在表裡', () => {
  it('TC 覆蓋率 前 300 名', () => {
    const forms = JSON.parse(readFileSync(join(ROOT, 'data/forms.json'), 'utf8'));
    const freq = readFileSync(join(ROOT, 'build/raw/de_50k.txt'), 'utf8').split('\n').map((l) => l.split(' ')[0]).filter(Boolean).slice(0, 300);
    const CLOSED_POS = new Set(['pron', 'det', 'article', 'conj', 'num', 'prep', 'particle', 'contraction', 'postp']);
    // 排除：封閉詞類讀法只是古舊／罕用，日常用法是名詞或副詞
    const NOT_CLOSED = new Set(['zeit', 'frau', 'weg']);
    const words = freq.filter((w) => !NOT_CLOSED.has(w) && [...(forms[w] || []), ...(forms[w[0].toUpperCase() + w.slice(1)] || [])].some((r) => CLOSED_POS.has(r.pos)));
    expect(words.length).toBeGreaterThan(100);
    expect(words.filter((w) => !closed.forms[w])).toEqual([]);
  });
});

// ---------- 資料健檢（A5）----------
describe('T7 資料健檢：變化形與原形必須有共同字首／字幹', () => {
  let forms, report;
  beforeAll(() => {
    forms = JSON.parse(readFileSync(join(ROOT, 'data/forms.json'), 'utf8'));
    report = JSON.parse(readFileSync(join(ROOT, 'build/build-report.json'), 'utf8'));
  });
  for (const k of ['e', 'en', 'et', 'est', 'st', 't', 'n', 's', 'St']) {
    it(`T7 「${k}」查不到任何東西`, () => {
      expect(forms[k]).toBeUndefined();
    });
  }
  it('T7 build-report 列出剔除清單與數量，而且是掃過全部 key', () => {
    expect(report.healthCheck).toBeTruthy();
    expect(report.healthCheck.rejectedCount).toBe(report.healthCheck.rejected.length);
    expect(report.healthCheck.rejectedCount).toBeGreaterThan(0);
    expect(report.healthCheck.scannedKeys).toBeGreaterThan(100000);
  });
  it('T7 字典裡的三態（principalParts）都是正常的字，沒有 Main:… 這種汙染', () => {
    const lexicon = JSON.parse(readFileSync(join(ROOT, 'data/lexicon.json'), 'utf8'));
    const bad = [];
    for (const [l, es] of Object.entries(lexicon)) for (const e of es) {
      for (const v of Object.values((e.verb && e.verb.principalParts) || {})) if (!/^[\p{L}' ]+$/u.test(v)) bad.push(`${l}: ${v}`);
    }
    expect(bad).toEqual([]);
  });
  it('T7 已知不規則形沒有被誤剔除（bin、ist、war、besser、best、mehr、meist、gewesen、mir、ihn）', () => {
    // meisten 不在資料裡（Wiktionary 的最高級寫成 am meisten，兩個字），所以只驗 mehr
    const keep = [['bin', 'sein'], ['ist', 'sein'], ['war', 'sein'], ['gewesen', 'sein'], ['besser', 'gut'], ['beste', 'gut'], ['mehr', 'viel'], ['mir', 'ich'], ['ihn', 'er']];
    for (const [f, l] of keep) expect((forms[f] || []).some((r) => r.lemma === l), `${f} → ${l}`).toBe(true);
  });
  // 從剔除清單用固定種子抽 20 筆，RD 逐筆人工看過，確認全部是真的壞資料（抽樣內容見 build/health-sample.json 與 PHASE_LOG）
  it('T7 剔除清單抽樣 20 筆，全部是人工確認過的壞資料', () => {
    const sample = JSON.parse(readFileSync(join(ROOT, 'build/health-sample.json'), 'utf8'));
    expect(sample.items.length).toBe(20);
    expect(sample.items.every((x) => x.verdict === 'bad')).toBe(true);
    const rejected = new Set(report.healthCheck.rejected.map((r) => `${r.form}→${r.lemma}`));
    for (const x of sample.items) {
      expect(rejected.has(`${x.form}→${x.lemma}`), `${x.form}→${x.lemma} 不在剔除清單`).toBe(true);
      expect((forms[x.form] || []).some((r) => r.lemma === x.lemma), `${x.form}→${x.lemma} 還在 forms.json`).toBe(false);
    }
  });
});

// ---------- 斷句（M-e）----------
describe('M-e 斷句：縮寫與序數不是句尾', () => {
  const count = (text) => new Set(tokenize(text).filter((t) => t.type === 'word').map((t) => t.sentence)).size;
  const one = [
    'Bitte senden Sie uns die Unterlagen bis zum 15. Oktober zurück.',
    'Wir wohnen in St. Augustin.',
    'Der Verein ist ein e.V. aus Köln.',
    'Wir brauchen z.B. Milch, Brot usw. für morgen.',
    'Das kostet ca. zehn Euro.',
    'Ich habe einen Termin bei Dr. Weber.',
    'Das Paket hat die Nr. 5 bekommen.',
  ];
  for (const t of one) it(`M-e 一句：${t}`, () => expect(count(t)).toBe(1));
  it('M-e 真的句尾照常斷開', () => {
    expect(count('Ich komme. Du auch? Gut!')).toBe(3);
  });
  it('M-e 縮寫不可點（不是德文字）', () => {
    const t = tokenize('Wir wohnen in St. Augustin, z.B. hier.');
    expect(t.filter((x) => x.type === 'word').map((x) => x.text)).toEqual(['Wir', 'wohnen', 'in', 'Augustin', 'hier']);
  });
});

// ---------- 英文段落（M-f）----------
describe('M-f 英文段落不套德文規則', () => {
  async function ids(text) {
    const tokens = tokenize(text);
    await dict.ensure(tokens.filter((t) => t.type === 'word').map((t) => t.text));
    const ss = [...new Set(tokens.filter((t) => t.type === 'word').map((t) => t.sentence))];
    return ss.flatMap((s) => analyzeSentence(tokens, s, dict)).map((m) => m.id);
  }
  it('M-f I am totally stressed：am 不觸發 G08', async () => {
    expect(await ids('Ich hab heute ein Meeting, I am totally stressed, kannst du später anrufen?')).not.toContain('G08');
  });
  it('M-f 純英文句子：沒有任何規則', async () => {
    expect(await ids('The deadline is tomorrow and I am in the office.')).toEqual([]);
  });
  it('M-f 德文裡夾一個英文字不算英文段落（Ich bin am Meeting 仍觸發 G08）', async () => {
    expect(await ids('Ich bin am Montag im Meeting.')).toContain('G08');
  });
  it('M-f 德文句子不會被誤判成英文（die／was／will／so 是德文字）', async () => {
    expect(await ids('Ich will so gern am Abend kommen, was sagst du?')).toContain('G08');
  });
});
