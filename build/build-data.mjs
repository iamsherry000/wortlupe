// P0 資料層建置：build/raw/slim.jsonl（kaikki 英文 Wiktionary 德文條目，瘦身版）＋詞頻表（P2.5 起用完整版 de_full.txt，見 build/freq.mjs）
// → data/forms.json（變化形 → [{lemma, pos, tags, i}]）與 data/lexicon.json（原形 → [條目…]）。
//
// 原則（SPEC §3、§4.4）：欄位只來自 Wiktionary 資料，查不到就留空，不推測、不補寫。
// 串流逐行讀兩遍，不整檔載入；行程優先權調低，避免拖慢 Sherry 的筆電。
//
// 用法：node build/extract-slim.mjs（只需一次）→ node build/build-data.mjs [目標原形數，預設 15000]
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { SHARD_COUNT, shardOf, shardName } from '../src/shard.js';
import { loadFreqWords, FREQ_FILE } from './freq.mjs';
import { stampRuntime } from './stamp-runtime.mjs';

try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* 無權限就算了 */ }

const BUILD = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BUILD, '..');
const RAW = join(BUILD, 'raw');
const OUT = join(ROOT, 'data');
const TARGET = Number(process.argv[2]) || 40000; // P2.5：A1–C1（P0–P2.4 是 15000）
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---------- 規則常數 ----------

