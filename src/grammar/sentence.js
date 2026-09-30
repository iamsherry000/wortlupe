// 句子模型：把一句話的字查好字典、切好子句，給每條規則共用。
// 原則：分不清楚就不分（規則寧可漏判，不可誤判，SPEC §4.2）。
import {
  SUBORDINATORS, COORDINATORS, SUBJECT_PRONOUNS, SEPARABLE_PARTICLES, DER_WORDS, EIN_WORDS, articleForms,
  PRON_PERSON, LEAD_INTERJECTIONS, DET_BEFORE_NOUN,
} from './german.js';
import { closedList } from './closed.js';

const PERSON = ['first-person', 'second-person', 'third-person'];
const CLAUSE_BREAK = /^[,;:–—]$/;

// ---------- 單字判斷 ----------
export const verbCands = (w) => w.cands.filter((c) => c.pos === 'verb');
// 這個字當動詞合不合理：別的詞性的原形明顯更常用（einen 的冠詞 ein、bitte、Danke、Mein、acht）就不當動詞
// 原形名次來自「原形字串本身」的詞頻；原形剛好等於這個字時，名次被這個字的所有用法灌水，不可靠。
// 所以只拿「原形≠這個字」的非動詞讀法來比：einen（原形 ein 名次 15）→ 不當動詞；weiß（形容詞原形就是 weiß，不可靠）→ 照常當動詞。
const bestRank = (cs) => Math.min(Infinity, ...cs.map((c) => (c.entry && c.entry.rank) || Infinity));
export function verbPlausible(w) {
  const v = verbCands(w);
  if (!v.length) return false;
  const others = w.cands.filter((c) => c.pos !== 'verb' && c.lemma.toLowerCase() !== w.lower);
  // P2.1：動詞原形根本不在詞頻表（heute 的 heuen「曬乾草」），而這個字另有非動詞讀法 → 不當動詞
  if (bestRank(v) === Infinity && w.cands.some((c) => c.pos !== 'verb')) return false;
  // P2.3（M-3）：旁邊有人稱對得上的主詞代名詞就是動詞（Wir weisen Sie … hin：weisen 不是形容詞 weise）
  if ([w.prev, w.next].some((p) => p && pronounAgrees(p, w))) return true;
  return bestRank(others) >= bestRank(v);
}
export function finiteCands(w, { imperative = false } = {}) {
  if (!verbPlausible(w)) return [];
  // P2.1（B5 根因）：wecken、besuchen 跟 wir/sie 的現在式同形。緊接在 zu 後面的一定是不定詞，不是變位動詞
  if (w.prevLower === 'zu') return [];
  return verbCands(w).filter((c) => {
    if (c.tags.includes('participle') || c.tags.includes('infinitive') || c.tags.includes('infinitive-zu')) return false;
    if (PERSON.some((p) => c.tags.includes(p))) return !c.tags.includes('imperative') || imperative;
    return imperative && c.tags.includes('imperative');
  });
}
export const isFinite = (w, opts) => finiteCands(w, opts).length > 0;
// 確定是變位動詞：有變位讀法，而且不可能是原形或過去分詞（kann、habe、wollte 是；leben、werden、gerechnet 不是）
export const clearlyFinite = (w) => isFinite(w) && !isInfinitive(w) && !participleCands(w).length;
export const isInfinitive = (w) => verbCands(w).some((c) => c.tags.includes('infinitive') && !c.tags.includes('infinitive-zu')
  || (c.tags.length === 0 && w.lower === c.lemma.toLowerCase()));
// P2.3（M-1 根因）：同形的過去分詞（getroffen = treffen／triefen）照字典順序取第一個會取到罕用的 triefen。
// 一律依原形詞頻排序，最常用的動詞在前
export const participleCands = (w) => verbCands(w).filter((c) => c.tags.includes('participle') && c.tags.includes('past'))
  .map((c, k) => [c, k]).sort((a, b) => (((a[0].entry && a[0].entry.rank) || Infinity) - ((b[0].entry && b[0].entry.rank) || Infinity)) || a[1] - b[1])
  .map(([c]) => c);
