// G08 介系詞縮寫：im / am / zum / zur / ins / beim / vom。只比對整個字（Imbiss 裡的 im 不算）。
// am + 最高級（am besten）是固定用法，不當成 an dem 講。
import { q, CONTRACTIONS } from '../grammar/german.js';
import { isEnglishWord } from '../grammar/sentence.js';

const CASE_OF = { dem: 'dative', der: 'dative', das: 'accusative' };

export default {
  id: 'G08',
  level: 'sentence',
  title: 'Preposition + article in one word',
  detect(S) {
    const out = [];
    for (const w of S.words) {
      const parts = CONTRACTIONS[w.lower];
      if (!parts) continue;
      const next = S.words[w.k + 1];
      if (w.lower === 'am' && next && /^\p{Ll}.*(st|ß)en$/u.test(next.text)) continue;
      // P2.3（M-5）：英德夾雜的 I am …／am + 英文字 不是 an dem
      if (w.lower === 'am' && (isEnglishWord(S.words[w.k - 1]) || isEnglishWord(next))) continue;
      const [prep, art] = parts;
      out.push({
        what: `${q(w.text)} is short for “${prep} ${art}”. ${art} is ${CASE_OF[art]} here.`,
        why: 'Some prepositions merge with the article: im (in dem), am (an dem), ins (in das), zum (zu dem), zur (zu der), beim (bei dem), vom (von dem). The short form is the normal one; the long form puts extra weight on the article.',
        pattern: `${prep} + ${art} → ${w.lower}`,
        marks: [{ index: w.index, kind: 'focus' }],
        data: { preposition: prep, article: art },
      });
    }
    return out;
  },
  examples: {
    positive: [{ text: 'Ich bin im Büro.' }, { text: 'Ich fahre zum Bahnhof.' }],
    negative: [{ text: 'Das schmeckt am besten.' }, { text: 'Ich bin in dem Büro.' }],
  },
};
