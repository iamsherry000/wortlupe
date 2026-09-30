// G03 關係子句：逗號後的 der / die / das / den / dem / deren / dessen，前面緊接一個名詞、
// 性別或數與那個名詞對得上、子句句尾是變位動詞，才算關係子句（否則 der 可能只是冠詞）。
// 關係代名詞的判斷（逗號後、指回前一個名詞、性別對得上）放在 sentence.js 的 relativeAntecedent，跟 G15 共用。
import { q } from '../grammar/german.js';
import { isFinite, lastWord, relativeAntecedent } from '../grammar/sentence.js';

export default {
  id: 'G03',
  level: 'sentence',
  title: 'Relative clause: verb at the end',
  detect(S) {
    const out = [];
    for (const clause of S.clauses) {
      const lead = clause.body[0];
      if (!lead || clause.coord || clause.body.length < 3) continue;
      const noun = relativeAntecedent(S, lead);
      if (!noun) continue;
      const last = lastWord(clause);
      if (last === lead || !isFinite(last)) continue;
      out.push({
        what: `${q(lead.text)} refers back to ${q(noun.text)} and starts a relative clause, so the verb ${q(last.text)} goes to the end.`,
        why: 'A relative clause describes a noun. It starts with der, die or das: the gender and number match the noun, the case depends on its job inside the clause. Like every subordinate clause, it puts the conjugated verb at the end.',
        pattern: 'noun, der/die/das + … + verb',
        marks: [...clause.body.map((w) => ({ index: w.index, kind: 'clause' })), { index: last.index, kind: 'end-verb' }],
        data: { pronoun: lead.index, noun: noun.index, verbIndex: last.index },
      });
    }
    return out;
  },
  examples: {
    positive: [{ text: 'Das ist der Mann, der hier wohnt.' }, { text: 'Ich kenne die Frau, die dort arbeitet.' }],
    negative: [{ text: 'Der Mann wohnt hier.' }, { text: 'Ich weiß, das ist gut.' }],
  },
};
