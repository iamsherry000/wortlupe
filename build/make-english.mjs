// P6.6（SPEC §5.1 F）：離線英文詞表。單字本判斷「這個字是不是英文」用，取代 P6 的「字典英文解釋裡出現過」。
// 來源：SCOWL／ESDB（Kevin Atkinson，寬鬆授權：保留版權與授權聲明即可自由使用、散布），size 50、US。
// 下載網址（2026-09-30 取得，原檔在 build/raw/，不進版控）：
//   http://app.aspell.net/create?max_size=50&spelling=US&max_variant=0&diacritic=strip&special=hacker&download=wordlist&encoding=utf-8&format=inline
// 產物：data/english-words.json = { license, source, words: "a\naa\n…" }（小寫、一行一個）
// 只收小寫字與全大寫縮寫（ID、TV）；首字大寫的專有名詞（Paris、Berlin）不收，免得德文名詞被當成英文。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(ROOT, 'build/raw/scowl-50-en_US.txt'), 'utf8').replace(/\r\n/g, '\n');
const [header, body] = raw.split('\n---\n');
const license = header.slice(header.indexOf('Copyright')).trim();
const out = new Set();
for (const w of body.split('\n')) {
  if (!/^[A-Za-z]+$/.test(w)) continue; // 所有格、連字號、數字不收
  if (w === w.toLowerCase()) out.add(w);
  else if (w.length > 1 && w === w.toUpperCase()) out.add(w.toLowerCase());
}
const words = [...out].sort();
writeFileSync(join(ROOT, 'data/english-words.json'), JSON.stringify({
  source: 'SCOWL/ESDB size 50 (en_US), https://wordlist.aspell.net',
  license,
  words: words.join('\n'),
}));
console.log(`english-words.json：${words.length} 字`);
