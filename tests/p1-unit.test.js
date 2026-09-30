// P1 單元測試（TE 口語組＝TESTS §6）：斷詞、執行期字典（分片）、字卡模型（欄位、候選排序、口語、介系詞）。
// 端對端情境 S01–S08、TN、T6、T8 頁面層在 tests/e2e/（Playwright WebKit）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/tokenize.js';
import { createDictionary } from '../src/dict.js';
import { buildCard } from '../src/card-model.js';
import { createLookup } from '../src/lookup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 用讀檔模擬 fetch，走跟瀏覽器一樣的載入路徑（lexicon＋分片）
const fileFetch = async (url) => {
  const body = readFileSync(join(ROOT, url.replace(/^\.?\//, '')), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};

let dict;
beforeAll(async () => {
  dict = createDictionary({ base: './', fetchImpl: fileFetch });
  await dict.ready();
});

// 在整段文字裡找第 n 個叫 word 的字，組成字卡
async function cardFor(text, word, nth = 0) {
  const tokens = tokenize(text);
  const idx = tokens.filter((t) => t.type === 'word' && t.text === word)[nth].index;
  await dict.ensure(tokens.filter((t) => t.type === 'word').map((t) => t.text));
  return buildCard(tokens, idx, dict);
}
const words = (tokens) => tokens.filter((t) => t.type === 'word').map((t) => t.text);

describe('TN 預先快取清單（service worker）', () => {
  it('TN sw.js 快取清單涵蓋所有執行期檔案，分片數與 src/shard.js 一致', async () => {
    const { SHARD_COUNT, shardName } = await import('../src/shard.js');
    const { existsSync, readdirSync } = await import('node:fs');
    const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
    expect(Number(sw.match(/const SHARD_COUNT = (\d+)/)[1])).toBe(SHARD_COUNT);
    const listed = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
    for (const f of listed) expect(existsSync(join(ROOT, f)), f).toBe(true);
    // 每個 src/ 程式檔、data/ 執行期檔都要在清單裡（不然離線時會缺檔）
    const need = [
      'index.html', 'manifest.webmanifest',
      // P2 起 src/ 有子資料夾（rules/、grammar/），遞迴列出所有檔案
      ...readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => `src/${join(d.parentPath, d.name).slice(join(ROOT, 'src').length + 1).replace(/\\/g, '/')}`),
      'icons/apple-touch-icon.png',
      'data/lexicon.json', 'data/colloquial.json', 'data/prepositions.json', 'data/gloss-overrides.json', 'data/closed-class.json', 'data/lowercase-nouns.json', 'data/runtime/tagsets.json',
      ...Array.from({ length: SHARD_COUNT }, (_, n) => `data/runtime/${shardName(n)}`),
    ];
    const shardsInSw = sw.includes('Array.from({ length: SHARD_COUNT }') ? need.filter((f) => f.startsWith('data/runtime/f-')) : [];
    for (const f of need) expect(listed.includes(f) || shardsInSw.includes(f), `缺 ${f}`).toBe(true);
  });
});

describe('P1 斷詞', () => {
  it('P1 斷詞 ß 與變音字母是字的一部分', () => {
    expect(words(tokenize('Die Straße ist groß, Bäckerei öffnet über Ü.'))).toEqual(['Die', 'Straße', 'ist', 'groß', 'Bäckerei', 'öffnet', 'über', 'Ü']);
  });
  it("P1 斷詞 geht's 是一個字", () => {
    expect(words(tokenize("Wie geht's dir?"))).toEqual(['Wie', "geht's", 'dir']);
  });
  it('P1 斷詞 表情符號、網址、數字不是字（不可點）', () => {
    const t = tokenize('Hallo Jonas 😊 https://x.de 15 Uhr');
    expect(words(t)).toEqual(['Hallo', 'Jonas', 'Uhr']);
    expect(t.find((x) => x.text === '😊').type).toBe('emoji');
    expect(t.find((x) => x.text === 'https://x.de').type).toBe('url');
    expect(t.find((x) => x.text === '15').type).toBe('number');
  });
  it('P1 斷詞 網址不吃掉句尾標點、www 與 email 也算網址', () => {
    const t = tokenize('Schau mal www.dw.com/de. Oder schreib an a.b@web.de!');
    expect(t.filter((x) => x.type === 'url').map((x) => x.text)).toEqual(['www.dw.com/de', 'a.b@web.de']);
  });
  it('P1 斷詞 字與數字黏在一起（B1、3x）整塊不可點', () => {
    const t = tokenize('Kurs B1 und 3x pro Woche');
    expect(words(t)).toEqual(['Kurs', 'und', 'pro', 'Woche']);
  });
  it('P1 斷詞 德英混雜照常斷', () => {
    expect(words(tokenize('Ich hab das Meeting gecancelt.'))).toEqual(['Ich', 'hab', 'das', 'Meeting', 'gecancelt']);
  });
  it('P1 斷詞 句首判斷：句號、問號、驚嘆號、換行之後是句首', () => {
    const t = tokenize('Ich komme. Kommst du?\nMorgen gehe ich! Gut');
    const initial = t.filter((x) => x.type === 'word' && x.sentenceInitial).map((x) => x.text);
    expect(initial).toEqual(['Ich', 'Kommst', 'Morgen', 'Gut']);
  });
  it('P1 斷詞 原文完整保留（含換行），拼回去一字不差', () => {
    const s = 'Hey,\n\nkommst du heut Abend? 😅👍🏽 https://x.de\t15:30';
    expect(tokenize(s).map((x) => x.text).join('')).toBe(s);
  });
});

describe('P1 執行期字典（分片）與 P0 正本一致', () => {
  it('P1 分片查詢結果與 data/forms.json 完全相同（Golden Set A 全部字）', async () => {
    const forms = JSON.parse(readFileSync(join(ROOT, 'data/forms.json'), 'utf8'));
    const lexicon = JSON.parse(readFileSync(join(ROOT, 'data/lexicon.json'), 'utf8'));
    const ref = createLookup({ forms, lexicon });
    const list = ['ging', 'Häusern', 'bessere', 'wurde', 'Kindern', 'gespielt', 'größte', 'las', 'gewusst', 'Männern', 'Gib', 'hätte', 'Vereinigten', 'esse', 'Band', 'Jonas'];
    await dict.ensure(list);
    for (const w of list) {
      const a = ref(w, { sentenceInitial: w === 'Gib' });
      const b = dict.lookup(w, { sentenceInitial: w === 'Gib' });
      const sig = (r) => r.candidates.map((c) => `${c.lemma}|${c.pos}|${c.i}|${c.tags.join(',')}`);
      expect(sig(b), w).toEqual(sig(a));
    }
  });
});

describe('P1 字卡欄位（SPEC §4.1）', () => {
  it('P1 字卡 S01 資料：das Haus、複數 Häuser、house', async () => {
    const c = await cardFor('Das Haus ist groß.', 'Haus');
    const r = c.readings[0];
    expect(r.header).toBe('das Haus');
    expect(r.plural).toContain('Häuser');
    expect(r.glosses.join(' ')).toMatch(/house/);
  });
  it('P1 字卡 S02 資料：gingen → gehen、past tense、to go', async () => {
    const c = await cardFor('Wir gingen nach Hause.', 'gingen');
    const r = c.readings[0];
    expect(r.lemma).toBe('gehen');
    expect(r.formDescriptions.join(' | ')).toMatch(/past tense/);
    expect(r.glosses[0]).toMatch(/to go/);
    expect(r.verb.auxiliary).toContain('sein');
  });
  it('P1 字卡 S03 資料：Bank 同時列 bench 與 bank，兩個都在第一屏', async () => {
    const c = await cardFor('Die Bank ist geschlossen.', 'Bank');
    const main = c.readings.filter((r) => !r.other);
    expect(main.length).toBeGreaterThanOrEqual(2);
    const all = main.flatMap((r) => r.glosses).join(' | ');
    expect(all).toMatch(/bench/);
    expect(all).toMatch(/bank \(financial/);
  });
  it('P1 字卡 查不到只給 Not in dictionary，沒有任何文法欄位（T7）', async () => {
    const c = await cardFor('Hallo Jonas 😊', 'Jonas');
    expect(c.status).toBe('notfound');
    expect(c.readings).toEqual([]);
  });
  it('P1 字卡 冠詞 Die 顯示 "the" 加上這個形的性別、格、數', async () => {
    const c = await cardFor('Die Bank ist geschlossen.', 'Die');
    const art = c.readings.find((r) => r.pos === 'article');
    expect(art.glosses).toEqual(['the']);
    expect(art.formDescriptions.join(' | ')).toMatch(/feminine · nominative · singular/);
    expect(c.readings[0].pos).toBe('article'); // 冠詞讀法排在代名詞前面
  });
  it('P1 字卡 介系詞第 7 欄：mit → Dativ、für → Akkusativ、in → Wechsel、wegen → Genitiv', async () => {
    const cases = { mit: 'Dat', für: 'Akk', in: 'Wechsel', wegen: 'Gen' };
    for (const [w, want] of Object.entries(cases)) {
      const c = await cardFor(`Ich gehe ${w} ihm.`, w);
      const p = c.readings.find((r) => r.pos === 'prep');
      expect(p && p.prepCase, w).toBe(want);
    }
  });
  it('P1 字卡 prepositions.json 恰好收 Charles 指定的 27 個、分類正確', () => {
    const p = JSON.parse(readFileSync(join(ROOT, 'data/prepositions.json'), 'utf8'));
    delete p._說明;
    const by = (c) => Object.keys(p).filter((k) => p[k] === c).sort();
    expect(by('Dat')).toEqual(['aus', 'bei', 'gegenüber', 'mit', 'nach', 'seit', 'von', 'zu'].sort());
    expect(by('Akk')).toEqual(['bis', 'durch', 'für', 'gegen', 'ohne', 'um'].sort());
    expect(by('Wechsel')).toEqual(['an', 'auf', 'hinter', 'in', 'neben', 'unter', 'vor', 'zwischen', 'über'].sort());
    expect(by('Gen')).toEqual(['statt', 'trotz', 'wegen', 'während'].sort());
  });
  it('P1 字卡 動詞欄位：anrufen 可分離 an-、不規則三態、haben', async () => {
    const c = await cardFor('Ich will dich anrufen.', 'anrufen');
    const v = c.readings[0].verb;
    expect(v).toMatchObject({ separable: true, prefix: 'an', irregular: true });
    expect(v.principalParts.participle).toBe('angerufen');
    expect(v.auxiliary).toEqual(['haben']);
  });
  it('P1 字卡 形容詞欄位：gut – besser – am besten', async () => {
    const c = await cardFor('Das ist gut.', 'gut');
    const a = c.readings.find((r) => r.pos === 'adj');
    expect(a.adj).toEqual({ comparative: ['besser'], superlative: ['am besten'] });
  });
});

describe('P1 候選排序（SPEC §3）', () => {
  it('P1 排序 heute 第一個讀法是副詞（不是 heuen 的過去式）', async () => {
    const c = await cardFor('Ich komme heute.', 'heute');
    expect(c.readings[0].lemma).toBe('heute');
    expect(c.readings[0].pos).toBe('adv');
  });
  it('P1 排序 fahren 首要義項含 drive／ride／travel', async () => {
    const c = await cardFor('Wir fahren morgen.', 'fahren');
    const v = c.readings.find((r) => r.lemma === 'fahren' && r.pos === 'verb');
    expect(v.glosses[0]).toMatch(/drive|ride|travel/);
    expect(c.readings[0].lemma).toBe('fahren');
  });
  it('P1 排序 rare 讀法收進「其他讀法」', async () => {
    // spielte 的第二虛擬式在 Wiktionary 標 formal/rare；過去式不 rare → 過去式在主讀法
    const c = await cardFor('Er spielte gestern.', 'spielte');
    const main = c.readings.filter((r) => !r.other);
    expect(main[0].lemma).toBe('spielen');
    expect(main[0].formDescriptions.join(' | ')).toMatch(/past tense/);
    expect(main[0].formDescriptions.join(' | ')).not.toMatch(/rare/);
  });
});

describe('TE 口語組（Golden Set E）', () => {
  const E = [
    ['Hey, kommst du heut Abend? Ich hab nix vor 😅', 'heut', 'heute'],
    ['Hey, kommst du heut Abend? Ich hab nix vor 😅', 'hab', 'habe'],
    ['Hey, kommst du heut Abend? Ich hab nix vor 😅', 'nix', 'nichts'],
    ['Ne, ich kann leider nicht, muss noch arbeiten.', 'Ne', 'Nein'],
    ['Kannste mir kurz helfen?', 'Kannste', 'Kannst du'],
    ['Moin! Wie gehts?', 'gehts', 'geht es'],
  ];
  for (const [text, w, want] of E) {
    it(`TE ${w} → ${want}`, async () => {
      const c = await cardFor(text, w);
      expect(c.colloquial).toBeTruthy();
      expect(c.colloquial.expansions).toContain(want);
      // 還原後的字要查得到（heute → heute、nichts → nichts…），不是只有一行字
      expect(c.status).toBe('found');
    });
  }
  for (const text of ['Alles klar, dann machen wir das so 👍', 'Bis später! 👋']) {
    it(`TE 不壞：${text}`, async () => {
      const t = tokenize(text);
      await dict.ensure(words(t));
      for (const tok of t.filter((x) => x.type === 'word')) expect(() => buildCard(t, tok.index, dict)).not.toThrow();
    });
  }
});

describe('T8 對抗性輸入（斷詞＋字卡層）', () => {
  const inputs = {
    只有表情: '😅😅👍🏽🇩🇪',
    空白: '   \n\t  ',
    純數字: '15 3,50 12:30 2026',
    '2000 字以上': 'Ich gehe heute nach Hause, weil ich müde bin. '.repeat(50),
    德英混雜: 'Ich hab das Meeting gecancelt.',
    荷蘭文: 'Ik ga morgen naar huis.',
    控制字元: 'a\u0000b​c﻿',
  };
  for (const [name, text] of Object.entries(inputs)) {
    it(`T8 ${name} 不會丟例外`, async () => {
      const t = tokenize(text);
      expect(t.map((x) => x.text).join('')).toBe(text);
      await dict.ensure(words(t));
      for (const tok of t.filter((x) => x.type === 'word')) expect(() => buildCard(t, tok.index, dict)).not.toThrow();
    });
  }
  it('T8 荷蘭文 Ik 查不到，不硬湊', async () => {
    const c = await cardFor('Ik ga morgen naar huis.', 'Ik');
    expect(c.status).toBe('notfound');
  });
});
