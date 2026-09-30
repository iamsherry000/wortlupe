// P2 文法規則引擎：TESTS §3 Golden Set G（TG）、§5 T4 可分離動詞、規則目錄結構、講解品質。
// 測試名稱：正向 `G02+ 句子`、負向 `G02- 句子`、T4 `T4+ …`／`T4- …`，對得回 TESTS.md。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/tokenize.js';
import { createDictionary } from '../src/dict.js';
import { analyzeSentence, analyzeWord, RULES } from '../src/grammar/engine.js';
import { buildCard } from '../src/card-model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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
// 第一個有字的句子的句型規則
async function sentenceMatches(text) {
  const tokens = await prep(text);
  const s = tokens.find((t) => t.type === 'word').sentence;
  return { tokens, matches: analyzeSentence(tokens, s, dict) };
}
async function wordMatches(text, word, nth = 0) {
  const tokens = await prep(text);
  const tok = tokens.filter((t) => t.type === 'word' && t.text === word)[nth];
  return { tokens, tok, matches: analyzeWord(tokens, tok.index, dict) };
}
const ids = (ms) => ms.map((m) => m.id);

// ---------- Golden Set G（TESTS §3）----------
// 句型規則（G01–G14，G06 另見 T4）
const SENTENCE_GOLDEN = {
  G01: { pos: ['Morgen gehe ich ins Kino.'], neg: ['Gehst du morgen ins Kino?'] },
  G02: { pos: ['Ich bleibe zu Hause, weil ich krank bin.'], neg: ['Ich bin krank, aber ich komme.', 'Ich komme nicht, denn ich bin krank.'] },
  G03: { pos: ['Das ist der Mann, der hier wohnt.'], neg: ['Der Mann wohnt hier.'] },
  G04: { pos: ['Ich muss heute arbeiten.'], neg: ['Ich muss los.'] },
  G05: { pos: ['Wir sind nach Berlin gefahren.', 'Ich habe das Buch gelesen.'], neg: ['Ich habe ein Auto.'] },
  G07: { pos: ['Ich fahre mit dem Bus.', 'Ich gehe in die Stadt.', 'Ich bin in der Stadt.'], neg: ['Ich lerne, um Geld zu verdienen.'] },
  G08: { pos: ['Ich bin im Büro.'], neg: [] }, // G08 負向另寫（只准在 im 觸發）
  G09: { pos: ['Hast du Zeit?'], neg: ['Was machst du?'] },
  G10: { pos: ['Komm bitte her!', 'Gib mir das Salz.'], neg: ['Kommst du?'] },
  G11: { pos: ['Ich habe keine Zeit.', 'Ich komme nicht.'], neg: ['Nichts ist passiert.'] },
  G12: { pos: ['Ich würde gern kommen.', 'Könnten Sie mir helfen?'], neg: ['Ich konnte nicht kommen.'] },
  G13: { pos: ['Das Haus wird gebaut.'], neg: ['Er wird Lehrer.', 'Ich werde morgen kommen.'] },
  G14: { pos: ['Ich habe keine Lust, heute zu kochen.'], neg: ['Ich gehe zu Anna.', 'Ich fahre zum Bahnhof.'] },
};
// 字形規則（G15–G20）：[句子, 目標字]
const WORD_GOLDEN = {
  G15: { pos: [['Ich gebe dem Mann das Buch.', 'dem']], neg: [] }, // G15 負向另寫（必須列可能性、不可斷言）
  G16: { pos: [['ein großer Mann', 'großer'], ['mit dem großen Mann', 'großen']], neg: [] },
  G17: { pos: [['die Zeitung', 'Zeitung'], ['das Mädchen', 'Mädchen']], neg: [['der Sprung', 'Sprung']] },
  G18: { pos: [['Du fährst morgen.', 'fährst']], neg: [] },
  G19: { pos: [['mit den Kindern', 'Kindern']], neg: [] },
  G20: { pos: [['das Auto des Mannes', 'Mannes']], neg: [] },
};

const positiveResults = [];
const negativeResults = [];

