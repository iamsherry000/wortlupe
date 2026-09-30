// P2.2 加修（Charles 逐條看完 top500-primary.txt 後）：小寫名詞、口語高頻字、首要義項、gehört 語境排序。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/tokenize.js';
import { createDictionary } from '../src/dict.js';
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
async function card(text, word) {
  const tokens = tokenize(text);
  await dict.ensure(tokens.filter((t) => t.type === 'word').map((t) => t.text));
  const tok = tokens.find((t) => t.type === 'word' && t.text === word);
  return buildCard(tokens, tok.index, dict);
}
const top = (c) => c.readings[0] && `${c.readings[0].lemma}/${c.readings[0].pos}`;

// ---------- 1. 小寫名詞 ----------
describe('LC WhatsApp 小寫名詞：首字大寫版本是明顯更常用的名詞 → 名詞排第一並註明', () => {
  const NOUN = [
    ['hab keine zeit', 'zeit', 'Zeit'], ['bin zu haus', 'haus', 'Haus'], ['ich bin zu hause', 'hause', 'Haus'],
    ['schönen tag noch', 'tag', 'Tag'], ['viel glück morgen', 'glück', 'Glück'], ['ich brauche wasser', 'wasser', 'Wasser'],
    ['das ist die art von leuten', 'art', 'Art'], ['am ende war alles gut', 'ende', 'Ende'], ['das dauert zwei stunden', 'stunden', 'Stunde'],
    ['solche dinge passieren', 'dinge', 'Ding'], ['die frau von nebenan', 'frau', 'Frau'],
  ];
  for (const [text, word, noun] of NOUN) {
    it(`LC ${word} → ${noun}（${text}）`, async () => {
      const c = await card(text, word);
      expect(top(c), c.readings.map((r) => `${r.lemma}/${r.pos}`).join(', ')).toBe(`${noun}/noun`);
      expect(c.lowercaseNoun).toBe(noun);
    });
  }
  const VERB = [['wir essen um sieben', 'essen', 'essen'], ['wir leben hier', 'leben', 'leben'], ['wir fragen ihn', 'fragen', 'fragen'], ['wir sorgen dafür', 'sorgen', 'sorgen'], ['wir warten hier', 'warten', 'warten']];
  for (const [text, word, verb] of VERB) {
    it(`LC ${word} 維持動詞 ${verb}（${text}）`, async () => {
      const c = await card(text, word);
      expect(top(c)).toBe(`${verb}/verb`);
      expect(c.lowercaseNoun).toBeFalsy();
    });
  }
  // 小寫本來就是正確拼法的詞不翻：副詞／連接詞原形、形容詞變化形
  for (const [text, word] of [['ich bin weg', 'weg'], ['der junge mann', 'junge'], ['falls du kommst', 'falls'], ['das ist wohl so', 'wohl']]) {
    it(`LC ${word} 小寫是正確拼法，不翻成名詞（${text}）`, async () => {
      const c = await card(text, word);
      expect(c.lowercaseNoun).toBeFalsy();
      expect(c.readings[0].pos).not.toBe('noun');
    });
  }
  // 詞頻表會把它翻成名詞，但旁邊有人稱對得上的主詞代名詞 → 動詞（語境否決）
  for (const [text, word, verb] of [['ich fürchte schon', 'fürchte', 'fürchten'], ['wir schätzen das', 'schätzen', 'schätzen'], ['ich frage mal', 'frage', 'fragen']]) {
    it(`LC ${word} 有主詞代名詞 → 動詞 ${verb}（${text}）`, async () => {
      const c = await card(text, word);
      expect(top(c)).toBe(`${verb}/verb`);
      expect(c.lowercaseNoun).toBeFalsy();
    });
  }
  it('LC 沒有代名詞時 sorge 是名詞（keine sorge）', async () => {
    const c = await card('keine sorge', 'sorge');
    expect(top(c)).toBe('Sorge/noun');
    expect(c.readings[0].lowercaseNote).toBe('written in lowercase; probably the noun Sorge');
  });
  it('LC 大寫的名詞照常（Die Zeit vergeht.）', async () => {
    const c = await card('Die Zeit vergeht.', 'Zeit');
    expect(top(c)).toBe('Zeit/noun');
    expect(c.lowercaseNoun).toBeFalsy();
  });
});