export const isNoun = (w) => w.cands.some((c) => c.pos === 'noun');
export const hasPos = (w, pos) => w.cands.some((c) => c.pos === pos);
export const lemmasOf = (w, pos) => [...new Set(w.cands.filter((c) => !pos || c.pos === pos).map((c) => c.lemma))];

// ---------- 句子 ----------
export function buildSentence(tokens, s, dict) {
  const words = [];
  let commaBefore = false;
  let started = false;
  let endPunct = '';
  for (const t of tokens) {
    if (t.type === 'word' && t.sentence === s) {
      started = true;
      let cands = dict.lookup ? dict.lookup(t.text, { sentenceInitial: t.sentenceInitial }).candidates : [];
      // P2.2：封閉詞類只保留表上列的詞性（sieben 是數字不是動詞、Bitte 句首不是名詞、meinen 可以是限定詞或動詞）
      const closed = closedList(dict.closed, t.text, t.sentenceInitial);
      if (closed) {
        const allowed = new Set(closed.map((r) => r.pos));
        cands = cands.filter((c) => allowed.has(c.pos));
      }
      // P2.3：口語縮寫還原成單一個字的（hab → habe、is → ist、nich → nicht），句型規則也用還原後的字判斷
      const exp = !closed && dict.colloquial && dict.colloquial[t.text.toLowerCase()];
      if (Array.isArray(exp) && exp.every((e) => !/\s/.test(e)) && dict.lookup) {
        for (const e of exp) cands = [...cands, ...dict.lookup(e, { sentenceInitial: false }).candidates.map((c) => ({ ...c, viaColloquial: e }))];
      }
      const prev = words[words.length - 1];
      words.push({ tok: t, index: t.index, text: t.text, lower: t.text.toLowerCase(), k: words.length, cands, commaBefore,
        prevLower: prev && !commaBefore ? prev.lower : null, prev: prev && !commaBefore ? prev : null, closed, dict });
      commaBefore = false;
    } else if (t.type === 'word' && started) {
      break;
    } else if (started && t.type === 'punct') {
      if (CLAUSE_BREAK.test(t.text)) commaBefore = true;
      if (/[.!?…]/.test(t.text)) endPunct = t.text.includes('?') ? '?' : t.text.includes('!') ? '!' : '.';
    }
  }
  // P2.2（M-f）：英文段落不交給德文規則（I am totally stressed 的 am 不是 an dem）
  const german = dropEnglishSegments(words);
  german.forEach((w, k) => { w.k = k; w.prev = k > 0 && !w.commaBefore ? german[k - 1] : null; w.prevLower = w.prev ? w.prev.lower : null; w.next = german[k + 1] || null; });
  // P2.4：口語的 ich 形省略 e（ich hol …、ich komm …）：字典只列成命令式。緊鄰主詞 ich 的規則動詞命令式，補一個口語第一人稱讀法
  for (const w of german) {
    const v = w.cands.filter((c) => c.pos === 'verb');
    // 只收「只能是動詞」的字：krank 也是 kranken 的命令式，但 weil ich krank bin 的 krank 是形容詞
    if (!v.length || v.length !== w.cands.length || !v.every((c) => c.tags.includes('imperative') && c.tags.includes('singular'))) continue;
    if (![w.prev, w.next].some((p) => p && p.lower === 'ich')) continue;
    const add = v.filter((c) => c.lemma.toLowerCase().startsWith(w.lower))
      .map((c) => ({ ...c, tags: ['first-person', 'singular', 'present', 'indicative', 'colloquial'] }));
    w.cands = [...w.cands, ...add];
  }
  const S = { tokens, dict, words: german, endPunct, index: s, englishDropped: words.length - german.length };
  markLowercaseNouns(S, dict);
  S.clauses = dropLeadInterjections(splitClauses(german));
  return S;
}