describe('TG 句型規則（Golden Set G，G01–G14）', () => {
  for (const [id, { pos, neg }] of Object.entries(SENTENCE_GOLDEN)) {
    for (const text of pos) {
      it(`${id}+ ${text}`, async () => {
        const { matches } = await sentenceMatches(text);
        positiveResults.push(ids(matches).includes(id));
        expect(ids(matches), text).toContain(id);
      });
    }
    for (const text of neg) {
      it(`${id}- ${text}`, async () => {
        const { matches } = await sentenceMatches(text);
        negativeResults.push(!ids(matches).includes(id));
        expect(ids(matches), text).not.toContain(id);
      });
    }
  }

  it('G08- Wir essen im Imbiss.（只能在 im 觸發，不可在 Imbiss 內部觸發）', async () => {
    const { tokens, matches } = await sentenceMatches('Wir essen im Imbiss.');
    const g08 = matches.filter((m) => m.id === 'G08');
    const marked = g08.flatMap((m) => m.marks.map((k) => tokens[k.index].text));
    negativeResults.push(!marked.includes('Imbiss'));
    expect(g08.length).toBe(1);
    expect(marked).not.toContain('Imbiss');
    expect(marked).toContain('im');
  });

  it('G02 S09：講解引用 weil 與 bin，並標記 bin 在從句句尾', async () => {
    const { tokens, matches } = await sentenceMatches('Ich bleibe zu Hause, weil ich krank bin.');
    expect(ids(matches)).toEqual(expect.arrayContaining(['G01', 'G02']));
    const g02 = matches.find((m) => m.id === 'G02');
    expect(g02.what).toContain('“weil”');
    expect(g02.what).toContain('“bin”');
    const bin = tokens.find((t) => t.text === 'bin');
    expect(g02.marks).toContainEqual({ index: bin.index, kind: 'end-verb' });
    const weil = tokens.find((t) => t.text === 'weil');
    expect(g02.marks).toContainEqual({ index: weil.index, kind: 'clause' });
  });

  it('G05 fahren 用 sein，講解說明移動', async () => {
    const { matches } = await sentenceMatches('Wir sind nach Berlin gefahren.');
    const m = matches.find((x) => x.id === 'G05');
    expect(m.what).toContain('“sind”');
    expect(m.what).toContain('“gefahren”');
    expect(m.why).toMatch(/movement|place to another/i);
  });

  it('G07 Wechsel：in die Stadt → accusative（方向）、in der Stadt → dative（位置）', async () => {
    const a = (await sentenceMatches('Ich gehe in die Stadt.')).matches.find((m) => m.id === 'G07');
    const d = (await sentenceMatches('Ich bin in der Stadt.')).matches.find((m) => m.id === 'G07');
    expect(a.data.case).toBe('acc');
    expect(d.data.case).toBe('dat');
    expect(a.what).toMatch(/accusative/);
    expect(d.what).toMatch(/dative/);
  });

  it('S10 Alles klar 👍 → 沒有任何規則命中', async () => {
    const { matches } = await sentenceMatches('Alles klar 👍');
    expect(matches).toEqual([]);
  });
});

