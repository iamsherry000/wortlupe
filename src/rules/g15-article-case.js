// G15 冠詞變格：這個冠詞為什麼是這個形（性別 × 格 × 數）＋ 是誰決定了格。
// 冠詞＋名詞只剩一種可能才斷言；還有兩種以上（die Frau：主格或受格）就全部列出，明說字形決定不了。
import { q, articleForms, CASE_NAME, GENDER_NAME, PREP_CASES, isTimeNoun } from '../grammar/german.js';
import { hasPos, nounAfter, nounCombos, mainVerbOf, relativeAntecedent } from '../grammar/sentence.js';

const GENERAL = 'The article changes with gender, case and number; it is where German shows the case most clearly.';
const REASON = {
  nom: () => 'Nominative is the case of the subject (wer? was?) and of the noun after sein or werden.',
  acc: (v) => `No preposition comes before it, so the accusative usually comes from the verb${v ? ` ${q(v.text)}` : ''}: it is the direct object (wen? was?).`,
  dat: (v) => `No preposition comes before it, so the dative comes from the verb${v ? ` ${q(v.text)}` : ''}: it is the dative object (wem? to or for whom).`,
  gen: () => 'Genitive shows whose (wessen?), like English “of the”.',
};

function describe(opt) {
  const gn = opt.number === 'pl' ? 'plural' : `${GENDER_NAME[opt.gender]} singular`;
  return { gn, cs: CASE_NAME[opt.case] };
}

export default {
  id: 'G15',
  level: 'word',
  title: 'Why this article form',
  detect(S, w) {
    const forms = articleForms(w.lower);
    if (!forms || !(hasPos(w, 'article') || hasPos(w, 'det'))) return [];
    // P2.1（M2 根因）：原本只看字形就當冠詞；逗號後指回前一個名詞的 der/die 是關係代名詞（…, der Kaffee trinkt），不講
    if (relativeAntecedent(S, w)) return [];
    const noun = nounAfter(S, w);
    if (!noun) return [];
    const nc = nounCombos(noun);
    const prev = S.words[w.k - 1];
    const prepKind = prev && !w.commaBefore && hasPos(prev, 'prep') && (S.dict.prepositions || {})[prev.lower];
    const allowed = prepKind ? PREP_CASES[prepKind] : ['nom', 'acc', 'dat', 'gen'];
    const seen = new Set();
    const options = [];
    for (const [g, c] of forms.rows) {
      if (!nc.has(`${g}|${c}`) || !allowed.includes(c)) continue;
      const key = `${g}|${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(g === 'pl' ? { gender: null, case: c, number: 'pl' } : { gender: g, case: c, number: 'sg' });
    }
    if (!options.length) return [];
    const phrase = S.words.slice(w.k, noun.k + 1).map((x) => x.text).join(' ');

    if (options.length === 1) {
      const o = options[0];
      const { gn, cs } = describe(o);
      let reason;
      if (prepKind === 'Wechsel') reason = `The case comes from ${q(prev.text)}, a two-way preposition: dative for a location (wo?), accusative for a direction (wohin?), or fixed by the verb.`;
      else if (prepKind) reason = `The case comes from ${q(prev.text)}: it always takes the ${cs}.`;
      // P2.1（M2）：沒有介系詞的受格時間名詞（den ganzen Tag）是「時間受格」，不是直接受詞
      else if (o.case === 'acc' && isTimeNoun(noun)) reason = 'This is an accusative of time: without a preposition, the accusative can say when or how long (den ganzen Tag, jeden Morgen, nächste Woche).';
      else reason = REASON[o.case](mainVerbOf(S, w));
      return [{
        what: `${q(w.text)} = ${gn.replace(' singular', '')} ${cs}${o.number === 'sg' ? ' singular' : ''}, going with ${q(noun.text)} (${q(phrase)}).`,
        why: `${reason} ${GENERAL}`,
        pattern: `${w.lower} = ${cs} (${gn})`,
        data: { certain: true, options, noun: noun.index },
      }];
    }
    // 兩種以上：列出來，不斷言
    const cases = [...new Set(options.map((o) => CASE_NAME[o.case]))];
    const gns = [...new Set(options.map((o) => describe(o).gn))];
    const list = gns.length === 1
      ? `${cases.join(' or ')} (${gns[0]})`
      : options.map((o) => `${describe(o).cs} ${describe(o).gn}`).join(' / ');
    return [{
      what: `${q(phrase)} can be ${list}. The form alone can't tell which.`,
      why: 'Some article forms are the same in several cases, so the article does not decide. Then meaning and word order decide: usually the subject comes first, but not always.',
      pattern: `${w.lower} + ${gns.join(' / ')} noun = ${cases.join(' or ')}`,
      data: { certain: false, options, noun: noun.index },
    }];
  },
  examples: {
    positive: [{ text: 'Ich gebe dem Mann das Buch.', target: 'dem' }, { text: 'Ich fahre mit dem Bus.', target: 'dem' }],
    negative: [
      { text: 'Ich sehe die.', target: 'die' }, { text: 'Die Frau sieht die Kinder.', target: 'die', allowUncertain: true },
      { text: 'Ich kenne eine Frau, die Kinder hat.', target: 'die' },
    ],
  },
};