// ---------- 2. 口語高頻字 ----------
describe('CQ 口語高頻字', () => {
  for (const w of ['hey', 'ok', 'okay', 'hi']) {
    it(`CQ ${w} → interjection`, async () => {
      const c = await card(`${w} wie gehts`, w);
      expect(c.status).toBe('found');
      expect(c.readings[0].pos).toBe('intj');
    });
  }
  for (const [text, w, exp] of [['hast du n stift', 'n', 'ein'], ['ich hab nen termin', 'nen', 'einen'], ['mit nem freund', 'nem', 'einem']]) {
    it(`CQ ${w} → ${exp}`, async () => {
      const c = await card(text, w);
      expect(c.colloquial && c.colloquial.expansions).toContain(exp);
      expect(c.status).toBe('found');
    });
  }
  it('CQ ne 維持 nein／eine', async () => {
    const c = await card('ne, danke', 'ne');
    expect(c.colloquial.expansions).toEqual(['nein', 'eine']);
  });
});

// ---------- 3. 首要義項 ----------
describe('GL 首要義項：日常用法排第一，其他義項保留在後面', () => {
  const CASES = [
    ['Ich komme gleich.', 'gleich', /right away/, 'the same'],
    ['Ich komme erst morgen.', 'erst', /only|not until/, 'first'],
    ['Das ist weit.', 'weit', /far/, 'wide'],
    ['Bist du sicher?', 'sicher', /sure|certainly/, 'safe'],
    ['Genau, das stimmt.', 'Genau', /exactly/, 'exact'],
    ['Das ist ganz gut.', 'ganz', /quite|completely/, 'whole'],
    ['Darum komme ich nicht.', 'Darum', /that's why/, 'around'],
    ['Das stimmt überhaupt nicht.', 'überhaupt', /at all/, 'general'],
    ['Das ist echt gut.', 'echt', /really/, 'genuine'],
    ['Guten Tag, Herr Weber.', 'Herr', /Mr\./, 'gentleman'],
    ['Aus welchem Grund?', 'Grund', /reason/, 'ground'],
    ['Das ist eine lange Geschichte.', 'Geschichte', /story/, 'history'],
    ['Ich habe keine Ahnung.', 'Ahnung', /idea/, 'inkling'],
    ['Alles in Ordnung.', 'Ordnung', /order.*in Ordnung/, null],
    ['Danke, mein Schatz.', 'Schatz', /darling/, 'treasure'],
    ['Das ist gut.', 'gut', /^good$/, null],
    ['Ich bin dabei.', 'dabei', /with it/, 'at the same time'],
  ];
  for (const [text, w, first, later] of CASES) {
    it(`GL ${w}`, async () => {
      const c = await card(text, w);
      const g = c.readings[0].glosses;
      expect(g[0], g.join(' | ')).toMatch(first);
      if (later) expect(g.join(' | ')).toContain(later);
    });
  }
  it('GL verloren → verlieren 的過去分詞排第一，形容詞排後面', async () => {
    const c = await card('Ich habe den Schlüssel verloren.', 'verloren');
    expect(top(c)).toBe('verlieren/verb');
    expect(c.readings.map((r) => `${r.lemma}/${r.pos}`)).toContain('verloren/adj');
    // 子句裡有 habe → 「這個形是什麼」先講過去分詞，不是 wir verloren 的過去式
    expect(c.readings[0].formDescriptions[0]).toMatch(/^past participle/);
  });
});

describe('GH gehört：hören 的過去分詞與 gehören 的現在式都要列，依語境排序', () => {
  it('GH Das gehört mir. → gehören 排第一', async () => {
    const c = await card('Das gehört mir.', 'gehört');
    const sigs = c.readings.map((r) => `${r.lemma}/${r.pos}`);
    expect(sigs[0]).toBe('gehören/verb');
    expect(sigs).toContain('hören/verb');
  });
  it('GH Ich habe das gehört. → hören 的過去分詞排第一', async () => {
    const c = await card('Ich habe das gehört.', 'gehört');
    const sigs = c.readings.map((r) => `${r.lemma}/${r.pos}`);
    expect(sigs[0]).toBe('hören/verb');
    expect(sigs).toContain('gehören/verb');
  });
  it('GH Hast du das gehört? → hören', async () => {
    const c = await card('Hast du das gehört?', 'gehört');
    expect(top(c)).toBe('hören/verb');
  });
});