describe('TG 字形規則（Golden Set G，G15–G20）', () => {
  for (const [id, { pos, neg }] of Object.entries(WORD_GOLDEN)) {
    for (const [text, word] of pos) {
      it(`${id}+ ${text} → ${word}`, async () => {
        const { matches } = await wordMatches(text, word);
        positiveResults.push(ids(matches).includes(id));
        expect(ids(matches), `${text} / ${word}`).toContain(id);
      });
    }
    for (const [text, word] of neg) {
      it(`${id}- ${text} → ${word}`, async () => {
        const { matches } = await wordMatches(text, word);
        negativeResults.push(!ids(matches).includes(id));
        expect(ids(matches)).not.toContain(id);
      });
    }
  }

  it('G15+ dem = 陽性第三格，因為是 geben 的間接受詞', async () => {
    const { matches } = await wordMatches('Ich gebe dem Mann das Buch.', 'dem');
    const m = matches.find((x) => x.id === 'G15');
    expect(m.data.certain).toBe(true);
    expect(m.data.options).toEqual([{ gender: 'm', case: 'dat', number: 'sg' }]);
    expect(m.what).toMatch(/masculine/);
    expect(m.what).toMatch(/dative/);
    expect(m.why).toContain('“gebe”');
  });

  for (const nth of [0, 1]) {
    it(`G15- Die Frau sieht die Kinder.（第 ${nth + 1} 個 die：必須列出可能性，不可斷言）`, async () => {
      const { matches } = await wordMatches('Die Frau sieht die Kinder.', nth === 0 ? 'Die' : 'die', 0);
      const m = matches.find((x) => x.id === 'G15');
      negativeResults.push(!!m && m.data.certain === false);
      expect(m).toBeTruthy();
      expect(m.data.certain).toBe(false);
      expect(m.data.options.length).toBeGreaterThan(1);
      expect(m.what).toMatch(/nominative/);
      expect(m.what).toMatch(/accusative/);
      expect(m.what).toMatch(/can't tell|cannot tell|doesn't decide|does not decide/);
    });
  }

  it('G16 ein großer Mann：mixed、陽性主格、-er', async () => {
    const m = (await wordMatches('ein großer Mann', 'großer')).matches.find((x) => x.id === 'G16');
    expect(m.data).toMatchObject({ declension: 'mixed', gender: 'm', case: 'nom', number: 'sg', ending: 'er' });
  });
  it('G16 mit dem großen Mann：weak、-en', async () => {
    const m = (await wordMatches('mit dem großen Mann', 'großen')).matches.find((x) => x.id === 'G16');
    expect(m.data).toMatchObject({ declension: 'weak', gender: 'm', case: 'dat', number: 'sg', ending: 'en' });
  });
  it('G18 fährst：du -st＋a→ä', async () => {
    const m = (await wordMatches('Du fährst morgen.', 'fährst')).matches.find((x) => x.id === 'G18');
    expect(m.data.ending).toBe('st');
    expect(m.data.vowelChange).toBe('a→ä');
    expect(m.what).toContain('“fährst”');
  });

  // 自訂負向（Golden Set 沒列，照「負向與正向同等份量」補）
  const EXTRA_NEG = [
    ['G18', 'Ich bin müde.', 'bin'], // 不規則，不可硬套詞尾
    ['G18', 'Er kann schwimmen.', 'kann'], // 情態動詞單數沒有 -t
    ['G19', 'mit den Frauen', 'Frauen'], // 複數已經以 -n 結尾，沒有多加
    ['G19', 'mit den Autos', 'Autos'], // 複數 -s 不加 -n
    ['G20', 'der Mann', 'Mann'],
    ['G17', 'das Zeichen', 'Zeichen'], // -chen 不是指小詞尾
    ['G17', 'der Kuchen', 'Kuchen'],
    ['G16', 'Das Haus ist groß.', 'groß'], // 沒有詞尾
    ['G15', 'Ich sehe die.', 'die'], // 後面沒有名詞，不判斷
  ];
  for (const [id, text, word] of EXTRA_NEG) {
    it(`${id}- ${text} → ${word}（自訂負向）`, async () => {
      const { matches } = await wordMatches(text, word);
      negativeResults.push(!ids(matches).includes(id));
      expect(ids(matches)).not.toContain(id);
    });
  }
});

// ---------- T4 可分離動詞（TESTS §5，G06 共用）----------
const T4_POS = [
  ['Ich stehe um sieben Uhr auf.', 'stehe', 'auf', 'aufstehen'],
  ['Rufst du mich morgen an?', 'Rufst', 'an', 'anrufen'],
  ['Der Zug fährt gleich ab.', 'fährt', 'ab', 'abfahren'],
  ['Mach bitte das Fenster zu.', 'Mach', 'zu', 'zumachen'],
  ['Ich kaufe heute Nachmittag ein.', 'kaufe', 'ein', 'einkaufen'],
  ['Wann fängt der Film an?', 'fängt', 'an', 'anfangen'],
];
const T4_NEG = [
  ['Ich verstehe das nicht.', 'verstehe', 'verstehen'],
  ['Er bekommt ein Paket.', 'bekommt', 'bekommen'],
  ['Sie erzählt eine Geschichte.', 'erzählt', 'erzählen'],
  ['Das Auto ist teuer, aber schön.', 'aber', null],
  ['..., weil ich um sieben aufstehe.', 'aufstehe', 'aufstehen'],
];
const t4 = { hit: 0, total: 0, wrongSplit: 0 };

