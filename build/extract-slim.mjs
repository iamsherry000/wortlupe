// 第一步：把 1 GB 的 kaikki 德文 dump 串流瘦身成只留 P0 需要欄位的 slim.jsonl。
// 為什麼要這步：之後調整建置規則要重跑很多次，每次都啃 1 GB 太重（Sherry 同時在用筆電）。
// 用法：node build/extract-slim.mjs
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* 無權限就算了 */ }

const RAW = join(dirname(fileURLToPath(import.meta.url)), 'raw');
const src = join(RAW, 'kaikki-de.jsonl');
const dst = join(RAW, 'slim.jsonl');

const NOISE_FORM_TAGS = new Set(['table-tags', 'inflection-template', 'class']);
const KEEP_CAT = /German (strong|weak|irregular|separable|mixed|class|plurale|singularia|uncountable|pluralia)|German .*(verbs|nouns) with|German .*prepositions/i;

const out = createWriteStream(dst);
const rl = createInterface({ input: createReadStream(src, { highWaterMark: 1 << 20 }), crlfDelay: Infinity });

let n = 0, kept = 0;
const t0 = Date.now();
for await (const line of rl) {
  n++;
  if (!line) continue;
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  if (e.lang_code && e.lang_code !== 'de') continue;
  const slim = {
    word: e.word,
    pos: e.pos,
    etym: e.etymology_number,
    tags: e.tags,
    head: (e.head_templates || []).map((h) => ({ name: h.name, args: h.args, exp: h.expansion })),
    forms: (e.forms || [])
      .filter((f) => !(f.tags || []).some((t) => NOISE_FORM_TAGS.has(t)))
      .map((f) => (f.tags && f.tags.length ? { f: f.form, t: f.tags } : { f: f.form })),
    senses: (e.senses || []).map((s) => {
      const o = {};
      if (s.glosses) o.g = s.glosses;
      if (s.tags) o.t = s.tags;
      if (s.form_of) o.of = s.form_of.map((x) => x.word);
      // 介系詞支配的格只寫在 raw_glosses 的 "[with dative]" 標記裡
      const rg = (s.raw_glosses || []).join(' ');
      if (/\[with (dative|accusative|genitive)/.test(rg)) o.rg = rg;
      return o;
    }),
    cats: (e.categories || [])
      .map((c) => (typeof c === 'string' ? c : c.name))
      .filter((c) => c && KEEP_CAT.test(c)),
  };
  out.write(JSON.stringify(slim) + '\n');
  kept++;
  if (n % 100000 === 0) console.log(`${n} 行，${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
}
out.end();
console.log(`完成：讀 ${n} 行，保留 ${kept} 筆，${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
