// P2.2 加修：小寫名詞表 data/lowercase-nouns.json（WhatsApp 常把名詞打成小寫：hab keine zeit、schönen tag noch）。
// 用法：node build/make-lowercase-nouns.mjs（要在 build-data.mjs 之後跑；讀 data/forms.json、build/raw/de_full.txt、data/closed-class.json）
//
// 判斷「首字大寫版本是明顯更常用的名詞」：
//   詞頻表只有小寫字形，而 zeit／essen 這種字串兩種讀法共用，字串本身的名次分不出是誰的。
//   所以每個讀法的「證據」＝它自己能獨占的字形裡最常見的那個名次：
//     - 對方沒有的字形（Zeit 的 zeiten、essen 的 gegessen）算自己的；
//     - 兩邊都有的字形，只有在「對自己是主要形、對對方是次要形」時才算自己的
//       （ende 對名詞 Ende 是原形，對動詞 enden 只是第一人稱單數／命令式／虛擬式 → 算 Ende 的）。
//     動詞的次要形：命令式、虛擬式、第二人稱、第一人稱單數；其他（不定詞、第三人稱、複數、分詞）是主要形。
//   Zipf 定律：名次比 ≈ 詞頻比。名詞證據要比小寫讀法強到一個門檻才排第一：
//     - 門檻 3（詞頻高三倍）：這個字對小寫讀法只是次要形（tag、ende、glück、hause…）；
//     - 門檻 10（詞頻高一個數量級）：這個字本身就是小寫讀法的主要形（essen、fragen、sorgen 是不定詞）。
//       這時字串本身就是動詞的看板形式，名詞要壓倒性常見才翻（stunden：Stunde 證據 650 vs 動詞 stunden 44573）。
//   小寫字本身完全查不到小寫讀法時不需要這張表，執行期直接退回大寫名詞。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFreqWords } from './freq.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RATIO_MINOR = 3;
export const RATIO_MAJOR = 10;

const forms = JSON.parse(readFileSync(join(ROOT, 'data/forms.json'), 'utf8'));
const lexicon = JSON.parse(readFileSync(join(ROOT, 'data/lexicon.json'), 'utf8'));
const closed = JSON.parse(readFileSync(join(ROOT, 'data/closed-class.json'), 'utf8')).forms;
const colloquial = JSON.parse(readFileSync(join(ROOT, 'data/colloquial.json'), 'utf8'));
const freq = loadFreqWords(); // P2.5：完整版詞頻表（前 50,000 名與 de_50k 相同）
const rank = new Map();
freq.forEach((w, i) => { const k = w.toLowerCase(); if (!rank.has(k)) rank.set(k, i + 1); });

// (原形|詞性) → Map(小寫字形 → [tagset…])
const byLemma = new Map();
for (const [f, list] of Object.entries(forms)) for (const r of list) {
  const key = `${r.lemma}|${r.pos}`;
  if (!byLemma.has(key)) byLemma.set(key, new Map());
  const m = byLemma.get(key); const k = f.toLowerCase();
  if (!m.has(k)) m.set(k, []);
  m.get(k).push(r.tags || []);
}
const minorTags = (t) => t.includes('imperative') || t.some((x) => x.startsWith('subjunctive')) || t.includes('second-person')
  || (t.includes('first-person') && t.includes('singular'));
const isMinor = (key, f) => key.endsWith('|verb') && (byLemma.get(key).get(f) || []).every(minorTags);
// 字形 → 用到它的 (原形|詞性) 集合：被第三個原形共用的字形誰都不算（danke 是 Dank 的與格，也是感嘆詞 danke）
const users = new Map();
for (const [key, m] of byLemma) for (const f of m.keys()) { if (!users.has(f)) users.set(f, new Set()); users.get(f).add(key); }
function evidence(X, Y) {
  let best = Infinity, form = null;
  const yf = byLemma.get(Y) || new Map();
  for (const f of byLemma.get(X).keys()) {
    if ([...users.get(f)].some((u) => u !== X && u !== Y)) continue;
    if (yf.has(f) && !(!isMinor(X, f) && isMinor(Y, f))) continue;
    const r = rank.get(f) || Infinity;
    if (r < best) { best = r; form = f; }
  }
  return { rank: best, form };
}
// 小寫字本身就是一個正常小寫詞（weg、wohl、links、falls、bisschen、klasse 的原形，或形容詞變化形 junge、alten…）
// → 小寫是正確拼法，不翻成名詞。副詞、連接詞、感嘆詞看原形；形容詞連變化形也擋（der junge Mann 的 junge 一定小寫）。
// 介系詞／代名詞／限定詞／數詞不在這裡擋：真正的封閉詞類都在 closed-class.json（上面已跳過），
// 字典裡剩下的（zeit「在…期間」這種古雅介系詞）交給詞頻判斷。
const LOWER_WORD_POS = new Set(['adv', 'adj', 'intj', 'particle', 'conj']);

const out = {};
const stats = { checked: 0, promoted: 0 };
for (const [key, list] of Object.entries(forms)) {
  if (key !== key.toLowerCase() || closed[key] || colloquial[key]) continue;
  const cap = key.charAt(0).toUpperCase() + key.slice(1);
  if (cap === key || !forms[cap]) continue;
  const nouns = [...new Set(forms[cap].filter((r) => r.pos === 'noun').map((r) => `${r.lemma}|${r.pos}`))];
  const live = list.filter((r) => r.pos !== 'noun' && !/^\p{Lu}/u.test(r.lemma) && !(lexicon[r.lemma] && lexicon[r.lemma][r.i] && lexicon[r.lemma][r.i].rare));
  if (!nouns.length) continue;
  if (live.some((r) => LOWER_WORD_POS.has(r.pos) && (r.lemma === key || r.pos === 'adj'))) continue;
  const lows = [...new Set(live.map((r) => `${r.lemma}|${r.pos}`))];
  if (!lows.length) { // 小寫讀法全是罕用（frau「人們」古語代名詞）→ 名詞
    if (list.some((r) => r.pos !== 'noun')) { out[key] = nouns[0].split('|')[0]; stats.promoted++; }
    continue;
  }
  stats.checked++;
  // 名詞證據：扣掉跟任何小寫讀法共用的字形後仍然最強的名詞
  let noun = null;
  for (const N of nouns) {
    const ev = Math.max(...lows.map((L) => evidence(N, L).rank));
    if (!noun || ev < noun.ev) noun = { key: N, ev };
  }
  const low = Math.min(...lows.map((L) => evidence(L, noun.key).rank));
  if (!Number.isFinite(noun.ev)) continue;
  const major = lows.some((L) => !isMinor(L, key));
  const need = major ? RATIO_MAJOR : RATIO_MINOR;
  if (low / noun.ev >= need) {
    out[key] = noun.key.split('|')[0];
    stats.promoted++;
  }
}

const doc = {
  _說明: `P2.2 加修：小寫字 → 應該先當成哪個名詞（由 build/make-lowercase-nouns.mjs 從字形表與詞頻算出；門檻 ${RATIO_MINOR}／${RATIO_MAJOR} 倍，理由見腳本註解與 PHASE_LOG）。`,
  forms: out,
};
writeFileSync(join(ROOT, 'data/lowercase-nouns.json'), JSON.stringify(doc));
console.log(`檢查 ${stats.checked} 個小寫字，${stats.promoted} 個排到名詞`);