describe('T4 可分離動詞（Golden Set D）', () => {
  for (const [text, verb, prefix, lemma] of T4_POS) {
    it(`T4+ ${text} → ${lemma}`, async () => {
      const { tokens, matches } = await sentenceMatches(text);
      const g06 = matches.filter((m) => m.id === 'G06');
      t4.total++;
      const ok = g06.length === 1 && g06[0].data.verb === lemma
        && tokens[g06[0].data.verbIndex].text === verb && tokens[g06[0].data.prefixIndex].text === prefix;
      if (ok) t4.hit++;
      expect(g06.map((m) => m.data.verb)).toEqual([lemma]);
      expect(tokens[g06[0].data.verbIndex].text).toBe(verb);
      expect(tokens[g06[0].data.prefixIndex].text).toBe(prefix);
      // 字卡也要提示（點動詞或點前綴都要）
      for (const idx of [g06[0].data.verbIndex, g06[0].data.prefixIndex]) {
        const card = buildCard(tokens, idx, dict);
        expect(card.separable && card.separable.verb).toBe(lemma);
      }
    });
  }
  for (const [text, word, lemma] of T4_NEG) {
    it(`T4- ${text}（${word} 不可重組）`, async () => {
      const { tokens, matches } = await sentenceMatches(text);
      const g06 = matches.filter((m) => m.id === 'G06');
      if (g06.length) t4.wrongSplit++;
      expect(g06).toEqual([]);
      const tok = tokens.find((t) => t.text === word);
      const card = buildCard(tokens, tok.index, dict);
      expect(card.separable).toBeNull();
      if (lemma) expect(card.readings[0].lemma).toBe(lemma);
    });
  }
  it('T4 門檻：重組 ≥ 90%，誤拆 = 0', () => {
    expect(t4.total).toBe(T4_POS.length);
    expect(t4.hit / t4.total).toBeGreaterThanOrEqual(0.9);
    expect(t4.wrongSplit).toBe(0);
  });
});

describe('TG 門檻（TESTS §0）', () => {
  it('TG 正向命中率 ≥ 90%', () => {
    expect(positiveResults.length).toBeGreaterThanOrEqual(20);
    expect(positiveResults.filter(Boolean).length / positiveResults.length).toBeGreaterThanOrEqual(0.9);
  });
  it('TG 負向 100% 不可誤觸發', () => {
    expect(negativeResults.length).toBeGreaterThanOrEqual(15);
    expect(negativeResults.every(Boolean)).toBe(true);
  });
});

// ---------- 規則目錄（SPEC §4.2：一條規則＝一個檔案）----------
describe('P2 規則目錄可擴充', () => {
  it('P2 目錄 src/rules/ 下 G01–G20 各一個模組，id 不重複', () => {
    const files = readdirSync(join(ROOT, 'src/rules')).filter((f) => /^g\d\d-.*\.js$/.test(f));
    expect(files.length).toBe(20);
    const got = RULES.map((r) => r.id).sort();
    expect(got).toEqual(Array.from({ length: 20 }, (_, k) => `G${String(k + 1).padStart(2, '0')}`));
  });
  it('P2 目錄 每條規則都有 id、level、title、detect、正向與負向例句', () => {
    for (const r of RULES) {
      expect(r.id).toMatch(/^G\d\d$/);
      expect(['sentence', 'word']).toContain(r.level);
      expect(typeof r.title).toBe('string');
      expect(typeof r.detect).toBe('function');
      expect(r.examples.positive.length, r.id).toBeGreaterThan(0);
      expect(r.examples.negative.length, r.id).toBeGreaterThan(0);
    }
    expect(RULES.filter((r) => r.level === 'sentence').map((r) => r.id)).toEqual(
      ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'G12', 'G13', 'G14']);
  });
  it('P2 目錄 每條規則自己的例句：正向命中、負向不觸發', async () => {
    for (const r of RULES) {
      for (const ex of r.examples.positive) {
        const m = r.level === 'sentence' ? (await sentenceMatches(ex.text)).matches : (await wordMatches(ex.text, ex.target)).matches;
        expect(ids(m), `${r.id}+ ${ex.text}`).toContain(r.id);
      }
      for (const ex of r.examples.negative) {
        let m = r.level === 'sentence' ? (await sentenceMatches(ex.text)).matches : (await wordMatches(ex.text, ex.target)).matches;
        if (ex.allowUncertain) m = m.filter((x) => x.data && x.data.certain);
        expect(ids(m), `${r.id}- ${ex.text}`).not.toContain(r.id);
      }
    }
  });
});

