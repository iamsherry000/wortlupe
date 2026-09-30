// G05 完成式：現在式的 haben / sein ＋ 過去分詞放句尾。
// 防誤判：分詞的動詞在字典裡必須真的用這個助動詞（Die Bank ist geschlossen. 的 schließen 用 haben → 不是完成式）。
import { q } from '../grammar/german.js';
import { finiteCands, participleCands, lastWord, hasMatchingSubject } from '../grammar/sentence.js';

const WHY = 'Most verbs form the perfect with haben. Verbs of movement from one place to another (gehen, fahren, kommen) and of change of state (werden, einschlafen), plus sein and bleiben, use sein.';

function auxOf(w) {
  const c = finiteCands(w).find((x) => (x.lemma === 'haben' || x.lemma === 'sein') && x.tags.includes('present') && !x.tags.some((t) => t.startsWith('subjunctive')));
  return c ? c.lemma : null;
}
function participleUsing(S, w, aux) {
  for (const c of participleCands(w)) {
    const entries = (S.dict.lexicon[c.lemma] || []).filter((e) => e.pos === 'verb' && e.verb && e.verb.auxiliary);
    if (entries.some((e) => e.verb.auxiliary.includes(aux))) return c.lemma;
  }
  return null;
}

export default {
  id: 'G05',
  level: 'sentence',
  title: 'Perfect tense: haben/sein + past participle',
  detect(S) {
    const out = [];
    for (const clause of S.clauses) {
      const last = lastWord(clause);
      let auxW = null, partW = null;
      if (clause.type === 'main') {
        auxW = clause.body.find((w) => w !== last && auxOf(w));
        partW = last;
      } else if (clause.body.length >= 3) {
        auxW = last;
        partW = clause.body[clause.body.length - 2];
      }
      if (!auxW || !partW || auxW === partW) continue;
      const aux = auxOf(auxW);
      if (!aux) continue;
      // P2.2（P5）：… ist abgesagt worden＝被動式的完成式（sein＋過去分詞＋worden）。原本只講「sein + werden 的分詞」，不完整
      const before = S.words[partW.k - 1];
      if (partW.lower === 'worden' && aux === 'sein' && before && participleCands(before).length) {
        const main = participleCands(before)[0].lemma;
        out.push({
          what: `${q(auxW.text)} … ${q(`${before.text} worden`)} is the perfect tense of the passive: sein + the past participle of ${main} + worden.`,
          why: 'The passive (werden + past participle) forms its perfect with sein, and werden becomes worden, not geworden: Das Konzert ist abgesagt worden = the concert has been cancelled.',
          pattern: 'subject + sein + … + past participle + worden',
          marks: [{ index: auxW.index, kind: clause.type === 'main' ? 'v2' : 'end-verb' }, { index: before.index, kind: 'end-verb' }, { index: partW.index, kind: 'end-verb' }],
          data: { aux, verb: main, passive: true, auxIndex: auxW.index, participleIndex: before.index },
        });
        continue;
      }
      const lemma = participleUsing(S, partW, aux);
      if (!lemma) continue;
      // P2.3（Charles 判定 1）：hab … geschickt＝省略了 ich 的完成式（WhatsApp 常見）。照講，但註明
      let note = '';
      if (clause.type === 'main' && clause.body[0] === auxW && !hasMatchingSubject(S, clause, auxW)) {
        const firstSg = finiteCands(auxW).some((c) => c.tags.includes('first-person') && c.tags.includes('singular'));
        note = firstSg ? ' (subject ich left out, common in chat)' : ' (subject left out, common in chat)';
      }
      out.push({
        what: `${q(auxW.text)} + ${q(partW.text)} is the perfect tense: ${aux} + the past participle of ${lemma} at the end.${note}`,
        why: WHY,
        pattern: 'subject + haben/sein + … + past participle',
        marks: [{ index: auxW.index, kind: clause.type === 'main' ? 'v2' : 'end-verb' }, { index: partW.index, kind: 'end-verb' }],
        data: { aux, verb: lemma, auxIndex: auxW.index, participleIndex: partW.index },
      });
    }
    return out;
  },
  examples: {
    positive: [{ text: 'Wir sind nach Berlin gefahren.' }, { text: 'Ich habe das Buch gelesen.' }, { text: 'Das Konzert ist abgesagt worden.' }],
    negative: [{ text: 'Ich habe ein Auto.' }, { text: 'Die Bank ist geschlossen.' }],
  },
};
