// G02 從句動詞放句尾：weil / dass / wenn / ob / als / obwohl / damit / bevor / nachdem 開頭的子句，
// 而且子句最後一個字確實是變位動詞才算（als 當比較用、damit 當副詞用時句尾不是動詞 → 不觸發）。
import { q } from '../grammar/german.js';
import { isFinite, lastWord } from '../grammar/sentence.js';

export default {
  id: 'G02',
  level: 'sentence',
  title: 'Verb at the end of a subordinate clause',
  detect(S) {
    const out = [];
    for (const clause of S.clauses) {
      if (clause.type !== 'sub') continue;
      const last = lastWord(clause);
      if (last === clause.lead || !isFinite(last)) continue;
      out.push({
        what: `${q(clause.lead.text)} starts a subordinate clause, so its conjugated verb ${q(last.text)} goes to the very end.`,
        why: 'Subordinating conjunctions (weil, dass, wenn, ob, als, obwohl, damit, bevor, nachdem) send the conjugated verb to the end of their clause. Coordinating ones (und, aber, oder, denn) do not change the word order.',
        pattern: '…, weil + subject + … + verb.',
        marks: [...clause.body.map((w) => ({ index: w.index, kind: 'clause' })), { index: last.index, kind: 'end-verb' }],
        data: { lead: clause.lead.index, verbIndex: last.index },
      });
    }
    return out;
  },
  examples: {
    positive: [{ text: 'Ich bleibe zu Hause, weil ich krank bin.' }, { text: 'Ich weiß, dass du morgen kommst.' }],
    negative: [{ text: 'Ich bin krank, aber ich komme.' }, { text: 'Ich komme nicht, denn ich bin krank.' }, { text: 'Er ist größer als ich.' }],
  },
};
