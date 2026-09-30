// P2.6（SPEC §4.5）：字卡只講「這句裡」。
// A. 這句裡的形：用句子裡已經偵測到的證據（主詞人稱、G04/G05/G10/G14 指到的字、G15/G16/G19/G20 的結果）
//    從字典列出的所有可能形裡挑出對得上的；證據不夠就不挑（§4.4：不拿詞頻或慣例當答案）。
// B. 用法：Wiktionary 的 reflexive／+obj 句型（data/usage.json），對得上這句的那條排第一並標記。
import { PRON_PERSON } from './grammar/german.js';
import {
  clauseOf, firstFinite, lastWord, finiteCands, isSubjectPronoun, PRONOUN_SUBJECTS_3SG, nounAfter, hasPos,
} from './grammar/sentence.js';

const PERSONS = ['first-person', 'second-person', 'third-person'];
const WHO = {
  'first-person|singular': 'ich', 'second-person|singular': 'du', 'third-person|singular': 'er/sie/es',
  'first-person|plural': 'wir', 'second-person|plural': 'ihr', 'third-person|plural': 'sie/Sie',
};
const CASE_TAG = { nom: 'nominative', acc: 'accusative', dat: 'dative', gen: 'genitive' };
const GENDER_TAG = { m: 'masculine', f: 'feminine', n: 'neuter' };
const REFLEXIVE = new Set(['mich', 'dich', 'sich', 'uns', 'euch']);

const has = (t, ...xs) => xs.every((x) => t.includes(x));
const nonFinite = (t) => t.includes('participle') || t.includes('infinitive') || t.includes('infinitive-zu') || t.includes('imperative');

// 子句裡看得到的主詞 → 動詞需要的人稱 tag；看不出來回傳 null
function subjectNeed(S, clause, w) {
  const needs = [];
  for (const x of clause.body) {
    if (x === w) continue;
    if (x.text === 'Sie' || isSubjectPronoun(S, x)) {
      // 句首的 Sie 可能是 she／they／您，只要求第三人稱
      const key = x.text === 'Sie' && !x.tok.sentenceInitial ? 'Sie' : x.lower;
      if (PRON_PERSON[key]) needs.push(PRON_PERSON[key]);
    } else if (PRONOUN_SUBJECTS_3SG.has(x.lower) && !nounAfter(S, x) && !(x.prev && hasPos(x.prev, 'prep'))) {
      // das Wochenende 的 das 是冠詞、auf das 的 das 是介系詞受詞，都不是主詞
      needs.push(['third-person', 'singular']);
    }
  }
  const uniq = [...new Map(needs.map((n) => [n.join(','), n])).values()];
  return uniq.length === 1 ? uniq[0] : null; // 兩個以上可能的主詞（das freut mich, …）就不猜
}

function verbForms(S, w, tagsets, sentenceRules) {
  const at = (id, key) => sentenceRules.some((m) => m.id === id && m.data && m.data[key] === w.index);
  if (at('G04', 'infinitive') || at('G14', 'infinitive')) {
    const inf = tagsets.filter((t) => t.includes('infinitive') || t.includes('infinitive-zu'));
    if (inf.length) return { sets: inf };
  }
  if (at('G05', 'participleIndex')) {
    const part = tagsets.filter((t) => has(t, 'participle', 'past'));
    if (part.length) return { sets: part };
  }
  if (at('G10', 'verbIndex')) {
    const imp = tagsets.filter((t) => t.includes('imperative'));
    if (imp.length) return { sets: imp };
  }
  const clause = clauseOf(S, w);
  if (!clause || !finiteCands(w).length) return null;
  const theVerb = clause.type === 'sub' ? lastWord(clause) === w : firstFinite(clause) === w;
  if (!theVerb) return null;
  const need = subjectNeed(S, clause, w);
  if (!need) return null;
  const fin = tagsets.filter((t) => !nonFinite(t) && has(t, ...need));
  const indicative = fin.filter((t) => !t.some((x) => x.startsWith('subjunctive')));
  const sets = indicative.length ? indicative : fin;
  return sets.length ? { sets, who: true } : null;
}

function adjForms(tagsets, wordRules) {
  const m = wordRules.find((r) => r.id === 'G16');
  if (!m) return null;
  const d = m.data;
  const want = [d.declension, CASE_TAG[d.case], d.number === 'pl' ? 'plural' : GENDER_TAG[d.gender]];
  const sets = tagsets.filter((t) => has(t, ...want) && !t.includes('comparative') && !t.includes('superlative'));
  return sets.length ? { sets } : null;
}

