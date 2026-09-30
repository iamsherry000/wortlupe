// G12 第二虛擬式：würde＋原形、hätte / wäre / könnte …
// 只在字形「一定是」虛擬式時才講：同一個形也可能是過去式（sollte、spielte）就不講。
import { q } from '../grammar/german.js';
import { verbCands, isInfinitive, clauseOf, lastWord } from '../grammar/sentence.js';

const WHY = 'Konjunktiv II is for polite requests, wishes and things that are not real. Most verbs use würde + infinitive; haben, sein and the modal verbs have their own forms: hätte, wäre, könnte, müsste …';

export default {
  id: 'G12',
  level: 'sentence',
  title: 'Konjunktiv II (würde, hätte, wäre, könnte …)',
  detect(S) {
    const out = [];
    for (const w of S.words) {
      const vc = verbCands(w);
      const k2 = vc.filter((c) => c.tags.includes('subjunctive-ii'));
      if (!k2.length || vc.some((c) => c.tags.includes('preterite'))) continue;
      const lemma = k2[0].lemma;
      // P2.1（B6 根因）：führe 是 fahren 的虛擬式，也是 führen 的現在式。原本只排除「同形過去式」，
      // 沒排除「別的動詞的直述句」。現在要求：這個字所有動詞讀法都是同一個原形的第二虛擬式
      if (vc.some((c) => c.lemma !== lemma || !c.tags.includes('subjunctive-ii'))) continue;
      const clause = clauseOf(S, w);
      const last = clause && lastWord(clause);
      let what;
      if (lemma === 'mögen') {
        what = `${q(w.text)} is the Konjunktiv II of mögen, used as the polite “would like”.`;
      } else if (lemma === 'werden' && last && last !== w && isInfinitive(last)) {
        what = `${q(`${w.text} … ${last.text}`)} is Konjunktiv II: würde + infinitive at the end.`;
      } else {
        what = `${q(w.text)} is the Konjunktiv II form of ${lemma}.`;
      }
      out.push({
        what,
        why: WHY,
        pattern: 'würde + … + infinitive / hätte, wäre, könnte + …',
        marks: [{ index: w.index, kind: 'focus' }],
        data: { verb: lemma },
      });
    }
    return out;
  },
  examples: {
    positive: [{ text: 'Ich würde gern kommen.' }, { text: 'Könnten Sie mir helfen?' }],
    negative: [{ text: 'Ich konnte nicht kommen.' }, { text: 'Er spielte gestern.' }, { text: 'Wir führen ein langes Gespräch.' }],
  },
};