// ---------- 講解品質 ----------
describe('P2 講解品質（What → Why → Pattern）', () => {
  const samples = [
    ...Object.values(SENTENCE_GOLDEN).flatMap((g) => g.pos.map((t) => ({ text: t }))),
    ...T4_POS.map(([t]) => ({ text: t })),
    ...Object.values(WORD_GOLDEN).flatMap((g) => g.pos.map(([t, w]) => ({ text: t, word: w }))),
    { text: 'Die Frau sieht die Kinder.', word: 'die' },
  ];
  it('P2 講解 每條命中都有 What／Why／Pattern，What 用 “ ” 引用句中的字', async () => {
    let checked = 0;
    for (const s of samples) {
      const { tokens, matches } = s.word ? await wordMatches(s.text, s.word) : await sentenceMatches(s.text);
      const words = new Set(tokens.filter((t) => t.type === 'word').map((t) => t.text));
      for (const m of matches) {
        checked++;
        for (const k of ['what', 'why', 'pattern']) expect(typeof m[k] === 'string' && m[k].length > 0, `${m.id} ${k}`).toBe(true);
        const quoted = [...m.what.matchAll(/“([^”]+)”/g)].map((x) => x[1]);
        expect(quoted.length, `${m.id} What 沒有引用：${m.what}`).toBeGreaterThan(0);
        expect(quoted.some((q) => q.split(/\s+|…/).filter(Boolean).every((p) => words.has(p))), `${m.id} 引用的字不在句中：${m.what}`).toBe(true);
        // 短：A1–B1 看得完
        expect(m.what.length, `${m.id} What 太長`).toBeLessThanOrEqual(220);
        expect(m.why.length, `${m.id} Why 太長`).toBeLessThanOrEqual(320);
        expect(m.pattern.length, `${m.id} Pattern 太長`).toBeLessThanOrEqual(140);
        // 不給發音、只用英文
        const all = `${m.what} ${m.why} ${m.pattern}`;
        expect(all).not.toMatch(/pronounc|\bIPA\b|\[[^\]]*ʃ|\/[^/]*[ʃʒəɐ][^/]*\//i);
        expect(all).not.toMatch(/[一-鿿]/);
      }
    }
    expect(checked).toBeGreaterThan(25);
  });
});

// ---------- 穩定性 ----------
describe('P2 引擎不壞（T8、TE、T1 全部句子）', () => {
  const texts = [
    '😅😅👍🏽🇩🇪', '   ', '15 3,50 12:30', 'Ich hab das Meeting gecancelt.', 'Ik ga morgen naar huis.',
    'Hey, kommst du heut Abend? Ich hab nix vor 😅', 'Ne, ich kann leider nicht, muss noch arbeiten.', 'Kannste mir kurz helfen?',
    'Moin! Wie gehts?', 'Wenn ich Zeit hätte, käme ich.', 'Die Vereinigten Staaten.', 'Den Männern gefällt es nicht.',
    'Ich gehe heute nach Hause, weil ich müde bin. '.repeat(40),
  ];
  for (const text of texts) {
    it(`P2 不壞：${text.slice(0, 40)}`, async () => {
      const tokens = await prep(text);
      const sentences = [...new Set(tokens.filter((t) => t.type === 'word').map((t) => t.sentence))];
      for (const s of sentences) expect(() => analyzeSentence(tokens, s, dict)).not.toThrow();
      for (const t of tokens.filter((x) => x.type === 'word')) expect(() => analyzeWord(tokens, t.index, dict)).not.toThrow();
    });
  }
});
