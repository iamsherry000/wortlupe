// G09 是非問句：以問號結尾、第一個字就是變位動詞（W 問句不算，它是 V2）。
import { q, W_WORDS } from '../grammar/german.js';
import { isFinite, hasMatchingSubject } from '../grammar/sentence.js';

export default {
  id: 'G09',
  level: 'sentence',
  title: 'Yes/no question: verb first',
  detect(S) {
    if (S.endPunct !== '?') return [];
    // P2.3（判定 2）：句首感嘆詞（hey kommst du mit?）不算，從第一個子句去掉感嘆詞後的第一個字看
    const clause = S.clauses[0];
    const first = clause && clause.body[0];
    if (!first || W_WORDS.has(first.lower) || !isFinite(first) || S.words.length < 2) return [];
    // P2.3（判定 1、A4）：第一個子句裡要有跟這個動詞對得上的主詞。
    // muss noch schnell einkaufen, brauchst du was? 的 muss 沒有主詞＝省略主詞的陳述句，問句是後半句
    if (!hasMatchingSubject(S, clause, first)) return [];
    return [{
      what: `The question starts with the conjugated verb ${q(first.text)}: a yes/no question.`,
      why: 'In a yes/no question the conjugated verb moves to position 1 and the subject comes right after it. Questions with a question word (was, wo, wann …) keep the verb in position 2.',
      pattern: 'Verb + subject + …?',
      marks: [{ index: first.index, kind: 'v2' }],
      data: { verbIndex: first.index },
    }];
  },
  examples: {
    positive: [{ text: 'Hast du Zeit?' }, { text: 'Kommst du morgen?' }],
    negative: [{ text: 'Was machst du?' }, { text: 'Du hast Zeit.' }],
  },
};
