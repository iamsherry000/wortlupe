// P0 資料層驗收：TESTS.md §0 門檻、§2 Golden Set A（T1）、T5 名詞完整度、SPEC §3 大小上限。
// 測試名稱直接對回規格編號，讓 Charles 對得回 TESTS.md。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLookup } from '../src/lookup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

let forms, lexicon, lookup;

beforeAll(() => {
  forms = JSON.parse(readFileSync(join(DATA, 'forms.json'), 'utf8'));
  lexicon = JSON.parse(readFileSync(join(DATA, 'lexicon.json'), 'utf8'));
  lookup = createLookup({ forms, lexicon });
});

// Golden Set A：句子 → 目標詞 → 期望原形＋期望標註。
// 標註用 kaikki（wiktextract）的 tag 字彙；候選的 tags 必須「包含」期望 tags。
// sentenceInitial 依目標詞在原句的位置決定。
const GOLDEN_A = [
  { id: 'ging → gehen', sentence: 'Ich ging gestern nach Hause.', token: 'ging', initial: false, lemma: 'gehen', tags: ['preterite', 'first-person', 'singular'] },
  { id: 'Häusern → Haus', sentence: 'Wir wohnen in zwei Häusern.', token: 'Häusern', initial: false, lemma: 'Haus', tags: ['plural', 'dative'] },
  { id: 'bessere → gut', sentence: 'Das ist die bessere Lösung.', token: 'bessere', initial: false, lemma: 'gut', tags: ['comparative'] },
  { id: 'wurde → werden', sentence: 'Er wurde krank.', token: 'wurde', initial: false, lemma: 'werden', tags: ['preterite'] },
  { id: 'Kindern → Kind', sentence: 'Sie hat mit den Kindern gespielt.', token: 'Kindern', initial: false, lemma: 'Kind', tags: ['plural', 'dative'] },
  { id: 'gespielt → spielen', sentence: 'Sie hat mit den Kindern gespielt.', token: 'gespielt', initial: false, lemma: 'spielen', tags: ['past', 'participle'] },
  { id: 'größte → groß', sentence: 'Der größte Fehler war die Eile.', token: 'größte', initial: false, lemma: 'groß', tags: ['superlative'] },
  { id: 'las → lesen', sentence: 'Ich las das Buch zu Ende.', token: 'las', initial: false, lemma: 'lesen', tags: ['preterite'] },
  { id: 'gewusst → wissen', sentence: 'Hast du das gewusst?', token: 'gewusst', initial: false, lemma: 'wissen', tags: ['past', 'participle'], irregular: true },
  { id: 'Männern → Mann', sentence: 'Den Männern gefällt es nicht.', token: 'Männern', initial: false, lemma: 'Mann', tags: ['plural', 'dative'] },
  { id: 'Gib → geben', sentence: 'Gib mir bitte das Salz.', token: 'Gib', initial: true, lemma: 'geben', tags: ['imperative'] },
  { id: 'hätte → haben', sentence: 'Wenn ich Zeit hätte, käme ich.', token: 'hätte', initial: false, lemma: 'haben', tags: ['subjunctive-ii'] },
  { id: 'Vereinigten → vereinigen', sentence: 'Die Vereinigten Staaten.', token: 'Vereinigten', initial: false, lemma: 'vereinigen', tags: ['past', 'participle'] },
];

function hit(result, lemma, tags) {
  return result.candidates.some(
    (c) => c.lemma === lemma && tags.every((t) => c.tags.includes(t)),
  );
}

describe('T1 變化形還原（Golden Set A）', () => {
  for (const g of GOLDEN_A) {
    it(`T1 ${g.id}`, () => {
      const r = lookup(g.token, { sentenceInitial: g.initial });
      expect(r.found, `${g.token} 查不到`).toBe(true);
      const summary = r.candidates.map((c) => `${c.lemma}[${c.tags.join(',')}]`);
      expect(hit(r, g.lemma, g.tags), `候選：${summary.join(' | ')}`).toBe(true);
      if (g.irregular) {
        const entries = lexicon[g.lemma].filter((e) => e.pos === 'verb');
        expect(entries.some((e) => e.verb && e.verb.irregular === true)).toBe(true);
      }
    });
  }

  it('T1 準確率 ≥ 95%（TESTS §0）', () => {
    const ok = GOLDEN_A.filter((g) => hit(lookup(g.token, { sentenceInitial: g.initial }), g.lemma, g.tags)).length;
    expect(ok / GOLDEN_A.length).toBeGreaterThanOrEqual(0.95);
  });

  // 陷阱項
  it('T1 陷阱 esse → essen，不可還原成 Esse（煙囪）', () => {
    const r = lookup('esse', { sentenceInitial: false });
    expect(hit(r, 'essen', ['first-person', 'singular', 'present'])).toBe(true);
    expect(r.candidates.map((c) => c.lemma)).not.toContain('Esse');
    // 非句首的小寫字，不可回傳任何大寫名詞原形
    expect(r.candidates.filter((c) => c.pos === 'noun')).toEqual([]);
  });

  it('T1 陷阱 Band → das Band，並列出其他性別、標為歧義', () => {
    const r = lookup('Band', { sentenceInitial: false });
    const bands = r.candidates.filter((c) => c.lemma === 'Band' && c.pos === 'noun');
    const genders = new Set(bands.flatMap((c) => c.gender));
    expect(genders.has('n'), `性別：${[...genders]}`).toBe(true); // das Band（帶子）一定要在
    expect(genders.size).toBeGreaterThan(1); // 無法單靠字形判斷 → 全列
    expect(r.ambiguous).toBe(true);
  });
});