// P2.3（A1）：WhatsApp 的小寫名詞（keine zeit、nen gefallen）在句型規則裡也要當名詞。
// 證據二選一：(a) 小寫名詞表有這個字、而且它沒有變位動詞讀法（zeit）；(b) 前面是限定詞（keine／nen／meine…），
// 而且這個字不能當名詞前的形容詞（變格形）。旁邊有人稱對得上的主詞代名詞時一律不算（ich frage、wir schätzen）。
function markLowercaseNouns(S, dict) {
  if (!dict.lookup) return;
  for (const w of S.words) {
    if (w.closed || w.text !== w.lower || !/^\p{Ll}/u.test(w.text) || w.cands.some((c) => c.pos === 'noun')) continue;
    const cap = w.text.charAt(0).toUpperCase() + w.text.slice(1);
    const nouns = dict.lookup(cap, { sentenceInitial: false }).candidates.filter((c) => c.pos === 'noun');
    if (!nouns.length) continue;
    const table = dict.lowercaseNouns && dict.lowercaseNouns[w.lower];
    const finiteVerb = w.cands.some((c) => c.pos === 'verb' && PERSON.some((p) => c.tags.includes(p)));
    const attributive = w.cands.some((c) => c.pos === 'adj' && c.tags.some((t) => TAG2CASE[t]));
    // P2.4：冠詞＋變格形容詞＋這個字（den ganzen tag）也算：形容詞夾在中間，der/die/das 就不可能是代名詞
    const adjBetween = !!w.prev && !!w.prev.prev && w.prev.cands.some((c) => c.pos === 'adj' && c.tags.some((t) => TAG2CASE[t]))
      && (DET_BEFORE_NOUN.test(w.prev.prev.lower) || DER_WORDS.test(w.prev.prev.lower));
    const detPrev = !!w.prev && (DET_BEFORE_NOUN.test(w.prev.lower) || adjBetween) && !attributive;
    const noLower = !w.cands.length;
    if (!(detPrev || ((table || noLower) && !finiteVerb))) continue;
    const near = [w.prev, S.words[w.k + 1]].filter(Boolean);
    if (near.some((p) => pronounAgrees(p, w))) continue;
    w.lcNoun = table && nouns.some((c) => c.lemma === table) ? table : nouns[0].lemma;
    w.cands = [...w.cands, ...nouns];
  }
}
// 主詞代名詞 p 跟 w 的某個變位動詞讀法人稱對得上
export function pronounAgrees(p, w) {
  const need = PRON_PERSON[p.text === 'Sie' ? 'Sie' : p.lower];
  if (!need || !SUBJECT_PRONOUNS.has(p.lower)) return false;
  return w.cands.some((c) => c.pos === 'verb' && !c.tags.includes('imperative') && need.every((t) => c.tags.includes(t)));
}

// P2.3（判定 2）：句首的感嘆詞（sorry、ok、lol…）不算句子的第一位：只有感嘆詞的子句（Sorry, …）拿掉，
// 子句開頭的感嘆詞（sorry war krank）不算進 body
function dropLeadInterjections(clauses) {
  while (clauses.length > 1 && clauses[0].body.every((w) => LEAD_INTERJECTIONS.has(w.lower))) clauses.shift();
  const c = clauses[0];
  if (c && !c.coord) {
    let k = 0;
    while (k < c.body.length - 1 && LEAD_INTERJECTIONS.has(c.body[k].lower)) k++;
    if (k) { c.body = c.body.slice(k); c.lead = c.body[0]; c.interjections = k; }
  }
  return clauses;
}

// P2.3（判定 1）：子句裡有沒有跟動詞 v 對得上的主詞。
// 主詞代名詞：人稱要對得上；名詞（或 das／was 這類代名詞）：v 要是第三人稱，數也要對得上，名詞要可以是主格
export const PRONOUN_SUBJECTS_3SG = new Set(['das', 'dies', 'was', 'alles', 'nichts', 'etwas', 'jemand', 'niemand', 'keiner', 'wer']);
export function hasMatchingSubject(S, clause, v) {
  // 虛擬式 I（habe = er habe）在這裡不算，否則 hab 的第三人稱讀法會把受詞名詞當成主詞
  const fin = finiteCands(v).filter((c) => !c.tags.some((t) => t.startsWith('subjunctive')));
  if (!fin.length || !clause) return false;
  const third = fin.filter((c) => c.tags.includes('third-person'));
  for (const x of clause.body) {
    if (x === v) continue;
    if (x.text === 'Sie' || isSubjectPronoun(S, x)) {
      const need = PRON_PERSON[x.text === 'Sie' ? 'Sie' : x.lower];
      if (need && fin.some((c) => need.every((t) => c.tags.includes(t)))) return true;
      continue;
    }
    if (!third.length) continue;
    if (PRONOUN_SUBJECTS_3SG.has(x.lower) && third.some((c) => c.tags.includes('singular'))) return true;
    if (isNoun(x)) {
      const nom = [...nounCombos(x)].filter((k) => k.endsWith('|nom'));
      if (nom.some((k) => k.startsWith('pl|')) && third.some((c) => c.tags.includes('plural'))) return true;
      if (nom.some((k) => !k.startsWith('pl|')) && third.some((c) => c.tags.includes('singular'))) return true;
    }
  }
  return false;
}

