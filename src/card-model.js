// 字卡模型：把「點到的字」變成字卡要顯示的資料（純函式，不碰 DOM，單元測試直接驗）。
import {
  buildSentence, nounAfter, finiteCands, isFinite, isInfinitive, isNoun, hasPos, clauseOf,
  isSubjectPronoun, relativeAntecedent, nominalizedAdj,
} from './grammar/sentence.js';
import { findSeparable } from './rules/g06-separable.js';
import { analyzeWord, analyzeSentence } from './grammar/engine.js';
import { contextForm, usageFor } from './context-form.js';
import { CONTRACTIONS, SUBJECT_PRONOUNS } from './grammar/german.js';
import { closedList } from './grammar/closed.js';
// 欄位只來自字典與手寫表（colloquial / prepositions / gloss-overrides），沒有就不給（SPEC §4.4 零編造）。

const POS_LABEL = {
  noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', conj: 'conjunction',
  pron: 'pronoun', det: 'determiner', article: 'article', particle: 'particle', num: 'numeral',
  intj: 'interjection', contraction: 'contraction', postp: 'postposition',
};
const ARTICLE = { m: 'der', f: 'die', n: 'das', pl: 'die' };
const FUNCTION_POS = new Set(['pron', 'det', 'article', 'prep', 'conj', 'particle', 'contraction', 'postp']);
const PREP_CASE_LABEL = {
  Dat: 'takes the dative (Dativ)',
  Akk: 'takes the accusative (Akkusativ)',
  Gen: 'takes the genitive (Genitiv)',
  Wechsel: 'two-way: dative for location (wo?), accusative for direction (wohin?)',
};
export { PREP_CASE_LABEL };

// 標註翻成英文；順序：級 → 時態／語氣 → 人稱 → 性 → 格 → 數 → 變化類型
const TAG_ORDER = [
  ['comparative', 'comparative'], ['superlative', 'superlative'],
  ['infinitive-zu', 'zu-infinitive'], ['infinitive', 'infinitive'], ['imperative', 'imperative'],
  ['preterite', 'past tense'], ['present', 'present tense'], ['subjunctive-i', 'subjunctive I'], ['subjunctive-ii', 'subjunctive II'],
  ['subjunctive', 'subjunctive'],
  ['first-person', '1st person'], ['second-person', '2nd person'], ['third-person', '3rd person'],
  ['masculine', 'masculine'], ['feminine', 'feminine'], ['neuter', 'neuter'],
  ['nominative', 'nominative'], ['genitive', 'genitive'], ['dative', 'dative'], ['accusative', 'accusative'],
  ['singular', 'singular'], ['plural', 'plural'],
  ['strong', 'strong declension'], ['weak', 'weak declension'], ['mixed', 'mixed declension'],
  ['predicative', 'predicative'], ['subordinate-clause', 'joined form (subordinate clause)'],
];
// 只是變化表的欄位名稱，對學習者沒有資訊量
const SILENT_TAGS = new Set(['definite', 'indefinite', 'indicative', 'without-article', 'includes-article', 'formal', 'table-tags', 'prepositional', 'personal', 'pronoun']);
const RARE_TAGS = new Set(['rare', 'archaic', 'obsolete']);

export function describeTags(tags) {
  const t = new Set(tags);
  if (t.has('participle')) {
    const kind = t.has('past') ? 'past participle' : t.has('present') ? 'present participle' : 'participle';
    t.delete('participle'); t.delete('past'); t.delete('present');
    const rest = describeTags([...t]);
    return rest === 'dictionary form' ? kind : `${kind} · ${rest}`;
  }
  const parts = [];
  for (const [tag, label] of TAG_ORDER) {
    if (tag === 'subjunctive' && (t.has('subjunctive-i') || t.has('subjunctive-ii'))) continue;
    if (t.has(tag)) parts.push(label);
  }
  const known = new Set(TAG_ORDER.map(([x]) => x));
  for (const x of tags) if (!known.has(x) && !SILENT_TAGS.has(x) && !RARE_TAGS.has(x) && x !== 'participle') parts.push(x.replace(/-/g, ' '));
  return parts.length ? parts.join(' · ') : 'dictionary form';
}

