// G01 主句動詞第二位（V2），含倒裝。只處理直述句的第一個主句；
// 句首就是動詞（命令、是非問句）或句首是從句時不判斷。
import { q, W_WORDS } from '../grammar/german.js';
import { isFinite, isNoun, hasPos, isSubjectPronoun } from '../grammar/sentence.js';

// 動詞前面的東西是不是「一個成分」：單一個字，或 [介系詞] [冠詞] [形容詞…] 名詞
function oneConstituent(pre) {
  if (pre.length === 1) return true;
  let k = 0;
  if (hasPos(pre[k], 'prep')) k++;
  if (k < pre.length && (hasPos(pre[k], 'article') || hasPos(pre[k], 'det'))) k++;
  while (k < pre.length - 1 && (hasPos(pre[k], 'adj') || hasPos(pre[k], 'num'))) k++;
  return k === pre.length - 1 && isNoun(pre[k]);
}

export default {
  id: 'G01',
  level: 'sentence',
  title: 'Verb in position 2',
  detect(S) {
    if (S.endPunct === '?') return [];
    const clause = S.clauses[0];
    if (!clause || clause.type !== 'main' || clause.coord) return [];
    const body = clause.body;
    if (isFinite(body[0], { imperative: true }) || W_WORDS.has(body[0].lower)) return [];
    for (let j = 1; j < Math.min(body.length, 5); j++) {
      if (!isFinite(body[j])) continue;
      const pre = body.slice(0, j);
      if (!oneConstituent(pre)) return [];
      const verb = body[j];
      const first = pre.map((w) => w.text).join(' ');
      const after = body[j + 1];
      let what;
      // P2.1（B5）：ihr／Ihr 後面接名詞是所有格（Maria ruft ihr Kind），不可說成主詞
      if (pre.length === 1 && isSubjectPronoun(S, pre[0])) {
        what = `${q(verb.text)} is the conjugated verb. It stands in position 2, right after the subject ${q(first)}.`;
      } else if (after && isSubjectPronoun(S, after)) {
        what = `${q(verb.text)} is the conjugated verb in position 2. ${q(first)} takes position 1, so the subject ${q(after.text)} moves behind the verb.`;
      } else {
        what = `${q(verb.text)} is the conjugated verb in position 2, right after ${q(first)}.`;
      }
      return [{
        what,
        why: 'In a German main clause the conjugated verb is always the second element. Position 1 can be the subject or something else (a time, a place, an object). If it is not the subject, the subject goes right after the verb.',
        pattern: 'Position 1 + verb + … (Ich gehe … / Morgen gehe ich …)',
        marks: [{ index: verb.index, kind: 'v2' }],
        data: { verbIndex: verb.index },
      }];
    }
    return [];
  },
  examples: {
    positive: [{ text: 'Morgen gehe ich ins Kino.' }, { text: 'Der Mann wohnt hier.' }],
    negative: [{ text: 'Gehst du morgen ins Kino?' }, { text: 'Komm bitte her!' }],
  },
};
