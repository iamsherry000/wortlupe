// G06 可分離動詞：主句的變位動詞＋同一子句最後一個字（前綴）重組成一個動詞（與 T4 共用）。
// 三道防線：前綴字在可分離前綴表裡；字典有「前綴＋原形」這個動詞；字典標明它可分離而且前綴相符。
// 從句（動詞已在句尾合體，例 …, weil ich aufstehe）不拆。
import { q, SEPARABLE_PARTICLES } from '../grammar/german.js';
import { finiteCands, lastWord, firstFinite, isFinite } from '../grammar/sentence.js';

export function findSeparable(S) {
  const out = [];
  for (const clause of S.clauses) {
    if (clause.type !== 'main') continue;
    // 命令式只可能在子句第一個字（Mach … zu!）；句中的 acht（achten 的命令式）不可搶走 fängt
    const verb = isFinite(clause.body[0], { imperative: true }) ? clause.body[0] : firstFinite(clause);
    let prefix = lastWord(clause);
    // P2.4：前綴後面還接 zu＋不定詞（Hör auf zu lachen!、Ich fange an zu arbeiten.）→ 前綴在 zu 前面
    const zu = prefix && S.words[prefix.k - 1];
    if (zu && zu.lower === 'zu' && !prefix.commaBefore && !zu.commaBefore) {
      const p2 = S.words[prefix.k - 2];
      if (p2 && SEPARABLE_PARTICLES.has(p2.text) && !p2.commaBefore) prefix = p2;
    }
    if (!verb || !prefix || verb === prefix || prefix.k <= verb.k) continue;
    if (!SEPARABLE_PARTICLES.has(prefix.text) || prefix.commaBefore) continue; // 小寫、完全相符
    for (const c of finiteCands(verb, { imperative: true })) {
      if (c.lemma === 'sein') continue; // da sein、dabei sein 現在分開寫，不是可分離動詞
      const compound = prefix.text + c.lemma;
      const entries = S.dict.lexicon[compound];
      if (!entries) continue;
      const i = entries.findIndex((e) => e.pos === 'verb' && e.verb && e.verb.separable === true && e.verb.prefix === prefix.text);
      if (i < 0) continue;
      out.push({ verb: compound, i, verbIndex: verb.index, prefixIndex: prefix.index, verbText: verb.text, prefixText: prefix.text, base: c.lemma });
      break;
    }
  }
  return out;
}

export default {
  id: 'G06',
  level: 'sentence',
  title: 'Separable verb: prefix at the end',
  detect(S) {
    return findSeparable(S).map((m) => {
      const gloss = ((S.dict.lexicon[m.verb][m.i].glosses || [])[0] || '').split(/[;,(]/)[0].trim();
      return {
        what: `${q(`${m.verbText} … ${m.prefixText}`)} is one verb: ${m.verb}${gloss ? ` (${gloss})` : ''}. In a main clause the prefix ${q(m.prefixText)} splits off and goes to the end.`,
        why: 'Separable verbs (anrufen, aufstehen, einkaufen) have a stressed prefix. When the verb is conjugated in a main clause, the prefix goes to the end. In a subordinate clause or in the infinitive it stays attached: …, weil ich aufstehe.',
        pattern: 'verb (position 2) + … + prefix (end)',
        marks: [{ index: m.verbIndex, kind: 'sep-verb' }, { index: m.prefixIndex, kind: 'sep-prefix' }],
        data: { verb: m.verb, verbIndex: m.verbIndex, prefixIndex: m.prefixIndex, gloss },
      };
    });
  },
  examples: {
    positive: [{ text: 'Ich stehe um sieben Uhr auf.' }, { text: 'Wann fängt der Film an?' }, { text: 'Um acht Uhr fängt die Schule an.' }],
    negative: [{ text: 'Ich verstehe das nicht.' }, { text: '..., weil ich um sieben aufstehe.' }, { text: 'Er bekommt ein Paket.' }],
  },
};
