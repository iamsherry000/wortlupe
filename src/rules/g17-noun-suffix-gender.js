// G17 名詞詞尾判性別。字典的性別優先：規則只用來「解釋」字典已經給的性別，永遠不拿來猜。
// 字典性別跟詞尾規則不符（der Sprung：-ung 是字根不是詞尾）就不講；-chen 不是指小詞尾的名詞列在例外。
import { q } from '../grammar/german.js';
import { nounIsClear } from '../grammar/sentence.js';

const SUFFIXES = [
  ['ung', 'f'], ['heit', 'f'], ['keit', 'f'], ['schaft', 'f'], ['ion', 'f'], ['tät', 'f'],
  ['chen', 'n'], ['lein', 'n'],
  ['ling', 'm'], ['ismus', 'm'],
];
// 以 -chen / -lein 結尾、字典也是中性，但不是指小詞尾的字
const NOT_SUFFIX = new Set(['Zeichen']);
const ARTICLE = { m: 'der', f: 'die', n: 'das' };
const GENDER = { m: 'masculine', f: 'feminine', n: 'neuter' };

export default {
  id: 'G17',
  level: 'word',
  title: 'Why this gender: the noun ending',
  detect(S, w) {
    if (!nounIsClear(w)) return []; // 句首大寫又有別的讀法（Wegen）→ 不當名詞講
    if (!/^\p{Lu}/u.test(w.text)) return [];
    const nouns = w.cands.filter((c) => c.pos === 'noun' && c.entry && c.entry.gender && c.entry.gender.length === 1);
    const lemmas = [...new Set(nouns.map((c) => c.lemma))];
    if (lemmas.length !== 1) return [];
    const lemma = lemmas[0];
    const gender = nouns[0].entry.gender[0];
    if (NOT_SUFFIX.has(lemma)) return [];
    const hit = SUFFIXES.find(([s]) => lemma.endsWith(s) && lemma.length >= s.length + 3);
    if (!hit || hit[1] !== gender) return []; // 字典說了算
    const [suffix] = hit;
    const extra = suffix === 'chen' || suffix === 'lein' ? ' (-chen and -lein make things small, and the result is always neuter)' : '';
    return [{
      what: `${q(w.text)} (${ARTICLE[gender]} ${lemma}) ends in -${suffix}, and nouns with this ending are always ${GENDER[gender]}${extra}.`,
      why: 'Some endings decide the gender: -ung, -heit, -keit, -schaft, -ion, -tät → die; -chen, -lein → das; -ling, -ismus → der. The dictionary confirms it for this word.',
      pattern: `-${suffix} → ${ARTICLE[gender]} (${ARTICLE[gender]} ${lemma})`,
      data: { suffix, gender },
    }];
  },
  examples: {
    positive: [{ text: 'die Zeitung', target: 'Zeitung' }, { text: 'das Mädchen', target: 'Mädchen' }, { text: 'die Freiheit', target: 'Freiheit' }],
    negative: [{ text: 'der Sprung', target: 'Sprung' }, { text: 'das Zeichen', target: 'Zeichen' }, { text: 'der Kuchen', target: 'Kuchen' }],
  },
};
