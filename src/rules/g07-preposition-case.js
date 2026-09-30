// G07 介系詞支配的格。只在「介系詞＋冠詞（＋形容詞）＋名詞」而且冠詞的形能對上時才講；
// 雙向介系詞必須能從冠詞＋名詞唯一判斷是 Dativ 還是 Akkusativ 才講方向／位置。沒有冠詞（um Geld）不判斷。
import { q, articleForms, CASE_NAME, PREP_CASES, isTimeNoun } from '../grammar/german.js';
import { hasPos, nounAfter, nounCombos, mainVerbOf, lemmasOf } from '../grammar/sentence.js';

// 明確的移動／放置動詞（＋Akk＝方向）與所在／狀態動詞（＋Dat＝位置）。只收沒有爭議的
const MOTION = new Set(['gehen', 'fahren', 'kommen', 'laufen', 'fliegen', 'rennen', 'reisen', 'legen', 'stellen', 'setzen', 'bringen', 'steigen', 'springen', 'werfen', 'fallen', 'schicken']);
const LOCATION = new Set(['sein', 'wohnen', 'leben', 'liegen', 'stehen', 'sitzen', 'bleiben', 'schlafen']);

const WHY = {
  Dat: 'Some prepositions always take the dative: aus, bei, mit, nach, seit, von, zu (and gegenüber).',
  Akk: 'Some prepositions always take the accusative: durch, für, gegen, ohne, um (and bis).',
  Gen: 'wegen, trotz, während and statt take the genitive in standard German (in everyday speech you will often hear the dative).',
  Wechsel: 'Two-way prepositions (an, auf, hinter, in, neben, über, unter, vor, zwischen) take the accusative for a movement towards a place (wohin?) and the dative for a location (wo?).',
};

export default {
  id: 'G07',
  level: 'sentence',
  title: 'Preposition + case',
  detect(S) {
    const out = [];
    const preps = S.dict.prepositions || {};
    for (const w of S.words) {
      const kind = preps[w.lower];
      if (!kind || !hasPos(w, 'prep')) continue;
      const art = S.words[w.k + 1];
      const forms = art && articleForms(art.lower);
      if (!forms || art.commaBefore) continue;
      const noun = nounAfter(S, art);
      if (!noun) continue;
      const nc = nounCombos(noun);
      const allowed = PREP_CASES[kind];
      const cases = new Set(forms.rows.filter(([g, c]) => nc.has(`${g}|${c}`) && allowed.includes(c)).map(([, c]) => c));
      if (cases.size !== 1) continue;
      const cs = [...cases][0];
      const phrase = S.words.slice(art.k, noun.k + 1).map((x) => x.text).join(' ');
      let what, why = WHY[kind], neutral = false, time = false;
      // P2.1（M1 根因）：原本只看動詞（sein、schlafen → 位置），沒看名詞；時間名詞＋雙向介系詞講的是時間
      if (kind === 'Wechsel' && isTimeNoun(noun)) {
        if (cs !== 'dat') continue; // über das Wochenende 這類時間＋受格，不講
        time = true;
        what = `${q(w.text)} is used for time here, so ${q(phrase)} is dative${w.lower === 'vor' ? ' (vor + dative = ago)' : ''}.`;
        why = 'With time expressions, an, in and vor take the dative: am Montag, in der Nacht, vor einem Jahr (a year ago).';
      } else if (kind === 'Wechsel') {
        // 方向／位置只在動詞明確是「移動／放置」或「所在／狀態」時才講；
        // 其他動詞（warten auf, denken an, Angst vor）是動詞固定搭配，格要跟動詞一起記，不能說成方向
        const mv = mainVerbOf(S, w);
        const lemmas = mv ? lemmasOf(mv, 'verb') : [];
        if (cs === 'acc' && lemmas.some((l) => MOTION.has(l))) {
          what = `${q(w.text)} is a two-way preposition. ${q(phrase)} is accusative here, so it answers wohin? (where to?): a direction.`;
        } else if (cs === 'dat' && lemmas.some((l) => LOCATION.has(l))) {
          what = `${q(w.text)} is a two-way preposition. ${q(phrase)} is dative here, so it answers wo? (where?): a location.`;
        } else {
          what = `${q(w.text)} is a two-way preposition. ${q(phrase)} is ${CASE_NAME[cs]} here.`;
          why = `${WHY.Wechsel} Some verbs fix the preposition and its case (warten auf + accusative); learn those together with the verb.`;
          neutral = true;
        }
      } else {
        what = `${q(w.text)} always takes the ${CASE_NAME[cs]}: ${q(phrase)} is ${CASE_NAME[cs]}.`;
      }
      out.push({
        what,
        why,
        pattern: kind !== 'Wechsel' ? `${w.lower} + ${CASE_NAME[cs]}`
          : time ? `${w.lower} + dative (time: wann?)`
          : neutral ? `${w.lower} + ${CASE_NAME[cs]} (fixed by the verb, learn it with the verb)`
            : `${w.lower} + accusative (wohin?) / ${w.lower} + dative (wo?)`,
        marks: [w, art, noun].map((x) => ({ index: x.index, kind: 'focus' })),
        data: { preposition: w.index, case: cs, kind },
      });
    }
    return out;
  },
  examples: {
    positive: [{ text: 'Ich fahre mit dem Bus.' }, { text: 'Ich gehe in die Stadt.' }, { text: 'Ich bin in der Stadt.' }],
    negative: [{ text: 'Ich lerne, um Geld zu verdienen.' }, { text: 'Ich warte auf dich.' }, { text: 'Er fährt wegen dem Wetter nicht.' }, { text: 'Ich fahre über das Wochenende weg.' }],
  },
};