describe('T1 查詢函式的大小寫規則', () => {
  it('T1 句首大寫的動詞也查得到（Kommst → kommen）', () => {
    const r = lookup('Kommst', { sentenceInitial: true });
    expect(r.candidates.some((c) => c.lemma === 'kommen')).toBe(true);
  });

  it('T1 非句首的小寫字不回傳大寫名詞原形（essen 不可出 Essen）', () => {
    const r = lookup('essen', { sentenceInitial: false });
    expect(r.candidates.some((c) => c.lemma === 'essen')).toBe(true);
    expect(r.candidates.filter((c) => c.pos === 'noun')).toEqual([]);
  });
});

describe('T7 零編造（P0 字典層：查不到就說查不到）', () => {
  // Schmurgelverwaltungsanstalt：TESTS §7 點名「最危險」（像真的複合詞但不存在），P2.1 補上自動化
  for (const w of ['Blarkenschaft', 'Quimbertung', 'asdfghjkl', 'Jonas', 'Schmurgelverwaltungsanstalt']) {
    it(`T7 ${w} → Not in dictionary`, () => {
      const r = lookup(w, { sentenceInitial: false });
      expect(r.found).toBe(false);
      expect(r.candidates).toEqual([]);
    });
  }
});

describe('T5 名詞文法完整度', () => {
  it('T5 查得到的名詞 100% 同時有定冠詞與複數形', () => {
    const bad = [];
    let nouns = 0;
    for (const [lemma, entries] of Object.entries(lexicon)) {
      for (const e of entries) {
        if (e.pos !== 'noun') continue;
        nouns++;
        // gender 是陣列（少數名詞有兩個性別，例 der/das Joghurt），每個都要能對到定冠詞
        const hasArticle = Array.isArray(e.gender) && e.gender.length > 0
          && e.gender.every((g) => ['m', 'f', 'n', 'pl'].includes(g));
        // 複數：有複數形，或字典明確標「沒有複數」（不可數）才算有答案；空白 = 缺
        const hasPlural = (Array.isArray(e.plural) && e.plural.length > 0) || e.noPlural === true;
        if (!hasArticle || !hasPlural) bad.push(lemma);
      }
    }
    expect(nouns).toBeGreaterThan(1000);
    expect(bad.slice(0, 20), `缺冠詞或複數的名詞共 ${bad.length} 個`).toEqual([]);
  });

  it('T5 golden 名詞抽查：das Haus／Häuser、das Kind／Kinder、der Mann／Männer', () => {
    const check = (lemma, gender, plural) => {
      const e = lexicon[lemma].find((x) => x.pos === 'noun' && x.gender.includes(gender));
      expect(e, `${lemma} ${gender}`).toBeTruthy();
      expect(e.plural).toContain(plural);
    };
    check('Haus', 'n', 'Häuser');
    check('Kind', 'n', 'Kinder');
    check('Mann', 'm', 'Männer');
  });
});

describe('SPEC §3 資料格式與大小上限', () => {
  // P2.5（SPEC §3 9/27 改版）：上限從 15 MB 放寬到 25 MB，而且只算「上線部分」：
  // forms.json 是建置正本，不上傳（.assetsignore），執行期讀的是 runtime/ 分片
  it('SPEC §3 data/ 上線部分 gzip 後 ≤ 25 MB', () => {
    // P1 起 data/ 下有 runtime/ 分片子資料夾，一起算
    let total = 0;
    for (const f of readdirSync(DATA, { recursive: true, withFileTypes: true })) {
      if (!f.isFile() || f.name === 'forms.json') continue;
      total += gzipSync(readFileSync(join(f.parentPath, f.name)), { level: 9 }).length;
    }
    expect(total).toBeLessThanOrEqual(25 * 1024 * 1024);
  }, 60_000); // P1 起多了 runtime 分片，gzip 全部檔案要數秒，超過 Vitest 預設 5 秒

  it('SPEC §3 詞彙範圍 A1–C1：原形約 40,000 個（P2.5）', () => {
    const n = Object.keys(lexicon).length;
    expect(n).toBeGreaterThanOrEqual(38_000);
    expect(n).toBeLessThanOrEqual(45_000);
  });

  it('SPEC §3 上線的每個 data 檔 < 25 MiB（Cloudflare 上限）', () => {
    for (const f of readdirSync(DATA, { recursive: true, withFileTypes: true })) {
      if (!f.isFile() || f.name === 'forms.json') continue;
      expect(readFileSync(join(f.parentPath, f.name)).length, f.name).toBeLessThan(25 * 1024 * 1024);
    }
  });

  // P2.5：原本的「詞彙量約 15,000 原形」由上面的「A1–C1：原形約 40,000 個」取代（SPEC §3 9/27 改版）

  it('SPEC §3 forms 每一筆都指回 lexicon 裡存在的原形', () => {
    const orphans = [];
    for (const [form, list] of Object.entries(forms)) {
      for (const f of list) if (!lexicon[f.lemma]) orphans.push(`${form}→${f.lemma}`);
    }
    expect(orphans.slice(0, 20)).toEqual([]);
  });

  it('SPEC §3 義項最多三個', () => {
    const over = [];
    for (const [lemma, entries] of Object.entries(lexicon)) {
      for (const e of entries) if ((e.glosses || []).length > 3) over.push(lemma);
    }
    expect(over).toEqual([]);
  });

  it('SPEC §3 原始 dump 在 build/raw/ 且被 gitignore', () => {
    const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(gi).toMatch(/^build\/raw\/$/m);
    expect(gi).toMatch(/^node_modules\/$/m);
    expect(existsSync(join(DATA, 'forms.json'))).toBe(true);
  });
});
