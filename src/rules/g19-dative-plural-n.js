// G19 名詞複數第三格加 -n：這個形是字典裡的第三格複數，而且剛好是「複數形＋n」。
// 複數本來就以 -n 結尾（Frauen）或以 -s 結尾（Autos）不會多加，不講。
import { q } from '../grammar/german.js';
import { nounIsClear } from '../grammar/sentence.js';

export default {
  id: 'G19',
  level: 'word',
  title: 'Why the extra -n: dative plural',
  detect(S, w) {
    if (!nounIsClear(w)) return []; // 句首大寫又有別的讀法（Wegen）→ 不當名詞講
    for (const c of w.cands) {
      if (c.pos !== 'noun' || !c.tags.includes('dative') || !c.tags.includes('plural') || !c.entry || !c.entry.plural) continue;
      const base = c.entry.plural.find((p) => w.text === `${p}n` && !/[ns]$/.test(p));
      if (!base) continue;
      return [{
        what: `${q(w.text)} = ${base} + n. It is dative plural, so the noun adds -n.`,
        why: 'In the dative plural, the noun itself adds -n, unless the plural already ends in -n or -s (den Frauen, den Autos).',
        pattern: 'den + plural + n (mit den Kindern)',
        data: { plural: base, lemma: c.lemma },
      }];
    }
    return [];
  },
  examples: {
    positive: [{ text: 'mit den Kindern', target: 'Kindern' }, { text: 'Den Männern gefällt es nicht.', target: 'Männern' }],
    negative: [{ text: 'mit den Frauen', target: 'Frauen' }, { text: 'mit den Autos', target: 'Autos' }],
  },
};
