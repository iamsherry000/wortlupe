// P2.2 稽核：詞頻前 500 名的字卡首要讀法，輸出 build/top500-primary.txt 給 Charles 一次看完。
// 每個字放在中性位置（「und 字」，不在句首；查不到小寫就試首字大寫＝名詞），取字卡第一個讀法。
// 用法：node build/audit-top500.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFreqWords } from './freq.mjs';
import { tokenize } from '../src/tokenize.js';
import { createDictionary } from '../src/dict.js';
import { buildCard } from '../src/card-model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fileFetch = async (url) => {
  const body = readFileSync(join(ROOT, url.replace(/^\.?\//, '')), 'utf8');
  return { ok: true, status: 200, text: async () => body };
};
const dict = createDictionary({ base: './', fetchImpl: fileFetch });
await dict.ready();
const freq = loadFreqWords().slice(0, 500); // 前 500 名在 de_50k 與 de_full 相同

async function top(word) {
  const tokens = tokenize(`und ${word}`);
  await dict.ensure(tokens.filter((t) => t.type === 'word').map((t) => t.text));
  const tok = tokens.filter((t) => t.type === 'word')[1];
  if (!tok || tok.text !== word) return { status: 'notword', readings: [] }; // 詞頻表裡的數字、縮寫等不是字
  return buildCard(tokens, tok.index, dict);
}
const lines = ['# Wortlupe 字卡首要讀法稽核：詞頻前 500 名（P2.2，RD 產生）', '# 格式：名次  字 → 原形（詞性）｜這個形｜首要義項；[closed] = 來自封閉詞類表；[noun] = 小寫查不到，改查首字大寫', ''];
let n = 0;
for (const w of freq) {
  n++;
  let card = await top(w), note = '';
  if (card.status === 'notword') { lines.push(`${String(n).padStart(3)}  ${w} →（不是德文字，斷詞時不可點）`); continue; }
  if (card.status === 'notfound' || (!card.readings.length && !card.contraction)) {
    const cap = w[0].toUpperCase() + w.slice(1);
    const c2 = await top(cap);
    if (c2.status === 'found') { card = c2; note = ' [noun]'; }
  }
  if (card.contraction) { lines.push(`${String(n).padStart(3)}  ${w} → ${card.contraction.parts.join(' + ')}（contraction）`); continue; }
  const r = card.readings[0];
  if (!r) { lines.push(`${String(n).padStart(3)}  ${w} → Not in dictionary`); continue; }
  const fmt = (x) => {
    const form = (x.formDescriptions || []).filter((d) => d !== 'dictionary form').slice(0, 2).join('; ');
    return `${x.lemma}（${x.pos}）${x.closed ? ' [closed]' : ''}｜${form || '—'}｜${(x.glosses || [])[0] || '—'}`;
  };
  let line = `${String(n).padStart(3)}  ${w} → ${fmt(r)}${note}`;
  // 詞頻表全是小寫；名詞在真實文字裡是大寫，另外列出大寫查法的結果（haus → hausen 只是小寫查法的假象，Haus → Haus 才是實際會看到的）
  if (!note && !r.closed) { // 封閉詞類句首大寫已由表處理；句中大寫的 Ich／Mal 本來就是名詞，不列
    const cap = w[0].toUpperCase() + w.slice(1);
    const c2 = cap !== w ? await top(cap) : null;
    const r2 = c2 && c2.readings && c2.readings[0];
    if (r2 && r2.pos === 'noun' && (r2.lemma !== r.lemma || r2.pos !== r.pos)) line += `　｜大寫 ${cap} → ${fmt(r2)}`;
  }
  lines.push(line);
}
writeFileSync(join(ROOT, 'build/top500-primary.txt'), `${lines.join('\n')}\n`);
console.log(`build/top500-primary.txt：${n} 行`);
