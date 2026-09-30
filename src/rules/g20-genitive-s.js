// G20 所有格 -s / -es：陽性或中性名詞的第二格單數，而且剛好是「原形＋s／es」。
import { q } from '../grammar/german.js';
import { nounIsClear, hasPos } from '../grammar/sentence.js';

const GEN_DET = /^(des|eines|keines|meines|deines|seines|ihres|unseres|eures|dieses|jenes|jedes|welches)$/;

export default {
  id: 'G20',
  level: 'word',
  title: 'Why the -s / -es: genitive',
  detect(S, w) {
    if (!nounIsClear(w)) return []; // 句首大寫又有別的讀法（Wegen）→ 不當名詞講
    // P2.1（B4 根因）：Autos 在變化表裡同時是「屬格單數」與「複數」，原本只看 tag 就講所有格。
    // 現在要求前面（可以隔著形容詞）有屬格限定詞 des / eines / meines / dieses …，字形之外要有上下文證據
    let k = w.k - 1;
    while (k >= 0 && hasPos(S.words[k], 'adj') && /^\p{Ll}/u.test(S.words[k].text)) k--;
    if (k < 0 || !GEN_DET.test(S.words[k].lower)) return [];
    for (const c of w.cands) {
      if (c.pos !== 'noun' || !c.tags.includes('genitive') || !c.tags.includes('singular') || !c.entry || !c.entry.gender) continue;
      if (!c.entry.gender.some((g) => g === 'm' || g === 'n')) continue;
      const end = w.text === `${c.lemma}es` ? 'es' : w.text === `${c.lemma}s` ? 's' : null;
      if (!end) continue;
      return [{
        what: `${q(w.text)} = ${c.lemma} + ${end}. It is genitive singular (whose?), so the masculine or neuter noun adds -${end}.`,
        why: 'Masculine and neuter nouns add -s or -es in the genitive singular: des Autos, des Mannes. -es is common after one syllable and needed after -s, -ß, -x, -z (des Hauses). Feminine nouns never add anything.',
        pattern: 'des + noun + s/es (das Auto des Mannes)',
        data: { lemma: c.lemma, ending: end },
      }];
    }
    return [];
  },
  examples: {
    positive: [{ text: 'das Auto des Mannes', target: 'Mannes' }, { text: 'die Tür des Hauses', target: 'Hauses' }],
    negative: [{ text: 'der Mann', target: 'Mann' }, { text: 'die Farbe der Tür', target: 'Tür' }, { text: 'Wir haben zwei Autos.', target: 'Autos' }],
  },
};
