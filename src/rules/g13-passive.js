// G13 被動式：werden（現在式或過去式）＋過去分詞放句尾。
// 防誤判：句尾若也可能是原形（bekommen）或本身就是形容詞（verrückt）就不講；werden＋名詞（成為）、werden＋原形（未來式）不算。
import { q } from '../grammar/german.js';
import { finiteCands, participleCands, isInfinitive, hasPos, lastWord } from '../grammar/sentence.js';

const isWerden = (w) => finiteCands(w).some((c) => c.lemma === 'werden' && !c.tags.some((t) => t.startsWith('subjunctive')));
function pureParticiple(w) {
  const ps = participleCands(w).filter((c) => c.lemma !== 'werden');
  if (!ps.length || isInfinitive(w)) return null;
  // 詞彙化的形容詞（verrückt）不當分詞；但 Wiktionary 也替 geliefert 這種普通分詞開了形容詞條目，
  // 所以只在形容詞比動詞常用時才排除（P2.1 修 wurde … geliefert 漏判）
  const verbRank = Math.min(...ps.map((c) => (c.entry && c.entry.rank) || Infinity));
  if (w.cands.some((c) => c.pos === 'adj' && c.lemma.toLowerCase() === w.lower && !c.tags.length
    && ((c.entry && c.entry.rank) || Infinity) < verbRank)) return null;
  if (hasPos(w, 'noun')) return null;
  return ps[0].lemma;
}

export default {
  id: 'G13',
  level: 'sentence',
  title: 'Passive: werden + past participle',
  detect(S) {
    const out = [];
    for (const clause of S.clauses) {
      const last = lastWord(clause);
      let wW = null, pW = null;
      if (clause.type === 'main') { wW = clause.body.find((w) => w !== last && isWerden(w)); pW = last; }
      else if (clause.body.length >= 3) { wW = isWerden(last) ? last : null; pW = clause.body[clause.body.length - 2]; }
      if (!wW || !pW || wW === pW) continue;
      const lemma = pureParticiple(pW);
      if (!lemma) continue;
      out.push({
        what: `${q(wW.text)} + ${q(pW.text)} is the passive: werden + the past participle of ${lemma}.`,
        why: 'The passive puts the action in focus, not the person who does it. Compare: werden + noun means “become” (Er wird Lehrer); werden + infinitive is the future (Ich werde kommen).',
        pattern: 'subject + werden + … + past participle',
        marks: [{ index: wW.index, kind: clause.type === 'main' ? 'v2' : 'end-verb' }, { index: pW.index, kind: 'end-verb' }],
        data: { verb: lemma },
      });
    }
    return out;
  },
  examples: {
    positive: [{ text: 'Das Haus wird gebaut.' }, { text: 'Die Tür wird geöffnet.' }],
    negative: [{ text: 'Er wird Lehrer.' }, { text: 'Ich werde morgen kommen.' }, { text: 'Ich werde es bekommen.' }],
  },
};
