// P6（SPEC §5.1 A）拼字建議：只從字典的原形裡找拼法最接近的（編輯距離 ≤ 2，相鄰字母對調算 1）。
// 建議不是答案：這裡只回傳一個字串，Sherry 按了才換（parse.js 的 acceptSuggestion）。
const MAX = 2;
const indexCache = new WeakMap();

// 原形依長度分桶（小寫）；同一個小寫拼法有好幾個原形時留詞頻最高的
function lemmaIndex(dict) {
  let idx = indexCache.get(dict);
  if (idx) return idx;
  const best = new Map();
  for (const lemma of Object.keys(dict.lexicon)) {
    if (!/^\p{L}+$/u.test(lemma)) continue; // 片語、帶連字號的條目不當建議
    const rank = Math.min(...dict.lexicon[lemma].map((e) => e.rank || Infinity));
    const low = lemma.toLowerCase();
    const cur = best.get(low);
    if (!cur || rank < cur.rank) best.set(low, { lemma, rank });
  }
  idx = new Map();
  for (const [low, v] of best) {
    if (!idx.has(low.length)) idx.set(low.length, []);
    idx.get(low.length).push({ low, mask: letterMask(low), ...v });
  }
  indexCache.set(dict, idx);
  return idx;
}

// 「出現過哪些字母」的 32 位元指紋（變音字母各佔一位，其他字母雜湊進剩下的位）。
// 一次編輯最多讓指紋差 2 個位元，所以距離 ≤ 2 的字指紋最多差 4 位：先用它篩掉大部分原形，才算真正的距離（TK 效能）
function letterMask(s) {
  let m = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    let bit;
    if (c >= 97 && c <= 122) bit = c - 97;
    else if (ch === 'ä') bit = 26; else if (ch === 'ö') bit = 27; else if (ch === 'ü') bit = 28; else if (ch === 'ß') bit = 29;
    else bit = 30 + (c % 2);
    m |= 1 << bit;
  }
  return m >>> 0;
}
function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

// Damerau–Levenshtein（OSA），超過上限提早放棄
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length, m = b.length;
  let prev2 = null, prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

// 一個拼法 → 最接近的原形（距離小的先，同距離取詞頻高的）；沒有就 null
export function closestLemma(word, dict) {
  const w = String(word).toLowerCase();
  if (w.length < 3) return null; // 太短的字，距離 2 幾乎什麼都對得上，不給建議
  const idx = lemmaIndex(dict);
  const wm = letterMask(w);
  let best = null;
  for (let len = w.length - MAX; len <= w.length + MAX; len++) {
    for (const c of idx.get(len) || []) {
      if (popcount((wm ^ c.mask) >>> 0) > 2 * MAX) continue;
      // 只差大小寫（abend → Abend）距離 0：查詢的大小寫規則查不到它，建議照給
      const d = distance(w, c.low, MAX);
      if (d > MAX) continue;
      if (!best || d < best.d || (d === best.d && c.rank < best.rank)) best = { d, lemma: c.lemma, rank: c.rank };
    }
  }
  return best ? best.lemma : null;
}

// 德文段的字（已知其中有查不到的）→ 建議字串或 null。
// 先試「拆開寫的複合詞」（feiren abend → Feierabend），再試逐字換掉查不到的字（全部都找得到才給）。
export function suggestSpelling(words, dict, isKnown = () => false) {
  if (!words.length) return null;
  if (words.length > 1) {
    const joined = closestLemma(words.join(''), dict);
    if (joined) return joined;
  }
  const out = [];
  for (const w of words) {
    if (isKnown(w)) { out.push(w); continue; }
    const s = closestLemma(w, dict);
    if (!s) return null;
    out.push(s);
  }
  return out.join(' ');
}