function nounForms(S, w, tagsets, wordRules, articleRules) {
  let want = null;
  if (wordRules.some((r) => r.id === 'G19')) want = ['dative', 'plural'];
  else if (wordRules.some((r) => r.id === 'G20')) want = ['genitive', 'singular'];
  else {
    const m = articleRules.find((r) => r.id === 'G15' && r.data && r.data.certain && r.data.noun === w.index);
    if (m) {
      const o = m.data.options[0];
      want = [CASE_TAG[o.case], o.number === 'pl' ? 'plural' : 'singular'];
    }
  }
  if (!want) return null;
  const sets = tagsets.filter((t) => has(t, ...want));
  return sets.length ? { sets } : null;
}

function whoOf(t) {
  const p = PERSONS.find((x) => t.includes(x));
  const n = t.includes('plural') ? 'plural' : t.includes('singular') ? 'singular' : null;
  return p && n ? WHO[`${p}|${n}`] : null;
}

/**
 * 算出一個讀法在這句裡的形。
 * @returns {{contextForm: string[], otherForms: string[]} | null}
 */
export function contextForm({ S, w, reading, tagsets, describe, wordRules, sentenceRules, articleRules }) {
  if (!S || !w || !tagsets.length) return null;
  let pick = null;
  if (reading.pos === 'verb') pick = verbForms(S, w, tagsets, sentenceRules);
  else if (reading.pos === 'adj') pick = adjForms(tagsets, wordRules);
  else if (reading.pos === 'noun') pick = nounForms(S, w, tagsets, wordRules, articleRules);
  if (!pick) return null;
  const label = (t) => {
    const d = describe(t);
    const who = pick.who && whoOf(t);
    return who ? `${d} (${who})` : d;
  };
  const contextForms = [...new Set(pick.sets.map(label))];
  const chosen = new Set(pick.sets.map(describe));
  const all = [...new Set(tagsets.map(describe))];
  return { contextForm: contextForms, otherForms: all.filter((d) => !chosen.has(d) && d !== 'dictionary form') };
}

// ---------- B. 用法 ----------
// 介系詞＋冠詞的縮寫（vom Wetter = von dem Wetter）也算那個介系詞
const CONTRACTED = {
  vom: 'von', zum: 'zu', zur: 'zu', beim: 'bei', am: 'an', ans: 'an', im: 'in', ins: 'in',
  aufs: 'auf', übers: 'über', ums: 'um', fürs: 'für', unterm: 'unter', vors: 'vor', vorm: 'vor',
};
function prepInClause(words, prep) {
  const re = new RegExp(`^(da|wo)r?${prep}$`);
  return words.some((x) => x.lower === prep || CONTRACTED[x.lower] === prep || re.test(x.lower));
}

// lemma：可分離動詞在句中重組時傳重組後的原形（Das hängt vom Wetter ab → abhängen）
export function usageFor(dict, S, w, reading, lemma = reading.lemma) {
  const list = dict.usage && dict.usage[`${lemma}|${reading.pos}`];
  if (!Array.isArray(list) || !list.length) return null;
  const clause = S && w ? clauseOf(S, w) : null;
  const words = clause ? clause.body.filter((x) => x !== w) : [];
  const refl = words.some((x) => REFLEXIVE.has(x.lower));
  const out = list.map((u, k) => {
    const needs = !!u.refl || !!(u.preps && u.preps.length) || !!(u.with && u.with.length); // with：慣用語（kein Ding、alles klar）
    const match = !!clause && needs && (!u.refl || refl) && (!u.preps || u.preps.some((p) => prepInClause(words, p)))
      && (!u.with || u.with.every((x) => words.some((y) => y.lower === x))); // es geht um：沒有 es 的 ich gehe um 8 不算
    const lead = /^(dative|accusative|genitive|infinitive|zu)\b/.test(u.obj || '') ? ' + ' : ' ';
    const pattern = u.pattern || `${u.refl ? 'sich ' : ''}${lemma}${u.obj ? lead + u.obj : ''}`;
    return { pattern, gloss: u.gloss, example: u.ex || null, match, k };
  });
  // 對得上這句的排第一；只標一條（兩條都對得上時照 Wiktionary 順序取第一條）
  const first = out.find((u) => u.match);
  for (const u of out) if (u !== first) u.match = false;
  return out.sort((a, b) => (b.match - a.match) || (a.k - b.k)).map(({ k, ...u }) => u);
}
