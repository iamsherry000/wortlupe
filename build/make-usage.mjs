// P2.6（SPEC §4.5 B）：用法句型 data/usage.json ← build/raw/kaikki-de.jsonl（全量檔；slim 版把 info_templates 與例句丟了）。
// 只收 Wiktionary 義項上明寫的東西：reflexive 標記、+obj 模板（介系詞＋格、或只標格）、該義項第一個有英譯的例句。
// 不手寫、不補寫（§4.4）。只收 lexicon.json 裡有的「原形＋詞性」。
//
// 用法：node build/make-usage.mjs
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* 無權限就算了 */ }

const BUILD = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BUILD, '..');
const lexicon = JSON.parse(readFileSync(join(ROOT, 'data', 'lexicon.json'), 'utf8'));
const MAX_PER_WORD = 4;
const MAX_EXAMPLE = 110;
// 跟 build-data.mjs 同一套：這些義項對 A1–C1 學習者是雜訊
const SKIP_SENSE = /^(obsolete|archaic|dated|rare|historical|poetic|literary|dialectal|regional|Austria|Switzerland|Swiss|Bavaria|vulgar|derogatory|offensive)$/;
const posOf = { verb: 'verb', adj: 'adj', noun: 'noun' };

// "[with auf (+ accusative) ‘to something’]" → "auf + accusative (to something)"
export function objText(expansion) {
  return expansion.replace(/^\[with\s+/, '').replace(/\]$/, '')
    .replace(/\s*\(\+\s*([^)]+)\)/g, ' + $1')
    .replace(/\s*‘([^’]+)’/g, ' ($1)')
    .replace(/\s+/g, ' ').trim();
}
// 模板參數裡的介系詞：":auf(acc)<…>"、":mit"、":von&dat<…>"，多個用 " + " 分開
export function prepsOf(arg) {
  return String(arg || '').split(/\s*\+\s*/).map((p) => /^:([a-zäöüß]+)/i.exec(p)).filter(Boolean).map((m) => m[1].toLowerCase());
}

function pickExample(sense) {
  const ex = (sense.examples || [])
    .filter((x) => x.text && (x.english || x.translation) && x.text.length <= MAX_EXAMPLE && !/\[\.\.\.\]|…/.test(x.text));
  if (!ex.length) return null;
  ex.sort((a, b) => a.text.length - b.text.length);
  return [ex[0].text, ex[0].english || ex[0].translation];
}

const entries = Object.create(null);
let senses = 0;
const rl = createInterface({ input: createReadStream(join(BUILD, 'raw', 'kaikki-de.jsonl'), { highWaterMark: 1 << 20 }), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.includes('"reflexive"') && !line.includes('"+obj"')) continue;
  const e = JSON.parse(line);
  const pos = posOf[e.pos];
  if (e.lang_code !== 'de' || !pos || !lexicon[e.word] || !lexicon[e.word].some((x) => x.pos === pos)) continue;
  for (const s of e.senses || []) {
    const tags = s.tags || [];
    if (tags.some((t) => SKIP_SENSE.test(t)) || tags.includes('form-of') || !s.glosses || !s.glosses.length) continue;
    const reflexive = tags.includes('reflexive');
    const objs = (s.info_templates || []).filter((t) => t.name === '+obj' && t.expansion);
    if (!reflexive && !objs.length) continue;
    const u = { gloss: s.glosses[s.glosses.length - 1] };
    if (reflexive) u.refl = true;
    if (objs.length) {
      u.obj = objs.map((t) => objText(t.expansion)).join('; ');
      // 只收字典裡真的是介系詞的字（gehen 的 ":Weg" 模板會被解析成 weg，ich gehe weg 就會誤標）
      const preps = [...new Set(objs.flatMap((t) => prepsOf(t.args && t.args['2'])))]
        .filter((p) => (lexicon[p] || []).some((x) => x.pos === 'prep'));
      if (preps.length) u.preps = preps;
    }
    const ex = pickExample(s);
    if (ex) u.ex = ex;
    const key = `${e.word}|${pos}`;
    const list = entries[key] || (entries[key] = []);
    // 同一句型只留第一個義項（Wiktionary 順序＝常用在前）
    if (list.length >= MAX_PER_WORD || list.some((x) => !!x.refl === !!u.refl && x.obj === u.obj)) continue;
    list.push(u);
    senses++;
  }
}

// ---------- 手寫補充（Sherry 9/27：沒被 Wiktionary 標記的字要自己寫好）----------
// 同一句型＝反身與否＋介系詞集合相同。Wiktionary 已有就不重複，只補它缺的例句；also=true（意思不同）照樣加。
const manual = JSON.parse(readFileSync(join(BUILD, 'usage-manual.json'), 'utf8')).entries;
const keyOf = (u) => `${u.refl ? 'sich' : ''}|${[...(u.preps || [])].sort().join(',') || u.obj || ''}`;
let added = 0, filledEx = 0;
const missing = [];
for (const [key, list] of Object.entries(manual)) {
  const [lemma, pos] = key.split('|');
  if (!lexicon[lemma] || !lexicon[lemma].some((x) => x.pos === pos)) { missing.push(key); continue; }
  const cur = entries[key] || (entries[key] = []);
  for (const m of list) {
    const u = { gloss: m.gloss, src: 'manual' };
    for (const f of ['refl', 'obj', 'preps', 'with', 'pattern', 'ex']) if (m[f] !== undefined) u[f] = m[f];
    const same = !m.also && cur.find((x) => keyOf(x) === keyOf(u));
    if (same) {
      if (!same.ex && u.ex) { same.ex = u.ex; same.exSrc = 'manual'; filledEx++; }
      continue;
    }
    cur.push(u);
    added++;
  }
}
if (missing.length) console.log(`手寫表裡字典沒有的原形＋詞性（沒收）：${missing.join(', ')}`);
console.log(`手寫補充：新增 ${added} 條句型、補 ${filledEx} 個例句`);

writeFileSync(join(ROOT, 'data', 'usage.json'), JSON.stringify({
  source: 'English Wiktionary via kaikki.org (CC BY-SA 4.0 and GFDL): reflexive tags, +obj templates, examples; entries with src "manual" are hand-written (build/usage-manual.json)',
  entries,
}));
const size = Buffer.byteLength(JSON.stringify(entries));
console.log(`usage.json：${Object.keys(entries).length} 個原形＋詞性，${senses + added} 條句型（Wiktionary ${senses}＋手寫 ${added}），${(size / 1024).toFixed(0)} KB`);
for (const k of ['freuen|verb', 'warten|verb', 'denken|verb', 'gehen|verb', 'stolz|adj', 'Angst|noun', 'Lust|noun']) {
  console.log(k, JSON.stringify(entries[k] || null));
}