// 收進字典的詞性。人名地名（name）不收：S06 要求 "Jonas" 顯示查不到。
const LEMMA_POS = new Set(['noun', 'verb', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', 'article', 'particle', 'num', 'intj', 'contraction', 'postp']);

// 這些變化形不收：異體拼法、古舊、指小詞（Häuschen 是另一個字不是 Haus 的變化）、助動詞欄位（那是屬性不是字形）
const SKIP_FORM_TAGS = new Set(['alternative', 'obsolete', 'archaic', 'dated', 'pronunciation-spelling', 'diminutive',
  'auxiliary', 'error-unrecognized-form', 'abbreviation', 'misspelling', 'multiword-construction', 'romanization',
  'nonstandard', 'augmentative', 'feminine-form-of', 'masculine-form-of']);

const DROP_TAGS = new Set(['form-of', 'table-tags', 'inflection-template', 'canonical']);
const CASE_TAGS = new Set(['nominative', 'genitive', 'dative', 'accusative']);
const LOW_PRIORITY_SENSE = /^(obsolete|archaic|dated|rare|historical|slang|vulgar|dialectal|regional|Austria|Switzerland|Swiss|Bavaria|figuratively|poetic|literary|nonstandard|colloquial|derogatory|offensive)/;
const TOKEN_RE = /^[\p{L}][\p{L}'’-]*$/u;

// ---------- 小工具 ----------

function isFormOfSense(s) {
  return !!(s.of || (s.t && (s.t.includes('form-of') || s.t.includes('alt-of'))));
}
function isLemmaEntry(e) {
  return LEMMA_POS.has(e.pos) && e.senses.some((s) => !isFormOfSense(s) && s.g && s.g.length);
}
// 把 kaikki 的表頭摘要 tag（"past"）統一成完整表格用的字彙（preterite / subjunctive-ii），
// 這樣同一個字形不會同時出現兩套說法。
function normTags(tags) {
  let t = (tags || []).filter((x) => !DROP_TAGS.has(x));
  if (t.includes('past') && !t.includes('participle')) {
    if (t.includes('subjunctive') || t.includes('subjunctive-ii')) {
      t = t.filter((x) => x !== 'past' && x !== 'subjunctive');
      if (!t.includes('subjunctive-ii')) t.push('subjunctive-ii');
    } else {
      t = t.map((x) => (x === 'past' ? 'preterite' : x));
    }
  }
  return [...new Set(t)].sort();
}
// 形容詞弱／混合變化在 kaikki 裡連冠詞一起寫（"dem großen"，tag includes-article）。
// P2（G16）需要這些 tag：取最後一個字，去掉冠詞相關 tag，保留 weak / mixed＋性別、格、數。
const ARTICLE_TAGS = new Set(['includes-article', 'definite', 'indefinite', 'negative']);
function expandForms(forms) {
  const out = [];
  for (const f of forms) {
    const t = f.t || [];
    if (t.includes('includes-article') && /^\S+ \S+$/.test(f.f)) {
      out.push({ f: f.f.split(' ')[1], t: t.filter((x) => !ARTICLE_TAGS.has(x)) });
    } else {
      out.push(f);
    }
  }
  return out;
}
// ---------- P2.1：條目自己的變化形（兩個資料層根因）----------
// 根因 1（B1）：Wiktionary 的人稱代名詞條目（ich, du, er, sie, es, wir…）共用同一張「人稱代名詞表」，
// 每個條目的 forms 都收了全部 11 個代名詞的形，所以 er 會被當成 ich 的變化形。
// 修法：tag 帶 personal 的表格列，只留「人稱／數／性」跟這個條目自己那一列相同的列。
// 條目自己那一列查不到人稱（du、ihr、Sie 的列被標 error-unrecognized-form）→ 整張表都不收，改靠「X 是 du 的第三格」這類變化形條目。
const PERSON_TAGS = ['first-person', 'second-person', 'third-person'];
const NUMBER_TAGS = ['singular', 'plural'];
const GENDER_TAGS = ['masculine', 'feminine', 'neuter'];
const sigOf = (t) => [PERSON_TAGS, NUMBER_TAGS, GENDER_TAGS].map((g) => g.find((x) => t.includes(x)) || '').join('|');
function ownPersonalRows(e, forms) {
  if (e.pos !== 'pron' || !forms.some((f) => (f.t || []).includes('personal'))) return forms;
  const sigs = new Set(forms.filter((f) => f.f === e.word && PERSON_TAGS.some((p) => (f.t || []).includes(p))).map((f) => sigOf(f.t)));
  return forms.filter((f) => !(f.t || []).includes('personal') || sigs.has(sigOf(f.t)));
}
// 根因 2（M2）：名詞表頭摘要會標「罕用／古舊」（plural Männer or (obsolete) Mann），
// 但下面的完整變化表列不帶這些標記，所以 Mann 當複數的罕用讀法被當成一般讀法。
// 修法：摘要裡只以罕用／古舊標記出現的形，把標記補到變化表同數的列上（古舊的會被 usableForm 丟掉，罕用的留 rare tag）。
const QUALIFIERS = ['obsolete', 'archaic', 'dated', 'rare', 'poetic'];
function inheritQualifiers(forms) {
  const summary = forms.filter((f) => f.t && !f.t.some((x) => CASE_TAGS.has(x)) && f.t.some((x) => x === 'plural' || x === 'singular'));
  const qualified = new Map();
  const plain = new Set();
  for (const f of summary) {
    const num = f.t.includes('plural') ? 'plural' : 'singular';
    const q = f.t.filter((x) => QUALIFIERS.includes(x));
    if (q.length) qualified.set(`${f.f}|${num}`, q); else plain.add(`${f.f}|${num}`);
  }
  if (!qualified.size) return forms;
  return forms.map((f) => {
    const t = f.t || [];
    const num = t.includes('plural') ? 'plural' : t.includes('singular') ? 'singular' : null;
    const k = `${f.f}|${num}`;
    if (!num || plain.has(k) || !qualified.has(k) || t.some((x) => QUALIFIERS.includes(x))) return f;
    return { f: f.f, t: [...t, ...qualified.get(k)] };
  });
}
function entryForms(e) {
  let forms = expandForms(e.forms);
  forms = ownPersonalRows(e, forms);
  if (e.pos === 'noun') forms = inheritQualifiers(forms);
  return forms;
}

// ---------- P2.2（A5）資料健檢 ----------
// Wiktionary 偶爾有壞掉的變化表（amtshandeln 的表把 e、en、st、t 這些詞尾當成字形），查起來會變成完整動詞卡。
// 判準：變化形與原形（小寫、去變音）要有共同字首，或去掉 ge- 後有共同字首，或包含原形字幹的前三個字母；
// 做不到的只有真正的不規則形（sein → bin/ist/war、gut → besser、代名詞 ich → mir…），列在白名單。
const IRREGULAR = {
  sein: 'bin bist ist sind seid war warst waren wart wäre wärst wären wärt wärest wäret gewesen gewesene gewesenem gewesenen gewesener gewesenes gewest sei seist seien seiet',
  essen: 'aß aßen aßest aßt aße äße äßen äßest äßet äßt iss isst ißt',
  sehr: 'mehr meist',
  Ihr: 'Euch Euer', // 古舊的敬稱 Ihr
  sier: 'ihrm', // 中性新代名詞 sier 的第三格
  gering: 'minder mindest',
  früh: 'eher',
  gut: 'besser bessere besseren besserem besserer besseres best beste besten bestem bester bestes',
  viel: 'mehr meist meiste meisten meistem meister meistes',
  wenig: 'minder mindest mindeste mindesten',
  gern: 'lieber liebsten',
  gerne: 'lieber liebsten',
  bald: 'eher ehesten',
  ich: 'mich mir meiner mein',
  er: 'ihn ihm seiner sein',
  es: 'ihm seiner sein',
  sie: 'ihr ihnen ihrer',
  Sie: 'Ihnen Ihrer Ihr',
  wir: 'uns unser',
  ihr: 'euch euer',
};
const IRREGULAR_SET = new Set(Object.entries(IRREGULAR).flatMap(([l, fs]) => fs.split(' ').map((f) => `${f}|${l}`)));
const fold = (s) => s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
function formPlausible(form, lemma) {
  if (IRREGULAR_SET.has(`${form}|${lemma}`) || IRREGULAR_SET.has(`${form.toLowerCase()}|${lemma}`)) return true;
  const f = fold(form), l = fold(lemma);
  if (f[0] === l[0]) return true;
  // 複合詞開頭是補充形：vielversprechend → mehrversprechend、gutbesucht → bestbesucht
  if (/^viel/.test(l) && /^(mehr|meist)/.test(f) && f.includes(l.slice(4, 8))) return true;
  if (/^gut/.test(l) && /^(besser|best)/.test(f) && f.includes(l.slice(3, 7))) return true;
  if (f.startsWith('ge') && f.length > 4 && f[2] === l[0]) return true;
  const stem = l.replace(/(en|n|e)$/, '');
  return stem.length >= 3 && f.includes(stem.slice(0, 3));
}
// 三態只收正常的字（lexicon 裡出現過 "Main:amtshandeln"）
const cleanPart = (s) => (typeof s === 'string' && /^[\p{L}' ]+$/u.test(s) ? s : undefined);

// 只有性別 tag 的記錄（Männin 的 forms 裡 {"Mann", ["masculine"]}）是「對應的陽性詞」，不是變化形
const GENDER_ONLY = new Set(['masculine', 'feminine', 'neuter']);
function usableForm(f) {
  const t = f.t || [];
  if (t.length && t.every((x) => GENDER_ONLY.has(x))) return false;
  return f.f && TOKEN_RE.test(f.f) && !t.some((x) => SKIP_FORM_TAGS.has(x) || x.startsWith('error'));
}
function formOfTargets(e) {
  const out = [];
  for (const s of e.senses) {
    if (!s.of) continue;
    if ((s.t || []).includes('alt-of')) continue;
    for (const target of s.of) out.push({ target, tags: s.t || [] });
  }
  return out;
}
async function* readSlim() {
  const rl = createInterface({ input: createReadStream(join(RAW, 'slim.jsonl'), { highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  for await (const line of rl) if (line) yield JSON.parse(line);
}

// ---------- 詞頻表與強制收錄字 ----------

const freqWords = loadFreqWords();
const seedWords = readFileSync(join(BUILD, 'seed-words.txt'), 'utf8')
  .split('\n').filter((l) => !l.startsWith('#')).join(' ').split(/\s+/).filter(Boolean);
const wanted = new Set([...freqWords, ...seedWords].map((w) => w.toLowerCase()));
const freqRank = new Map();
freqWords.forEach((w, i) => { const k = w.toLowerCase(); if (!freqRank.has(k)) freqRank.set(k, i + 1); });
const RARE_TAGS = new Set(['rare', 'archaic', 'obsolete']);
log(`詞頻表 ${FREQ_FILE} ${freqWords.length} 字形，強制收錄 ${seedWords.length} 字形`);

// ---------- 第一遍：字形（小寫）→ 可能的原形；找出「分詞當形容詞」的對應 ----------

const edges = new Map(); // 小寫字形 → Set(原形)
const lemmaWords = new Set(); // 有正式義項、詞性合格的原形
const participleOf = new Map(); // 過去分詞字 → Set(動詞原形)，例 vereinigt → vereinigen
const addEdge = (form, lemma) => {
  const k = form.toLowerCase();
  if (!wanted.has(k)) return;
  if (!edges.has(k)) edges.set(k, new Set());
  edges.get(k).add(lemma);
};

let n1 = 0;
for await (const e of readSlim()) {
  n1++;
  if (isLemmaEntry(e)) {
    lemmaWords.add(e.word);
    addEdge(e.word, e.word);
    for (const f of entryForms(e)) if (usableForm(f)) addEdge(f.f, e.word);
  }
  for (const { target, tags } of formOfTargets(e)) {
    addEdge(e.word, target);
    if (e.pos === 'verb' && tags.includes('participle') && tags.includes('past')) {
      if (!participleOf.has(e.word)) participleOf.set(e.word, new Set());
      participleOf.get(e.word).add(target);
    }
  }
}
log(`第一遍：${n1} 筆條目，${lemmaWords.size} 個合格原形，${edges.size} 個字形有對應`);

// ---------- 選詞：依詞頻排名把字形對回原形，取前 TARGET 個原形，再加強制收錄 ----------

const selected = new Set();
let lastRank = 0;
for (let r = 0; r < freqWords.length && selected.size < TARGET; r++) {
  const ls = edges.get(freqWords[r].toLowerCase());
  if (!ls) continue;
  for (const l of ls) if (lemmaWords.has(l)) selected.add(l);
  lastRank = r + 1;
}
const beforeSeeds = selected.size;
for (const w of seedWords) {
  const ls = edges.get(w.toLowerCase());
  if (ls) for (const l of ls) if (lemmaWords.has(l)) selected.add(l);
}
log(`選詞：詞頻表用到第 ${lastRank} 名得 ${beforeSeeds} 原形，加強制收錄後 ${selected.size}`);

// ---------- 條目欄位抽取（只讀資料，不推測） ----------

function nounGender(e) {
  const g = new Set();
  const h = e.head.find((x) => x.name === 'de-noun');
  if (h && h.args && typeof h.args['1'] === 'string') {
    for (const part of h.args['1'].split(',')[0].split(':')) {
      const m = part.trim().match(/^(m|f|n|p)\b/);
      if (m) g.add(m[1] === 'p' ? 'pl' : m[1]);
    }
  }
  if (!g.size && h && h.args && h.args.g) {
    for (const part of String(h.args.g).split(/[,:]/)) if (/^(m|f|n)$/.test(part)) g.add(part);
  }
  if (!g.size && e.head[0] && e.head[0].exp) {
    const rest = e.head[0].exp.slice(e.word.length);
    const m = rest.match(/^\s+((?:m|f|n|pl)(?:\s+or\s+(?:m|f|n|pl))*)(?=\s|$|\()/);
    if (m) for (const x of m[1].split(/\s+or\s+/)) g.add(x);
  }
  if (!g.size) {
    const tags = new Set(e.senses.flatMap((s) => s.t || []));
    if (tags.has('masculine')) g.add('m');
    if (tags.has('feminine')) g.add('f');
    if (tags.has('neuter')) g.add('n');
    if (tags.has('plural-only') || tags.has('plurale-tantum')) g.add('pl');
  }
  return [...g];
}

function nounPlural(e, gender) {
  if (gender.length === 1 && gender[0] === 'pl') return { plural: [e.word] };
  const bad = (t) => t.some((x) => CASE_TAGS.has(x) || SKIP_FORM_TAGS.has(x));
  let pl = e.forms.filter((f) => (f.t || []).includes('plural') && !bad(f.t) && TOKEN_RE.test(f.f)).map((f) => f.f);
  if (!pl.length) {
    pl = e.forms.filter((f) => (f.t || []).includes('plural') && (f.t || []).includes('nominative') && TOKEN_RE.test(f.f)).map((f) => f.f);
  }
  pl = [...new Set(pl)];
  // 罕用／詩意的複數（Mann 的 Mannen）有一般複數時就不列，字卡只給學習者用得到的
  const rareForms = new Set(e.forms.filter((f) => (f.t || []).includes('plural') && (f.t || []).some((x) => QUALIFIERS.includes(x))).map((f) => f.f));
  const common = pl.filter((p) => !rareForms.has(p));
  if (common.length) pl = common;
  const senseTags = new Set(e.senses.flatMap((s) => s.t || []));
  const exp = (e.head[0] && e.head[0].exp) || '';
  const noPlural = senseTags.has('no-plural') || senseTags.has('uncountable') || /\bno plural\b/.test(exp)
    || e.cats.some((c) => /singularia tantum|uncountable/i.test(c));
  const o = {};
  if (pl.length) o.plural = pl;
  if (!pl.length && noPlural) o.noPlural = true;
  return o;
}

function verbInfo(e) {
  const v = {};
  const h = e.head.find((x) => x.name === 'de-verb');
  if (h) {
    const spec = String((h.args && h.args['1']) || '').split('<')[0];
    const idx = spec.lastIndexOf('.');
    v.separable = idx > 0;
    if (idx > 0) v.prefix = spec.slice(0, idx).replace(/\./g, '');
  }
  const text = [h && h.exp, ...e.senses.flatMap((s) => s.t || [])].join(' ');
  if (/irregular|strong|preterite-present|mixed/.test(text)) v.irregular = true;
  else if (/\bweak\b/.test(text)) v.irregular = false;
  const first = (pred) => { const f = e.forms.find((x) => pred(x.t || [])); return f ? f.f : undefined; };
  const same = (t, want) => t.length === want.length && want.every((w) => t.includes(w));
  const pp = {
    present3sg: first((t) => same(t, ['present', 'singular', 'third-person'])),
    preterite: first((t) => same(t, ['past'])),
    participle: first((t) => same(t, ['participle', 'past'])),
  };
  for (const k of Object.keys(pp)) pp[k] = cleanPart(pp[k]);
  if (pp.present3sg || pp.preterite || pp.participle) v.principalParts = Object.fromEntries(Object.entries(pp).filter(([, x]) => x));
  // 表頭有時寫 "haben or sein"，拆開去重
  const aux = [...new Set(e.forms.filter((f) => (f.t || []).includes('auxiliary')).flatMap((f) => f.f.split(/\s+or\s+/)))];
  if (aux.length) v.auxiliary = aux;
  return Object.keys(v).length ? v : undefined;
}

function adjInfo(e) {
  const pick = (tag) => [...new Set(e.forms.filter((f) => f.t && f.t.length === 1 && f.t[0] === tag).map((f) => f.f))];
  const comparative = pick('comparative');
  const superlative = pick('superlative');
  const a = {};
  if (comparative.length) a.comparative = comparative;
  if (superlative.length) a.superlative = superlative;
  return Object.keys(a).length ? a : undefined;
}

function prepInfo(e) {
  const cases = new Set();
  for (const s of e.senses) {
    for (const m of (s.rg || '').matchAll(/\[with (dative|accusative|genitive)(?: or (dative|accusative|genitive))?/g)) {
      cases.add(m[1]);
      if (m[2]) cases.add(m[2]);
    }
  }
  if (!cases.size) return undefined; // 資料沒寫就留空（mit、für 等常見介系詞 Wiktionary 英文版沒有標記）
  let c;
  if (cases.has('dative') && cases.has('accusative')) c = 'Wechsel';
  else c = [...cases].map((x) => ({ dative: 'Dat', accusative: 'Akk', genitive: 'Gen' })[x]).join('/');
  return { case: c };
}

function glosses(e) {
  const senses = e.senses.filter((s) => !isFormOfSense(s) && s.g && s.g.length);
  const ranked = [
    ...senses.filter((s) => !(s.t || []).some((t) => LOW_PRIORITY_SENSE.test(t))),
    ...senses.filter((s) => (s.t || []).some((t) => LOW_PRIORITY_SENSE.test(t))),
  ];
  const out = [];
  for (const s of ranked) {
    // kaikki 的 glosses 是 [上層義, 子義]。上層義簡短（例 "to understand"）就用上層，
    // 否則（例 "describes an abstract directionality…:"）用子義。兩者都是 Wiktionary 原文。
    const parent = s.g[0].trim();
    const g = (s.g.length > 1 && parent.length <= 40 && !parent.endsWith(':') ? parent : s.g[s.g.length - 1]).trim();
    if (g && !out.includes(g)) out.push(g);
    if (out.length === 3) break;
  }
  return out;
}

// ---------- 第二遍：組 lexicon 與 forms ----------

const lexicon = Object.create(null);
const tableRecs = []; // [form, lemma, pos, tags, i]
const pendingFormOf = []; // 從「變化形條目」來的：[form, lemma, pos, tags]
const participleAdjRecs = []; // 分詞形容詞的字形：[form, adjWord, tags]
const dropped = { nounNoGender: [], nounNoPlural: [] };

let n2 = 0;
for await (const e of readSlim()) {
  n2++;
  const isLemma = isLemmaEntry(e);

  if (isLemma && selected.has(e.word)) {
    const entry = { pos: e.pos };
    let ok = true;
    if (e.pos === 'noun') {
      const gender = nounGender(e);
      const pl = nounPlural(e, gender);
      // T5：查得到的名詞必須同時有冠詞與複數（或字典明確標「無複數」）。資料缺 → 不收，寧可查不到也不給半張卡。
      if (!gender.length) { ok = false; dropped.nounNoGender.push(e.word); }
      else if (!pl.plural && !pl.noPlural) { ok = false; dropped.nounNoPlural.push(e.word); }
      else Object.assign(entry, { gender }, pl);
    } else if (e.pos === 'verb') {
      const v = verbInfo(e); if (v) entry.verb = v;
    } else if (e.pos === 'adj') {
      const a = adjInfo(e); if (a) entry.adj = a;
    } else if (e.pos === 'prep') {
      const p = prepInfo(e); if (p) entry.prep = p;
    }
    entry.glosses = glosses(e);
    // 候選排序用（SPEC §3）：原形本身在詞頻表的名次；不在表上就不給（排最後）
    const r = freqRank.get(e.word.toLowerCase());
    if (r) entry.rank = r;
    // 所有正式義項都標 rare／archaic／obsolete → 整個條目收進「其他讀法」
    const real = e.senses.filter((s) => !isFormOfSense(s) && s.g && s.g.length);
    if (real.length && real.every((s) => (s.t || []).some((t) => RARE_TAGS.has(t)))) entry.rare = true;
    if (ok) {
      if (!lexicon[e.word]) lexicon[e.word] = [];
      const i = lexicon[e.word].push(entry) - 1;
      tableRecs.push([e.word, e.word, e.pos, [], i]);
      for (const f of entryForms(e)) if (usableForm(f)) tableRecs.push([f.f, e.word, e.pos, normTags(f.t), i]);
    }
  }

  // 分詞當形容詞（vereinigt → vereinigen）：形容詞本身不一定入選，但動詞入選就要能還原
  if (isLemma && e.pos === 'adj' && participleOf.has(e.word)) {
    participleAdjRecs.push([e.word, e.word, []]);
    for (const f of entryForms(e)) if (usableForm(f)) participleAdjRecs.push([f.f, e.word, normTags(f.t)]);
  }

  for (const { target, tags } of formOfTargets(e)) {
    if (!TOKEN_RE.test(e.word)) continue;
    if (selected.has(target)) pendingFormOf.push([e.word, target, e.pos, normTags(tags)]);
    if (e.pos === 'adj' && participleOf.has(target)) participleAdjRecs.push([e.word, target, normTags(tags)]);
  }
}
log(`第二遍：${n2} 筆條目；lexicon ${Object.keys(lexicon).length} 原形；名詞缺性別 ${dropped.nounNoGender.length}、缺複數 ${dropped.nounNoPlural.length}（不收）`);

// ---------- 合併成 forms ----------

const groups = new Map(); // form → Map("lemma\ti" → {lemma,pos,i,tagsets:[]})
function addRec(form, lemma, pos, tags, i) {
  if (!groups.has(form)) groups.set(form, new Map());
  const g = groups.get(form);
  const k = `${lemma}\t${i}`;
  if (!g.has(k)) g.set(k, { lemma, pos, i, tagsets: [] });
  g.get(k).tagsets.push(tags);
}
for (const [f, l, p, t, i] of tableRecs) addRec(f, l, p, t, i);

// 變化形條目：只在完整變化表沒涵蓋這個（字形, 原形, 詞性）時才補，因為變化表知道是哪一個同形詞，條目不知道
let formOfAdded = 0;
for (const [form, lemma, pos, tags] of pendingFormOf) {
  const entries = lexicon[lemma];
  if (!entries) continue;
  const g = groups.get(form);
  if (g && [...g.values()].some((r) => r.lemma === lemma && r.pos === pos)) continue;
  entries.forEach((en, i) => { if (en.pos === pos) { addRec(form, lemma, pos, tags, i); formOfAdded++; } });
}

let chained = 0;
for (const [form, adjWord, tags] of participleAdjRecs) {
  for (const verb of participleOf.get(adjWord) || []) {
    const entries = lexicon[verb];
    if (!entries) continue;
    entries.forEach((en, i) => {
      if (en.pos !== 'verb') return;
      addRec(form, verb, 'verb', [...new Set([...tags, 'participle', 'past'])].sort(), i);
      chained++;
    });
  }
}

// 同一個（字形, 條目）的 tag 組合：去重，並刪掉被更完整組合包含的子集（例：表頭 [preterite] 被表格 [first-person, preterite, singular] 包含）
const forms = Object.create(null);
let formRecCount = 0;
const rejected = [];
for (const form of [...groups.keys()].sort()) {
  const list = [];
  for (const r of groups.get(form).values()) {
    const uniq = [...new Map(r.tagsets.map((t) => [t.join(','), t])).values()];
    const keep = uniq.filter((t) => !uniq.some((o) => o !== t && o.length > t.length && t.every((x) => o.includes(x))));
    for (const t of keep) list.push({ lemma: r.lemma, pos: r.pos, tags: t, i: r.i });
  }
  // P2.2（A5）資料健檢：變化形跟原形沒有共同字首／字幹、又不在已知不規則清單 → 壞資料（amtshandeln 的 e/en/st/t…）
  const good = list.filter((r) => {
    if (formPlausible(form, r.lemma)) return true;
    rejected.push({ form, lemma: r.lemma, pos: r.pos, tags: r.tags.join(',') });
    return false;
  });
  if (good.length) { forms[form] = good; formRecCount += good.length; }
}
log(`forms：${Object.keys(forms).length} 字形、${formRecCount} 筆（變化形條目補 ${formOfAdded}，分詞形容詞串接 ${chained}）`);
log(`資料健檢：掃過 ${groups.size} 個字形，剔除 ${rejected.length} 筆（清單在 build/build-report.json）`);

// ---------- 寫檔與大小 ----------

mkdirSync(OUT, { recursive: true });
const files = { 'forms.json': JSON.stringify(forms), 'lexicon.json': JSON.stringify(lexicon) };
let gzTotal = 0, gzForms = 0;
for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(OUT, name), body);
  const gz = gzipSync(body, { level: 9 }).length;
  gzTotal += gz;
  if (name === 'forms.json') gzForms = gz;
  log(`${name}：原始 ${(body.length / 1048576).toFixed(2)} MB，gzip ${(gz / 1048576).toFixed(2)} MB`);
}
// ---------- 執行期分片（P1，T6 效能）：tags 改成編號，依小寫字形雜湊分 SHARD_COUNT 片（P2.5 起 64）----------
// 記錄格式：[lemma, pos, tagset 編號, i]；data/forms.json 保留作為可讀的正本與 P0 測試依據
const RUNTIME = join(OUT, 'runtime');
mkdirSync(RUNTIME, { recursive: true });
const tagIndex = new Map();
const tagsets = [];
const shards = Array.from({ length: SHARD_COUNT }, () => Object.create(null));
for (const [form, list] of Object.entries(forms)) {
  shards[shardOf(form)][form] = list.map((r) => {
    const k = r.tags.join(',');
    if (!tagIndex.has(k)) { tagIndex.set(k, tagsets.length); tagsets.push(r.tags); }
    return [r.lemma, r.pos, tagIndex.get(k), r.i];
  });
}
const runtimeFiles = { 'tagsets.json': JSON.stringify(tagsets) };
shards.forEach((s, n) => { runtimeFiles[shardName(n)] = JSON.stringify(s); });
let rtRaw = 0, rtMax = 0;
for (const [name, body] of Object.entries(runtimeFiles)) {
  writeFileSync(join(RUNTIME, name), body);
  const bytes = Buffer.byteLength(body);
  rtRaw += bytes;
  if (name.startsWith('f-')) rtMax = Math.max(rtMax, bytes);
  gzTotal += gzipSync(body, { level: 9 }).length;
}
log(`runtime 指紋 ${stampRuntime(ROOT)}（P2.6：分片與 sw.js 已蓋上標籤表指紋）`);
log(`runtime：${SHARD_COUNT} 片合計 ${(rtRaw / 1048576).toFixed(2)} MB，最大一片 ${(rtMax / 1024).toFixed(0)} KB，tag 組合 ${tagsets.length} 種`);
// P2.5：SPEC §3 的上限只算上線部分（forms.json 不上傳）；手寫的小 json 不在這裡算，p0-data 測試會把全部上線檔一起量
log(`data/ gzip：建置產物合計 ${(gzTotal / 1048576).toFixed(2)} MB，其中上線部分 ${((gzTotal - gzForms) / 1048576).toFixed(2)} MB（上限 25 MB）`);
writeFileSync(join(BUILD, 'build-report.json'), JSON.stringify({
  target: TARGET, freqRankUsed: lastRank, lemmasFromFreq: beforeSeeds, lemmas: Object.keys(lexicon).length,
  lexiconEntries: Object.values(lexicon).reduce((a, x) => a + x.length, 0),
  forms: Object.keys(forms).length, formRecords: formRecCount, gzipBytes: gzTotal, gzipBytesDeployed: gzTotal - gzForms, shards: SHARD_COUNT, runtimeMaxShardBytes: rtMax, freqFile: FREQ_FILE,
  droppedNounNoGender: dropped.nounNoGender, droppedNounNoPlural: dropped.nounNoPlural,
  healthCheck: { scannedKeys: groups.size, rejectedCount: rejected.length, rejected },
}, null, 1));
