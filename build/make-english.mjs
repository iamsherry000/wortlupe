// P6.6／P6.7（SPEC §5.1 F）：離線英文詞表。單字本判斷「這個字是不是英文」用，取代 P6 的「字典英文解釋裡出現過」。
// 來源：SCOWL／ESDB（Kevin Atkinson，寬鬆授權：保留版權與授權聲明即可自由使用、散布）。
//   - en_US size 50（P6.6）
//   - en_GB size 60（P6.7：Sherry 在德國，筆記常用英式拼法 colour、favourite、hoover、loo、licence；
//     hoover／loo 在 size 50 沒有，所以英式用 60）
// 下載網址（2026-09-30 取得，原檔在 build/raw/，不進版控）：
//   http://app.aspell.net/create?max_size=50&spelling=US&max_variant=0&diacritic=strip&special=hacker&download=wordlist&encoding=utf-8&format=inline
//   http://app.aspell.net/create?max_size=60&spelling=GBs&spelling=GBz&max_variant=0&diacritic=strip&special=hacker&download=wordlist&encoding=utf-8&format=inline
// 產物：data/english-words.json = { license, source, words: "a\naa\n…" }（小寫、一行一個）
// 只收小寫字與全大寫縮寫（ID、TV）；首字大寫的專有名詞（Paris、Berlin）不收，免得德文名詞被當成英文。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = ['build/raw/scowl-50-en_US.txt', 'build/raw/scowl-60-en_GB.txt'];
const out = new Set();
let license = '';
for (const src of SOURCES) {
  const raw = readFileSync(join(ROOT, src), 'utf8').replace(/\r\n/g, '\n');
  const [header, body] = raw.split('\n---\n');
  if (!license) license = header.slice(header.indexOf('Copyright')).trim();
  for (const w of body.split('\n')) {
    if (!/^[A-Za-z]+$/.test(w)) continue; // 所有格、連字號、數字不收
    if (w === w.toLowerCase()) out.add(w);
    else if (w.length > 1 && w === w.toUpperCase()) out.add(w.toLowerCase());
  }
}
const words = [...out].sort();
writeFileSync(join(ROOT, 'data/english-words.json'), JSON.stringify({
  source: 'SCOWL/ESDB en_US size 50 + en_GB size 60, https://wordlist.aspell.net',
  license,
  words: words.join('\n'),
}));
console.log(`english-words.json：${words.length} 字`);