function capitalizeLike(model, s) {
  return /^\p{Lu}/u.test(model) ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function glossesFor(dict, lemma, i, entry) {
  const o = dict.glossOverrides && dict.glossOverrides[lemma];
  if (o && o.pos === entry.pos && Array.isArray(o.glosses)) {
    // 只覆寫這個原形「第一個」同詞性條目（同形異義的其他條目保持原樣）
    const first = dict.lexicon[lemma].findIndex((e) => e.pos === entry.pos);
    if (first === i) {
      // P2.2 加修：keep＝手寫的日常義項排前面，字典原本的義項接在後面（去重後最多三個）
      if (o.keep) {
        const seen = new Set();
        return [...o.glosses, ...(entry.glosses || [])].filter((g) => !seen.has(g) && seen.add(g)).slice(0, 3);
      }
      return o.glosses.slice(0, 3);
    }
  }
  return (entry.glosses || []).slice(0, 3);
}

function makeReading(dict, lemma, i, entry, tagsets) {
  const nonRare = tagsets.filter((t) => !t.some((x) => RARE_TAGS.has(x)));
  const shown = nonRare.length ? nonRare : tagsets;
  const formDescriptions = [...new Set(shown.map(describeTags))];
  const r = {
    lemma, i, pos: entry.pos, posLabel: POS_LABEL[entry.pos] || entry.pos,
    header: lemma, formDescriptions, glosses: glossesFor(dict, lemma, i, entry),
    rank: entry.rank || Infinity,
    other: !!entry.rare || nonRare.length === 0,
  };
  if (entry.pos === 'noun' && entry.gender) {
    r.gender = entry.gender;
    r.header = `${[...new Set(entry.gender.map((g) => ARTICLE[g]))].join('/')} ${lemma}`;
    if (entry.gender.length === 1 && entry.gender[0] === 'pl') r.pluralOnly = true;
    if (entry.plural) r.plural = entry.plural;
    if (entry.noPlural) r.noPlural = true;
  }
  if (entry.verb) r.verb = entry.verb;
  if (entry.adj) r.adj = entry.adj;
  if (entry.pos === 'prep') {
    const c = (dict.prepositions && dict.prepositions[lemma]) || (entry.prep && entry.prep.case);
    if (c) r.prepCase = c;
  }
  return r;
}

function readingsFor(dict, word, sentenceInitial) {
  const res = dict.lookup(word, { sentenceInitial });
  const groups = new Map();
  for (const c of res.candidates) {
    const k = `${c.lemma}\t${c.i}`;
    if (!groups.has(k)) groups.set(k, { lemma: c.lemma, i: c.i, entry: c.entry, tagsets: [], order: groups.size });
    groups.get(k).tagsets.push(c.tags);
  }
  return [...groups.values()].map((g) => ({ ...makeReading(dict, g.lemma, g.i, g.entry, g.tagsets), order: g.order }));
}

// ---------- P2.2 封閉詞類 ----------
function closedToReading(dict, r, k) {
  const out = {
    lemma: r.lemma, i: 900 + k, pos: r.pos, posLabel: POS_LABEL[r.pos] || r.pos, header: r.lemma,
    formDescriptions: [r.form], glosses: [r.gloss], other: false, closed: true,
  };
  if (r.pos === 'prep') {
    const c = dict.prepositions && dict.prepositions[r.lemma];
    if (c) out.prepCase = c;
  }
  return out;
}

const PRON_PERSON = {
  ich: ['first-person', 'singular'], du: ['second-person', 'singular'], er: ['third-person', 'singular'], es: ['third-person', 'singular'],
  man: ['third-person', 'singular'], wir: ['first-person', 'plural'], ihr: ['second-person', 'plural'], Sie: ['third-person', 'plural'],
  sie: ['third-person'],
};
// 語境規則：符合的讀法排到最前面（表上順序＝預設順序）
function contextChecks(S, w) {
  const nx = w && S.words[w.k + 1] && !S.words[w.k + 1].commaBefore ? S.words[w.k + 1] : null;
  const pv = w && w.prev;
  const nounNext = !!(w && nounAfter(S, w, 2));
  const fin = nx ? finiteCands(nx) : [];
  const sg3 = fin.some((c) => c.tags.includes('third-person') && c.tags.includes('singular'));
  const pl = fin.some((c) => c.tags.includes('plural'));
  const clause = w && clauseOf(S, w);
  // 當動詞用：旁邊有主詞代名詞，而且人稱對得上（ich meine ✓、Was meinen Sie ✓；du bitte ✗：bitte 是第一人稱）
  const agrees = (p) => {
    const need = PRON_PERSON[p.text === 'Sie' ? 'Sie' : p.lower];
    if (!need) return false;
    // 旁邊的主詞代名詞本身就是上下文證據，不再過「當動詞合不合理」的詞頻門檻（meinen 的限定詞 mein 比動詞常用）
    return w.cands.some((c) => c.pos === 'verb' && !c.tags.includes('imperative') && need.every((t) => c.tags.includes(t)));
  };
  return {
    noun: nounNext,
    notNoun: !!nx && !nounNext,
    verbUse: !nounNext && ((pv && isSubjectPronoun(S, pv) && agrees(pv)) || (!!nx && (SUBJECT_PRONOUNS.has(nx.lower) || nx.text === 'Sie') && agrees(nx))),
    verb: !!nx && isFinite(nx),
    subj3sg: sg3 && !pl,
    subjPl: pl && !sg3,
    otherSubject: !!clause && clause.body.some((x) => x !== w && isSubjectPronoun(S, x)),
    rel: !!(w && relativeAntecedent(S, w)),
    // P2.4：das 後面沒有名詞＝指示代名詞。需要「後面還有字」或「後面緊接句尾標點」當證據（中性位置 und das 不判斷）
    // 逗號後指回名詞的 das 是關係代名詞，除非後面緊接變位動詞（…, das kriegen wir hin：關係子句的動詞在句尾）
    demonstrative: !!w && !nounNext && (!!nx || endsSentence(S, w)) && (!relativeAntecedent(S, w) || (!!nx && isFinite(nx))),
    afterComma: !!(w && w.commaBefore),
    adjNext: !!nx && !isNoun(nx) && !isFinite(nx) && (hasPos(nx, 'adj') || hasPos(nx, 'adv')),
    infNext: !!nx && /^\p{Ll}/u.test(nx.text) && isInfinitive(nx) && !nounAfter(S, nx),
  };
}

function endsSentence(S, w) {
  let j = w.index + 1;
  while (S.tokens[j] && S.tokens[j].type === 'space') j++;
  return !!S.tokens[j] && S.tokens[j].type === 'punct' && /[.!?…]/.test(S.tokens[j].text);
}

function closedReadings(dict, tokens, tok, list) {
  const S = buildSentence(tokens, tok.sentence, dict);
  const w = S.words.find((x) => x.index === tok.index);
  const ctx = contextChecks(S, w);
  const ordered = [...list.filter((r) => r.ctx && ctx[r.ctx]), ...list.filter((r) => !(r.ctx && ctx[r.ctx]))];
  const dictReadings = readingsFor(dict, tok.text, tok.sentenceInitial);
  const out = [];
  ordered.forEach((r, k) => {
    if (r.useDict) {
      const d = dictReadings.find((x) => x.lemma === r.lemma && x.pos === r.pos);
      if (d) out.push({ ...d, other: false });
      return;
    }
    out.push(closedToReading(dict, r, k));
  });
  // 句首大寫時，字典裡的名詞讀法（das Ich、der Morgen、die Bitte）放到「其他讀法」
  if (tok.sentenceInitial && /^\p{Lu}/u.test(tok.text)) {
    for (const d of dictReadings) if (d.pos === 'noun') out.push({ ...d, other: true });
  }
  return out;
}

// ---------- P2.2 名詞化形容詞（die Kleine）----------
const GN = { m: 'masculine', f: 'feminine', n: 'neuter' };
const CN = { nom: 'nominative', acc: 'accusative', dat: 'dative', gen: 'genitive' };
function nominalizedReading(dict, tokens, tok) {
  if (/^\p{Lu}/u.test(tok.text) && tok.sentenceInitial) return null;
  const S = buildSentence(tokens, tok.sentence, dict);
  const w = S.words.find((x) => x.index === tok.index);
  const nom = w && nominalizedAdj(w);
  if (!nom) return null;
  // 性別＋數相同的格合併：feminine · nominative/accusative · singular
  const groups = new Map();
  for (const x of nom.combos) {
    const [g, c] = x.split('|');
    const key = g === 'pl' ? 'plural' : `${GN[g]}|singular`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(CN[c]);
  }
  const formDescriptions = [...groups].map(([k, cs]) => (k === 'plural' ? `plural · ${cs.join('/')}` : `${k.split('|')[0]} · ${cs.join('/')} · singular`));
  const entry = (dict.lexicon[nom.lemma] || []).find((e) => e.pos === 'adj');
  return {
    lemma: nom.lemma, i: 950, pos: 'adj', posLabel: `adjective used as a noun (after “${nom.article.text}”)`,
    header: nom.lemma, formDescriptions, glosses: entry ? (entry.glosses || []).slice(0, 3) : [], other: false,
  };
}

// ---------- P2.2 加修：小寫名詞（WhatsApp：hab keine zeit、schönen tag noch）----------
// 哪些小寫字該先當名詞，由 build/make-lowercase-nouns.mjs 用詞頻比例算好放在 data/lowercase-nouns.json（門檻理由見該檔）。
// 小寫字完全查不到小寫讀法時，直接退回首字大寫的名詞。
function lowercaseNoun(dict, tokens, tok, readings) {
  const lower = tok.text;
  if (lower !== lower.toLowerCase() || !/^\p{Ll}/u.test(lower)) return null;
  // P2.3（M-3）：句子模型的語境證據也算——前面是限定詞（nen gefallen、keine lust）的小寫字＝名詞
  const S0 = buildSentence(tokens, tok.sentence, dict);
  const w0 = S0.words.find((x) => x.index === tok.index);
  const want = (dict.lowercaseNouns && dict.lowercaseNouns[lower]) || (w0 && w0.lcNoun);
  if (!want && readings.length) return null;
  const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
  const nouns = readingsFor(dict, cap, false).filter((r) => r.pos === 'noun');
  if (!nouns.length) return null;
  const lemma = want && nouns.some((r) => r.lemma === want) ? want : nouns[0].lemma;
  // 語境否決：旁邊有人稱對得上的主詞代名詞（ich fürchte、wir schätzen）→ 這裡是動詞，詞頻不管用
  if (readings.length && w0 && contextChecks(S0, w0).verbUse) return null;
  const note = `written in lowercase; probably the noun ${lemma}`;
  const mark = (r) => ({ ...r, other: false, lowercaseNote: note });
  return { lemma, note, first: nouns.filter((r) => r.lemma === lemma).map(mark), rest: nouns.filter((r) => r.lemma !== lemma) };
}

// ---------- P2.4：ne 口語的「不」（nee）----------
// 單獨一個 ne、句首或 ja 後面而且接著逗號／句尾（ja ne, …）、或句尾的附加問句（…, ne? = right?）→ nein 先。
// 後面接名詞等其他情況照原本的排序（ne Frage = eine Frage）
function neFirst(tokens, tok, readings) {
  const words = tokens.filter((t) => t.type === 'word' && t.sentence === tok.sentence);
  const k = words.indexOf(tok);
  const skip = (j, d) => { while (tokens[j] && tokens[j].type === 'space' && !tokens[j].text.includes('\n')) j += d; return tokens[j]; };
  const nx = skip(tok.index + 1, 1), pv = skip(tok.index - 1, -1);
  const breakAfter = !nx || nx.type === 'emoji' || nx.type === 'space' || (nx.type === 'punct' && /^[,.!?…;:]/.test(nx.text));
  const alone = words.length === 1;
  const lead = (k === 0 || (k === 1 && words[0].text.toLowerCase() === 'ja')) && breakAfter;
  const tag = k === words.length - 1 && !!pv && pv.text === ',' && !!nx && nx.text.includes('?');
  if (!alone && !lead && !tag) return readings;
  const i = readings.findIndex((r) => r.lemma === 'nein');
  if (i < 0) return readings;
  let r = { ...readings[i], other: false };
  if (tag) r = { ...r, glosses: ['right? (tag question: …, ne? = …, isn’t it?)', ...r.glosses].slice(0, 3) };
  return [r, ...readings.filter((_, j) => j !== i)];
}

// ---------- P2.3（M-3）：口語的 ich 形省略 e（ich komm、ich mach）----------
// 字典把 komm 只列成命令式；子句裡有主詞 ich 時，它其實是 komme 的口語寫法。規則動詞才適用（komm ← kommen；gib 不是）
function chatFirstPerson(dict, tokens, tok, readings) {
  const S = buildSentence(tokens, tok.sentence, dict);
  const w = S.words.find((x) => x.index === tok.index);
  const clause = w && clauseOf(S, w);
  if (!clause || !clause.body.some((x) => x !== w && x.lower === 'ich' && isSubjectPronoun(S, x))) return readings;
  return readings.map((r) => {
    if (r.pos !== 'verb' || !r.formDescriptions.length || !r.formDescriptions.every((d) => d.startsWith('imperative'))) return r;
    if (!r.lemma.toLowerCase().startsWith(w.lower)) return r;
    return { ...r, formDescriptions: [`present tense · 1st person · singular (chat spelling of ${w.lower}e)`, ...r.formDescriptions] };
  });
}

// ---------- P2.2 加修：過去分詞 vs 變位動詞（gehört＝hören 的過去分詞，也是 gehören 的現在式）----------
// 子句裡有變位的 haben／sein／werden（Ich habe das gehört）→ 過去分詞讀法先；沒有（Das gehört mir）→ 變位讀法先。
const AUX = new Set(['haben', 'sein', 'werden']);
const PERSONS = ['first-person', 'second-person', 'third-person'];
function participleOrder(dict, tokens, tok, readings) {
  const S = buildSentence(tokens, tok.sentence, dict);
  const w = S.words.find((x) => x.index === tok.index);
  if (!w) return readings;
  const vc = w.cands.filter((c) => c.pos === 'verb');
  const part = new Set(vc.filter((c) => c.tags.includes('participle')).map((c) => c.lemma));
  if (!part.size) return readings;
  const clause = clauseOf(S, w);
  const aux = !!clause && clause.body.some((x) => x !== w && finiteCands(x).some((c) => AUX.has(c.lemma)));
  // 有助動詞時，「這個形是什麼」也先講過去分詞（Ich habe … verloren 不是 wir verloren 的過去式）
  if (aux) {
    readings = readings.map((r) => (r.pos === 'verb' && part.has(r.lemma)
      ? { ...r, formDescriptions: [...r.formDescriptions.filter((d) => d.startsWith('past participle')), ...r.formDescriptions.filter((d) => !d.startsWith('past participle'))] }
      : r));
  }
  const fin = new Set(vc.filter((c) => !c.tags.includes('participle') && !c.tags.includes('imperative')
    && PERSONS.some((p) => c.tags.includes(p))).map((c) => c.lemma));
  if (![...part].some((l) => !fin.has(l)) || !fin.size) return readings;
  const prefer = aux ? part : fin;
  const first = readings.filter((r) => !r.other && r.pos === 'verb' && prefer.has(r.lemma));
  return [...first, ...readings.filter((r) => !first.includes(r))];
}

// 可分離動詞提示（P2 起與 G06／T4 共用同一個偵測）：點到的是重組動詞本身或它跑到句尾的前綴才提示
function separableHint(dict, tokens, tok) {
  const S = buildSentence(tokens, tok.sentence, dict);
  const m = findSeparable(S).find((x) => x.verbIndex === tok.index || x.prefixIndex === tok.index);
  if (!m) return null;
  const entries = dict.lexicon[m.verb];
  return { verb: m.verb, base: m.base, prefix: m.prefixText, prefixIndex: m.prefixIndex, verbIndex: m.verbIndex, glosses: glossesFor(dict, m.verb, m.i, entries[m.i]) };
}

export function buildCard(tokens, index, dict) {
  const tok = tokens[index];
  const card = { token: tok.text, index, status: 'notfound', colloquial: null, contraction: null, readings: [], ambiguous: false, separable: null };
  if (!tok || tok.type !== 'word') return card;

  const key = tok.text.toLowerCase().replace(/’/g, "'");
  const exp = dict.colloquial && dict.colloquial[key];
  const contraction = CONTRACTIONS[key];
  let readings = [];
  let fromClosed = false;
  const closed = !contraction && !(Array.isArray(exp) && exp.length) ? closedList(dict.closed, tok.text, tok.sentenceInitial) : null;
  if (contraction) {
    // P2.1（M4）：im / zum / beim … 字典沒有這個字，但它一定是「介系詞＋冠詞」：還原後兩個字各自給解釋
    card.contraction = { parts: contraction };
    // P2.2：兩個字的解釋也以封閉詞類表為準；「這個形是什麼」標還原後的那個字（dem = …），不是 im
    const part = (p, pos) => (closedList(dict.closed, p, false) || []).filter((r) => r.pos === pos).slice(0, 1)
      .map((r, k) => ({ ...closedToReading(dict, r, k), formToken: p }));
    readings.push(...part(contraction[0], 'prep'), ...part(contraction[1], 'article'));
    if (!readings.length) { // 表上沒有（不應該發生）才退回字典
      readings.push(...readingsFor(dict, contraction[0], false).filter((r) => r.pos === 'prep').map((r) => ({ ...r, formToken: contraction[0] })));
      readings.push(...readingsFor(dict, contraction[1], false).filter((r) => r.pos === 'article').map((r) => ({ ...r, formToken: contraction[1] })));
    }
  } else if (closed) {
    // P2.2（TC）：封閉詞類（代名詞、所有格、冠詞、疑問詞、連接詞、介系詞、高頻副詞、數字）一律以手寫表為準，依句中位置排序
    readings = closedReadings(dict, tokens, tok, closed);
    fromClosed = true;
  } else if (Array.isArray(exp) && exp.length) {
    const expansions = exp.map((e) => capitalizeLike(tok.text, e));
    card.colloquial = { expansions };
    for (const e of expansions) {
      e.split(/\s+/).forEach((part, k) => {
        readings.push(...readingsFor(dict, part, k === 0 ? tok.sentenceInitial : false));
      });
    }
  } else {
    readings = readingsFor(dict, tok.text, tok.sentenceInitial);
  }
  const lc = !contraction && !closed && !card.colloquial ? lowercaseNoun(dict, tokens, tok, readings) : null;

  // 同一條目只留一份；排序：一般讀法在前 → 冠詞在前 → 原形詞頻高的在前 → 字典原順序。
  // 冠詞優先是因為「原形詞頻」對 der/die/das 失準：die 的原形 der 名次（10）輸給代名詞 das（3），
  // 但 die/den/dem/des 當冠詞的次數遠多於當代名詞。
  const seen = new Set();
  readings = readings.filter((r) => { const k = `${r.lemma}\t${r.i}`; if (seen.has(k)) return false; seen.add(k); return true; });
  readings.forEach((r, k) => { r.order = k; });
  const art = (r) => (r.pos === 'article' ? 0 : 1);
  // P2.1（TC）：功能詞（代名詞、限定詞…）「字本身就是原形」的讀法，排在「是別的功能詞的變化形」前面：
  // mein → 限定詞 mein（my）先，ich 的古舊屬格 mein 後；unser → our 先。
  // 原形詞頻對功能詞失準（ich 名次 1 會把 mein 的 my 擠到後面），所以用這條先分。
  const lower = tok.text.toLowerCase();
  const inflectedFn = (r) => (FUNCTION_POS.has(r.pos) && r.lemma.toLowerCase() !== lower ? 1 : 0);
  // 同名次（原形字串相同，例 句首 Ich = das Ich／ich）時，功能詞先於名詞等實詞
  const fnFirst = (r) => (FUNCTION_POS.has(r.pos) ? 0 : 1);
  if (!card.contraction && !fromClosed) { // 縮寫保持「介系詞、冠詞」的原順序；封閉詞類保持表上＋語境的順序
    // P2.3（M-3）：這個字對某個讀法只是命令式／虛擬式（lieb＝lieben 的命令式），對另一個讀法是正常的形（形容詞 lieb）→ 正常的形先
    const minorOnly = (r) => (r.pos === 'verb' && r.formDescriptions.length
      && r.formDescriptions.every((d) => /^(imperative|subjunctive)/.test(d)) ? 1 : 0);
    // P2.4：兩個形容詞讀法時，「這個字本身就是原形」的先（lecker 是形容詞 lecker，不是 leck 的變格形 leck+er）
    const hasAdjCitation = readings.some((r) => r.pos === 'adj' && r.lemma.toLowerCase() === lower);
    const adjInflected = (r) => (hasAdjCitation && r.pos === 'adj' && r.lemma.toLowerCase() !== lower ? 1 : 0);
    readings.sort((a, b) => (a.other - b.other) || (art(a) - art(b)) || (inflectedFn(a) - inflectedFn(b)) || (minorOnly(a) - minorOnly(b))
      || (adjInflected(a) - adjInflected(b)) || (a.rank - b.rank)
      || (fnFirst(a) - fnFirst(b))
      || (a.lemma === b.lemma ? a.i - b.i : a.order - b.order));
    readings = participleOrder(dict, tokens, tok, readings);
    readings = chatFirstPerson(dict, tokens, tok, readings);
    // P2.3（M-3）：這個字是可分離動詞的主動詞（Wir weisen Sie darauf hin）→ 動詞讀法先（不是形容詞 weise）
    const sep = separableHint(dict, tokens, tok);
    if (sep && sep.verbIndex === tok.index && sep.base) {
      const first = readings.filter((r) => r.pos === 'verb' && r.lemma === sep.base);
      readings = [...first, ...readings.filter((r) => !first.includes(r))];
    }
    // P2.2（M-c）：名詞化形容詞（die Kleine）排第一
    const nom = nominalizedReading(dict, tokens, tok);
    if (nom) readings.unshift(nom);
    // P2.2（M-d）：高頻開放詞類的首要讀法手寫覆寫（gloss-overrides.json 的 _primary：weiß → wissen …）
    const prim = dict.glossOverrides && dict.glossOverrides._primary && dict.glossOverrides._primary[lower];
    if (prim) {
      const k = readings.findIndex((r) => r.lemma === prim[0] && r.pos === prim[1]);
      if (k > 0) readings.unshift(...readings.splice(k, 1));
    }
    if (key === 'ne') readings = neFirst(tokens, tok, readings);
    // P2.2 加修：小寫名詞排第一並註明（zeit → die Zeit）；其他同形名詞放最後
    if (lc) {
      readings = [...lc.first, ...readings, ...lc.rest];
      card.lowercaseNoun = lc.lemma;
      card.lowercaseNote = lc.note;
    }
  }
  readings.forEach((r) => { delete r.order; if (r.rank === Infinity) delete r.rank; });

  card.readings = readings;
  card.ambiguous = readings.filter((r) => !r.other).length > 1;
  card.status = readings.length || card.colloquial || card.contraction ? 'found' : 'notfound';
  if (!card.colloquial) card.separable = separableHint(dict, tokens, tok);
  // 字形規則（G15–G20）：掛在字卡的 Why this form；查不到的字不講（零編造）
  card.wordRules = card.status === 'found' && !card.colloquial ? analyzeWord(tokens, index, dict) : [];
  if (card.status === 'found' && !card.colloquial && !card.contraction) addContext(dict, tokens, tok, card);
  return card;
}

// ---------- P2.6（SPEC §4.5）：這句裡的形＋用法 ----------
function addContext(dict, tokens, tok, card) {
  const S = buildSentence(tokens, tok.sentence, dict);
  const w = S.words.find((x) => x.index === tok.index);
  if (!w) return;
  let sentenceRules = null, articleRules = null;
  // 句型規則與前面冠詞的 G15 只在需要時才跑（點字到卡片的時間，T6）
  const sentence = () => sentenceRules || (sentenceRules = analyzeSentence(tokens, tok.sentence, dict));
  const articles = () => articleRules || (articleRules = S.words.slice(Math.max(0, w.k - 4), w.k)
    .flatMap((x) => analyzeWord(tokens, x.index, dict)));
  const res = dict.lookup(tok.text, { sentenceInitial: tok.sentenceInitial });
  for (const r of card.readings) {
    if (r.other || r.closed || r.formToken || r.lowercaseNote || r.i >= 900) continue;
    const all = res.candidates.filter((c) => c.lemma === r.lemma && c.i === r.i).map((c) => c.tags);
    const nonRare = all.filter((t) => !t.some((x) => RARE_TAGS.has(x)));
    const tagsets = nonRare.length ? nonRare : all;
    const cf = contextForm({
      S, w, reading: r, tagsets, describe: describeTags, wordRules: card.wordRules,
      get sentenceRules() { return r.pos === 'verb' ? sentence() : []; },
      get articleRules() { return r.pos === 'noun' ? articles() : []; },
    });
    if (cf) { r.contextForm = cf.contextForm; r.otherForms = cf.otherForms; }
    const sep = card.separable && r.pos === 'verb' && card.separable.base === r.lemma ? card.separable.verb : null;
    const usage = usageFor(dict, S, w, r, sep || r.lemma);
    if (usage) r.usage = usage;
  }
}