// 保守的英文偵測：以逗號切段，一段裡「只有英文才有的字」≥ 2 個而且佔 ≥ 40% 才算英文。
// 德英同形的字（am、was、will、so、in、man、hat、bin）不列，免得把德文句子誤判成英文。
const EN_ONLY = new Set(['the', 'is', 'are', 'you', 'your', 'my', 'this', 'that', 'with', 'have', 'has', 'were', 'been', 'would',
  "don't", "can't", "i'm", "it's", "i've", 'and', 'of', 'to', 'for', 'what', 'when', 'how', 'why', 'not', 'be', 'it', 'we', 'they',
  'he', 'she', 'totally', 'really', 'just', 'very', 'tomorrow', 'today', 'please', 'thanks', 'thank', 'yes', 'but', 'or', 'if', 'at', 'on', 'our', 'their']);
export const isEnglishWord = (w) => !!w && (EN_ONLY.has(w.lower) || w.text === 'I');
function dropEnglishSegments(words) {
  const segs = [];
  for (const w of words) { if (w.commaBefore || !segs.length) segs.push([]); segs[segs.length - 1].push(w); }
  const drop = new Set();
  for (const seg of segs) {
    const en = seg.filter((w) => EN_ONLY.has(w.lower) || w.text === 'I').length;
    if (en >= 2 && en / seg.length >= 0.4) for (const w of seg) drop.add(w);
  }
  if (drop.size) {
    // 英文段後面的德文段，第一個字前面本來就有逗號，子句切分不受影響
    return words.filter((w) => !drop.has(w));
  }
  return words;
}

