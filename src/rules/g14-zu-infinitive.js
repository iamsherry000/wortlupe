// G14 zu＋原形動詞。zu 後面緊接小寫的原形動詞才算（zu Anna、zum Bahnhof、zu groß 不算）；
// 可分離動詞把 zu 夾在中間寫成一個字（aufzustehen）也算。
import { q, DER_WORDS, EIN_WORDS } from '../grammar/german.js';
import { isInfinitive, verbCands, clauseOf, hasPos, nounAfter } from '../grammar/sentence.js';

const WHY = 'After many verbs, nouns and adjectives (versuchen, vergessen, Lust haben, es ist schwer) the next verb comes as zu + infinitive at the end. With separable verbs, zu goes between the prefix and the verb: aufzustehen.';
const WHY_UM = 'um … zu + infinitive means “in order to”. zu stands right before the infinitive, which goes to the end.';

export default {
  id: 'G14',
  level: 'sentence',
  title: 'zu + infinitive',
  detect(S) {
    const out = [];
    for (const w of S.words) {
      const clause = clauseOf(S, w);
      const um = clause && clause.body.find((x) => x.lower === 'um' && x.k < w.k);
      if (w.lower === 'zu') {
        const next = S.words[w.k + 1];
        if (!next || next.commaBefore || !/^\p{Ll}/u.test(next.text) || !isInfinitive(next)) continue;
        // P2.2（M-a）：zu meinen Eltern — meinen 也是 meinen（認為）的原形，但後面接名詞，這裡是「介系詞 zu＋限定詞＋名詞」
        if ((DER_WORDS.test(next.lower) || EIN_WORDS.test(next.text) || hasPos(next, 'det') || hasPos(next, 'article')) && nounAfter(S, next)) continue;
        out.push({
          what: um
            ? `${q(`um … zu ${next.text}`)}: um … zu + infinitive = in order to.`
            : `${q(`zu ${next.text}`)}: zu + infinitive at the end of the clause.`,
          why: um ? WHY_UM : WHY,
          pattern: um ? '…, um … zu + infinitive' : '…, zu + infinitive',
          marks: [{ index: w.index, kind: 'focus' }, { index: next.index, kind: 'end-verb' }],
          data: { infinitive: next.index, um: !!um },
        });
      } else {
        const c = verbCands(w).find((x) => x.tags.includes('infinitive-zu'));
        if (!c) continue;
        const e = S.dict.lexicon[c.lemma] && S.dict.lexicon[c.lemma].find((x) => x.pos === 'verb' && x.verb && x.verb.separable);
        const parts = e && e.verb.prefix ? `${e.verb.prefix} + zu + ${c.lemma.slice(e.verb.prefix.length)}` : null;
        out.push({
          what: `${q(w.text)} is zu + infinitive written as one word${parts ? `: ${parts}` : ''}.`,
          why: WHY,
          pattern: 'prefix + zu + verb (aufzustehen, anzurufen)',
          marks: [{ index: w.index, kind: 'end-verb' }],
          data: { infinitive: w.index, um: !!um },
        });
      }
    }
    return out;
  },
  examples: {
    positive: [{ text: 'Ich habe keine Lust, heute zu kochen.' }, { text: 'Ich lerne, um Geld zu verdienen.' }],
    negative: [{ text: 'Ich gehe zu Anna.' }, { text: 'Ich fahre zum Bahnhof.' }, { text: 'Das ist zu groß.' }, { text: 'Wir fahren zu meinen Eltern.' }],
  },
};
