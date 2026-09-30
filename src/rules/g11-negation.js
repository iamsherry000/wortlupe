// G11 否定：nicht 與 kein 的分工。只比對 nicht 與 kein 的各形（nichts 不是 nicht）。
import { q, NEGATION_KEIN } from '../grammar/german.js';
import { isNoun, clauseOf, lastWord } from '../grammar/sentence.js';

const WHY = 'German has two negation words. kein negates a noun that would otherwise have ein or no article (keine Zeit, kein Auto). nicht negates everything else: verbs, adjectives, adverbs, and nouns with der/die/das or a name.';

export default {
  id: 'G11',
  level: 'sentence',
  title: 'Negation: nicht or kein',
  detect(S) {
    const out = [];
    for (const w of S.words) {
      if (NEGATION_KEIN.has(w.lower)) {
        // P2.3（A1）：WhatsApp 的小寫名詞（keine zeit）也算名詞
        const noun = S.words.slice(w.k + 1, w.k + 4).find((x) => isNoun(x) && (/^\p{Lu}/u.test(x.text) || x.lcNoun));
        out.push({
          // P2.1（可延後項）：後面沒有名詞時 kein- 是代名詞（Keiner hat angerufen = nobody），不是「否定一個名詞」
          what: noun
            ? `${q(w.text)} negates the noun ${q(noun.text)}. Use kein where you would otherwise say ein or no article.`
            : `${q(w.text)} stands alone here, without a noun: it means “none” (keiner can also mean “nobody”).`,
          why: WHY,
          pattern: 'kein + noun (ein Auto → kein Auto, Zeit → keine Zeit)',
          marks: [{ index: w.index, kind: 'focus' }],
          data: { word: 'kein' },
        });
      } else if (w.lower === 'nicht') {
        // P2.1（可延後項）：nicht nur … sondern auch = not only … but also，不是否定
        const next = S.words[w.k + 1];
        if (next && next.lower === 'nur' && S.words.some((x) => x.k > w.k && x.lower === 'sondern')) continue;
        const clause = clauseOf(S, w);
        const atEnd = clause && lastWord(clause) === w;
        out.push({
          what: atEnd
            ? `${q(w.text)} makes this negative. At the end of the clause it negates the whole statement.`
            : `${q(w.text)} makes this negative.`,
          why: WHY,
          pattern: '… nicht (Ich komme nicht.) / nicht + adjective (nicht gut)',
          marks: [{ index: w.index, kind: 'focus' }],
          data: { word: 'nicht' },
        });
      }
    }
    return out;
  },
  examples: {
    positive: [{ text: 'Ich habe keine Zeit.' }, { text: 'Ich komme nicht.' }],
    negative: [{ text: 'Nichts ist passiert.' }, { text: 'Ich habe Zeit.' }, { text: 'Das ist nicht nur teuer, sondern auch schlecht.' }],
  },
};