// 子句：逗號切開；對等連接詞兩邊都有變位動詞時再切一次
function splitClauses(words) {
  const segs = [];
  let cur = [];
  for (const w of words) {
    if (w.commaBefore && cur.length) { segs.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) segs.push(cur);

  const clauses = [];
  for (const seg of segs) {
    let start = 0;
    for (let j = 1; j < seg.length; j++) {
      if (!COORDINATORS.has(seg[j].lower)) continue;
      const before = seg.slice(start, j), after = seg.slice(j + 1);
      if (before.some((w) => isFinite(w, { imperative: true })) && after.some((w) => isFinite(w, { imperative: true }))) {
        clauses.push(before);
        start = j;
      }
    }
    clauses.push(seg.slice(start));
  }
  return clauses.map((ws) => {
    const coord = COORDINATORS.has(ws[0].lower) && ws.length > 1 ? ws[0] : null;
    const body = coord ? ws.slice(1) : ws;
    const lead = body[0];
    // P2.1（B3 根因）：只看第一個字是不是 weil/dass/damit/als… 就判定從句，但 damit、als 也是副詞／介系詞。
    // 從句的變位動詞一定在句尾：句尾以前出現「確定是變位動詞」的字（Damit kann…、Als Kind wollte…）就是主句
    const verbFinal = body.slice(0, -1).every((w) => !clearlyFinite(w));
    const type = lead && SUBORDINATORS.has(lead.lower) && body.length > 1 && verbFinal ? 'sub' : 'main';
    return { words: ws, body, coord, lead, type };
  });
}

// 名詞這個形可能的（性別或 pl, 格）組合，來自字典的性別與變化表 tag
const CASES = ['nom', 'acc', 'dat', 'gen'];
const RARE = new Set(['rare', 'poetic', 'archaic', 'obsolete', 'dated']);
const TAG2CASE = { nominative: 'nom', accusative: 'acc', dative: 'dat', genitive: 'gen' };
// P2.2（M-c）：名詞化形容詞。冠詞後面的大寫字，小寫形是形容詞的變化形（die Kleine、der Deutsche、das Gute）→
// 依冠詞決定變化類型（der-類 → 弱、ein-類 → 混合），形容詞詞尾 ∩ 冠詞 → 性別、格、數。字典裡的 der Kleiner（複數 Kleine）不算。
const TAG2CASE_N = { nominative: 'nom', accusative: 'acc', dative: 'dat', genitive: 'gen' };
export function nominalizedAdj(w) {
  if (w.tok.sentenceInitial || !w.prev || !w.dict || !w.dict.lookup) return null;
  // P2.3（M-3）：WhatsApp 常寫小寫（die kleinen schlafen）。小寫時要求名詞片語到這裡結束：
  // 後面沒有字、隔了逗號，或下一個字不是名詞也不是形容詞（die kleinen Kinder 的 kleinen 是普通形容詞）
  if (!/^\p{Lu}/u.test(w.text)) {
    if (w.lcNoun || w.cands.some((c) => c.pos === 'noun')) return null;
    const nx = w.next;
    if (nx && !nx.commaBefore && (isNoun(nx) || hasPos(nx, 'adj'))) return null;
    // P2.4：後面是小寫名詞表裡的字（den ganzen tag）→ 普通形容詞，不是名詞化
    if (nx && !nx.commaBefore && w.dict.lowercaseNouns && w.dict.lowercaseNouns[nx.lower]) return null;
  }
  const decl = DER_WORDS.test(w.prev.lower) ? 'weak' : EIN_WORDS.test(w.prev.text) ? 'mixed' : null;
  if (!decl) return null;
  // 真的名詞不算：字典裡有「這個字本身就是原形」的名詞（die Matte ≠ 形容詞 matt 名詞化）；
  // 只有字典的名詞本身也是名詞化形容詞（Kleiner、Deutscher）或根本沒有名詞時，才用形容詞分析
  const nouns = w.cands.filter((c) => c.pos === 'noun');
  if (nouns.some((c) => c.lemma === w.text)) return null;
  const adj = w.dict.lookup(w.lower, { sentenceInitial: false }).candidates
    .filter((c) => c.pos === 'adj' && c.tags.includes(decl) && !c.tags.includes('comparative') && !c.tags.includes('superlative'));
  if (!adj.length) return null;
  // 字典的名詞原形以形容詞原形開頭（Kleiner ← klein）＝本身就是名詞化形容詞；否則是別的名詞，不套
  const adjLemma = adj[0].lemma.toLowerCase();
  if (nouns.length && !nouns.every((c) => c.lemma.toLowerCase().startsWith(adjLemma))) return null;
  let combos = new Set();
  for (const c of adj) {
    const cs = c.tags.map((t) => TAG2CASE_N[t]).filter(Boolean);
    const gs = c.tags.includes('plural') ? ['pl'] : ['masculine', 'feminine', 'neuter'].filter((x) => c.tags.includes(x)).map((x) => x[0]);
    for (const g of gs) for (const k of cs) combos.add(`${g}|${k}`);
  }
  const af = articleForms(w.prev.lower);
  if (af) combos = new Set([...combos].filter((x) => af.rows.some(([g, k]) => `${g}|${k}` === x)));
  return combos.size ? { lemma: adj[0].lemma, combos, decl, article: w.prev } : null;
}

export function nounCombos(w) {
  const nom = nominalizedAdj(w);
  if (nom) return nom.combos;
  const out = new Set();
  // 原形本身那筆（tags 空）不帶格；同一原形有變化表的 tag 時就不用它，免得「什麼格都可以」
  const tagged = new Set(w.cands.filter((c) => c.pos === 'noun' && c.tags.length).map((c) => `${c.lemma}\t${c.i}`));
  for (const c of w.cands) {
    if (c.pos !== 'noun' || !c.entry || !c.entry.gender) continue;
    if (!c.tags.length && tagged.has(`${c.lemma}\t${c.i}`)) continue;
    if (c.tags.some((t) => RARE.has(t))) continue; // P2.1（M2）：罕用讀法（Mannen）不列進可能性
    const cases = c.tags.map((t) => TAG2CASE[t]).filter(Boolean);
    const cs = cases.length ? cases : CASES;
    const pl = c.tags.includes('plural') || c.entry.gender.includes('pl');
    const sg = c.tags.includes('singular') || (!c.tags.includes('plural') && !c.entry.gender.includes('pl'));
    for (const cs1 of cs) {
      if (pl) out.add(`pl|${cs1}`);
      if (sg) for (const g of c.entry.gender) if (g !== 'pl') out.add(`${g}|${cs1}`);
    }
  }
  return out;
}

// 下一個名詞（中間可以跳過最多 3 個小寫形容詞）；找不到就 null
export function nounAfter(S, w, maxAdj = 3) {
  let k = w.k + 1, skipped = 0;
  while (k < S.words.length) {
    const x = S.words[k];
    if (x.commaBefore) return null;
    if (isNoun(x) && (/^\p{Lu}/u.test(x.text) || x.lcNoun)) return x; // P2.3：WhatsApp 小寫名詞（keine zeit）也算
    if (hasPos(x, 'adj') && /^\p{Ll}/u.test(x.text) && skipped < maxAdj) { skipped++; k++; continue; }
    return null;
  }
  return null;
}

// 子句的主要動詞（給「格是誰決定的」用）：助動詞／情態動詞＋句尾分詞或原形時，取句尾那個
export function mainVerbOf(S, w) {
  const clause = clauseOf(S, w);
  if (!clause) return null;
  const fin = firstFinite(clause, { imperative: true });
  if (!fin) return null;
  const last = lastWord(clause);
  const finLemmas = lemmasOf(fin, 'verb');
  const auxLike = finLemmas.some((l) => ['haben', 'sein', 'werden', 'können', 'müssen', 'dürfen', 'sollen', 'wollen', 'mögen'].includes(l));
  if (auxLike && last !== fin && (participleCands(last).length || isInfinitive(last))) return last;
  return fin;
}

// 名詞類字形規則用：句首大寫的字如果也有非名詞讀法（Wegen = wegen／Wege），分不出來就不當名詞講
export const nounIsClear = (w) => !(w.tok.sentenceInitial && w.cands.some((c) => c.pos !== 'noun'));

// P2.1（B5 根因）：ihr／Ihr 後面接名詞（或形容詞＋名詞）就是所有格（Ihr Kind = her/your child），不是主詞 ihr
export function isSubjectPronoun(S, w) {
  if (!SUBJECT_PRONOUNS.has(w.lower)) return false;
  if (w.lower !== 'ihr') return true;
  if (/^I/.test(w.text) && !w.tok.sentenceInitial) return false; // 句中大寫 Ihr＝您的
  return !nounAfter(S, w, 2) || nounAfter(S, w, 2).commaBefore;
}

// P2.1（M2 根因）：逗號後、指回前一個名詞、性別對得上的 der/die/das… 是關係代名詞，不是冠詞（G03、G15 共用）
const REL_COMPAT = { der: ['m', 'f'], die: ['f', 'pl'], das: ['n'], den: ['m'], dem: ['m', 'n'], denen: ['pl'], dessen: ['m', 'n'], deren: ['f', 'pl'] };
export function relativeAntecedent(S, w) {
  if (!w.commaBefore || !REL_COMPAT[w.lower]) return null;
  // 名詞和逗號之間可以隔一個句尾的可分離前綴或分詞（Ich rufe den Mann an, der …／Ich habe das Buch gelesen, das …）
  let noun = S.words[w.k - 1];
  if (noun && !isNoun(noun) && (SEPARABLE_PARTICLES.has(noun.text) || participleCands(noun).length)) noun = S.words[w.k - 2];
  if (!noun || !isNoun(noun) || !/^\p{Lu}/u.test(noun.text)) return null;
  const genders = new Set([...nounCombos(noun)].map((x) => x.split('|')[0]));
  return REL_COMPAT[w.lower].some((g) => genders.has(g)) ? noun : null;
}

export const clauseOf = (S, w) => S.clauses.find((c) => c.words.includes(w));
export const lastWord = (clause) => clause.body[clause.body.length - 1];
export const firstFinite = (clause, opts) => clause.body.find((w) => isFinite(w, opts));
