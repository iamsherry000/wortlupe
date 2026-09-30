// G16 形容詞詞尾：強／弱／混合變化，指出決定詞尾的冠詞。
// 條件：形容詞緊接名詞；前面是冠詞類（弱／混合）或沒有冠詞（強）；
// 形容詞 tag × 冠詞 × 名詞 × 介系詞交集後只剩一種（性別, 格, 數）才講。比較級、最高級、字幹會變的（teuer → teure）先不講。
import { q, articleForms, DER_WORDS, EIN_WORDS, CASE_NAME, GENDER_NAME, PREP_CASES } from '../grammar/german.js';
import { hasPos, isNoun, nounCombos } from '../grammar/sentence.js';

const TAG2CASE = { nominative: 'nom', accusative: 'acc', dative: 'dat', genitive: 'gen' };
const TEXT = {
  weak: {
    name: 'weak',
    why: 'After der, die, das (and dieser, jeder …) the article already shows the case, so the adjective only takes -e or -en.',
    pattern: 'der/die/das + adjective-e/-en + noun',
  },
  mixed: {
    name: 'mixed',
    why: 'After ein, kein, mein, dein …: where ein has no ending (ein Mann, ein Haus), the adjective shows the gender with -er (der) or -es (das). Everywhere else it is -e or -en.',
    pattern: 'ein + adjective-er (m) / -es (n) / -e (f) + noun',
  },
  strong: {
    name: 'strong',
    why: 'With no article, the adjective does the article’s job and takes almost the same ending as der/die/das: guter Wein (der), mit gutem Wein (dem).',
    pattern: 'adjective-er/-e/-es/-em/-en + noun (no article)',
  },
};

export default {
  id: 'G16',
  level: 'word',
  title: 'Why this adjective ending',
  detect(S, w) {
    const noun = S.words[w.k + 1];
    if (!noun || noun.commaBefore || !isNoun(noun) || !/^\p{Lu}/u.test(noun.text) || !/^\p{Ll}/u.test(w.text)) return [];
    const prev = S.words[w.k - 1];
    let decl, art = null;
    // 冠詞類只看字形（正則已列死所有形）；ein 在 Wiktionary 另有形容詞讀法（"on"），不能拿詞性擋
    if (prev && !w.commaBefore && DER_WORDS.test(prev.lower)) { decl = 'weak'; art = prev; }
    else if (prev && !w.commaBefore && EIN_WORDS.test(prev.text)) { decl = 'mixed'; art = prev; }
    else if (!prev || w.commaBefore || hasPos(prev, 'prep') || hasPos(prev, 'verb')) decl = 'strong';
    else return [];

    const adj = w.cands.filter((c) => c.pos === 'adj' && c.tags.includes(decl) && !c.tags.includes('comparative') && !c.tags.includes('superlative'));
    if (!adj.length) return [];
    const lemma = adj[0].lemma;
    if (!w.lower.startsWith(lemma.toLowerCase()) || w.lower === lemma.toLowerCase()) return [];
    const ending = w.lower.slice(lemma.length);
    if (!/^(e|en|er|es|em)$/.test(ending)) return [];

    // 形容詞 tag 允許的組合
    let combos = new Set();
    for (const c of adj) {
      const cs = c.tags.map((t) => TAG2CASE[t]).filter(Boolean);
      const g = c.tags.includes('plural') ? ['pl'] : ['masculine', 'feminine', 'neuter'].filter((x) => c.tags.includes(x)).map((x) => x[0]);
      for (const x of g) for (const y of cs) combos.add(`${x}|${y}`);
    }
    const nc = nounCombos(noun);
    combos = new Set([...combos].filter((x) => nc.has(x)));
    if (art) {
      const af = articleForms(art.lower);
      if (af) combos = new Set([...combos].filter((x) => af.rows.some(([g, c]) => `${g}|${c}` === x)));
    }
    const before = art ? S.words[art.k - 1] : prev;
    const prepKind = before && hasPos(before, 'prep') && (S.dict.prepositions || {})[before.lower];
    if (prepKind) combos = new Set([...combos].filter((x) => PREP_CASES[prepKind].includes(x.split('|')[1])));
    if (combos.size !== 1) return [];

    const [g, c] = [...combos][0].split('|');
    const gn = g === 'pl' ? 'plural' : `${GENDER_NAME[g]} singular`;
    const phrase = S.words.slice((art || w).k, noun.k + 1).map((x) => x.text).join(' ');
    const t = TEXT[decl];
    const after = art ? `after ${q(art.text)}` : 'with no article';
    return [{
      what: `${q(phrase)}: ${t.name} ending ${after}. ${gn.replace(' singular', '')} ${CASE_NAME[c]}${g === 'pl' ? '' : ' singular'} → -${ending}.`,
      why: t.why,
      pattern: t.pattern,
      data: { declension: decl, gender: g === 'pl' ? null : g, case: c, number: g === 'pl' ? 'pl' : 'sg', ending },
    }];
  },
  examples: {
    positive: [{ text: 'ein großer Mann', target: 'großer' }, { text: 'mit dem großen Mann', target: 'großen' }],
    negative: [{ text: 'Das Haus ist groß.', target: 'groß' }, { text: 'Der Mann ist sehr groß.', target: 'groß' }],
  },
};
