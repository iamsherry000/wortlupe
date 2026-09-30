// G04 情態動詞＋原形動詞放句尾（Satzklammer）。句尾必須真的是原形動詞（Ich muss los. 不算）。
import { q, MODAL_LEMMAS } from '../grammar/german.js';
import { finiteCands, isInfinitive, lastWord, firstFinite, participleCands } from '../grammar/sentence.js';

const isModal = (w) => finiteCands(w).some((c) => MODAL_LEMMAS.has(c.lemma));
const WHY = 'Modal verbs (können, müssen, dürfen, sollen, wollen, möchten) need a second verb. The modal is conjugated; the other verb goes to the end in its infinitive form. Together they form a bracket around the rest of the clause.';

export default {
  id: 'G04',
  level: 'sentence',
  title: 'Modal verb + infinitive at the end',
  detect(S) {
    const out = [];
    for (const clause of S.clauses) {
      const last = lastWord(clause);
      if (clause.type === 'main') {
        const modal = firstFinite(clause);
        if (!modal || !isModal(modal) || last === modal || !isInfinitive(last) || /^\p{Lu}/u.test(last.text)) continue;
        // P2.2（RD 同類）：kann … verschoben werden＝被動不定詞（過去分詞＋werden），主要動詞是 verschieben，不是 werden
        const before = S.words[last.k - 1];
        if (last.lower === 'werden' && before && participleCands(before).length) {
          const main = participleCands(before)[0].lemma;
          out.push({
            what: `${q(modal.text)} is a modal verb. ${q(`${before.text} werden`)} at the end is a passive infinitive: the past participle of ${main} + werden.`,
            why: `${WHY} In the passive, the infinitive is past participle + werden: Der Termin kann verschoben werden = the appointment can be postponed.`,
            pattern: 'subject + modal verb + … + past participle + werden',
            marks: [{ index: modal.index, kind: 'v2' }, { index: before.index, kind: 'end-verb' }, { index: last.index, kind: 'end-verb' }],
            data: { modal: modal.index, infinitive: last.index, passive: true },
          });
          continue;
        }
        out.push({
          what: `${q(modal.text)} is a modal verb, so the main verb ${q(last.text)} goes to the end in its infinitive form.`,
          why: WHY,
          pattern: 'subject + modal verb + … + infinitive',
          marks: [{ index: modal.index, kind: 'v2' }, { index: last.index, kind: 'end-verb' }],
          data: { modal: modal.index, infinitive: last.index },
        });
      } else if (clause.body.length >= 3) {
        const inf = clause.body[clause.body.length - 2];
        if (!isModal(last) || !isInfinitive(inf) || /^\p{Lu}/u.test(inf.text)) continue;
        out.push({
          what: `In this subordinate clause the infinitive ${q(inf.text)} comes first and the modal verb ${q(last.text)} goes last.`,
          why: WHY,
          pattern: '…, weil + subject + … + infinitive + modal verb.',
          marks: [{ index: inf.index, kind: 'end-verb' }, { index: last.index, kind: 'end-verb' }],
          data: { modal: last.index, infinitive: inf.index },
        });
      }
    }
    return out;
  },
  examples: {
    positive: [{ text: 'Ich muss heute arbeiten.' }, { text: 'Kannst du mir helfen?' }],
    negative: [{ text: 'Ich muss los.' }, { text: 'Ich kann Deutsch.' }],
  },
};
