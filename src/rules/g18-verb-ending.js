// G18 動詞現在式人稱詞尾：ich -e / du -st / er -t / wir -en / ihr -t / sie -en，含 du／er 的母音變化（fahren → fährt）。
// 只在「字幹（或換母音後的字幹）＋標準詞尾」剛好拼出這個字時才講；bin、ist、kann 這種不規則形不講。
import { q } from '../grammar/german.js';
import { verbCands, verbPlausible, clauseOf, lastWord, firstFinite, isSubjectPronoun } from '../grammar/sentence.js';

const PERSON = [
  ['first-person', 'singular', 'ich'], ['second-person', 'singular', 'du'], ['third-person', 'singular', 'er/sie/es'],
  ['first-person', 'plural', 'wir'], ['second-person', 'plural', 'ihr'], ['third-person', 'plural', 'sie/Sie'],
];
const CHANGES = [['a', 'ä'], ['au', 'äu'], ['o', 'ö'], ['e', 'ie'], ['e', 'i']];

function stemOf(lemma) {
  if (lemma.endsWith('en')) return lemma.slice(0, -2);
  if (/(el|er)n$/.test(lemma)) return lemma.slice(0, -1);
  return null;
}
// 這個人稱允許哪些詞尾（含字幹以 -t/-d 結尾加 e、以 s/ß/z/x 結尾時 du 只加 -t）
function endingsFor(who, stem, lemma) {
  // P2.4（根因）：「子音＋m/n」要加 e（atmest、öffnest），但雙寫的 mm／nn 不算（kommst、nennst）。
  // 原本 [^lrh][mn] 把 komm 的第一個 m 當成「子音」→ 要 kommest → 對不上 → 掉進不規則分支，把 -st 的 s 算進詞幹（komms-）
  const extraE = /[td]$|[^lrhmn][mn]$/.test(stem);
  const sibilant = /[sßzx]$/.test(stem);
  switch (who) {
    case 'ich': return ['e'];
    case 'du': return sibilant ? ['t'] : extraE ? ['est'] : ['st'];
    case 'er/sie/es': case 'ihr': return extraE ? ['et'] : ['t'];
    // 原形是 -eln / -ern（sammeln、wandern）才只加 -n；spielen 的字幹 spiel 雖然以 el 結尾，原形是 -en
    default: return /[^e](el|er)n$/.test(lemma) && !lemma.endsWith('en') ? ['n'] : ['en'];
  }
}
function vowelVariants(stem, who) {
  const out = [[stem, null]];
  if (who !== 'du' && who !== 'er/sie/es') return out;
  for (const [a, b] of CHANGES) {
    const i = stem.lastIndexOf(a);
    if (i >= 0) out.push([stem.slice(0, i) + b + stem.slice(i + a.length), `${a}→${b}`]);
  }
  return out;
}

// P2.2（P6）：不規則動詞的字幹變了、詞尾仍照規則（du weißt = weiß + t、er nimmt = nimm + t）→ 講完整；
// 連詞尾都不規則的（bin、ist、kann）不講。sein 是整個換字（bin/ist/sind），不套。
const IRR_ENDINGS = { ich: ['e'], du: ['st', 'est', 't'], 'er/sie/es': ['t', 'et'], ihr: ['t', 'et'], wir: ['en'], 'sie/Sie': ['en'] };
function irregular(S, w, cands, agrees) {
  for (const c of cands) {
    if (c.lemma === 'sein') return [];
    const entry = (S.dict.lexicon[c.lemma] || []).find((e) => e.pos === 'verb');
    if (!entry || !entry.verb || entry.verb.irregular !== true) return [];
    const p = PERSON.find(([a, b]) => c.tags.includes(a) && c.tags.includes(b));
    if (!p || !agrees(p[2])) continue;
    const who = p[2];
    // P2.4：du 的 -st／-t 要先判斷 s 屬於誰：原形的字幹以 s/ß/z/x 結尾（müssen、essen、lesen）→ s 是詞幹的，
    // 詞尾只有 -t（muss + t、iss + t、lies + t）；否則是 -st（ha + st、kann + st）。
    // 去掉 -st 剛好是原形字幹（komm）→ 是規則形，不在這裡講
    const base0 = stemOf(c.lemma);
    if (who === 'du' && base0 && w.lower.endsWith('st') && w.lower.slice(0, -2) === base0.toLowerCase()) return [];
    const order = who === 'du' && base0 && /[sßzx]$/.test(base0) ? ['t', 'st', 'est'] : IRR_ENDINGS[who];
    for (const e of order) {
      if (!w.lower.endsWith(e)) continue;
      const stem = w.text.slice(0, w.text.length - e.length);
      if (stem.length < 2) continue;
      if (who === 'du' && e === 't' && !/[sßzx]$/.test(stem)) continue;
      const base = stemOf(c.lemma);
      if (base && stem.toLowerCase() === base.toLowerCase()) continue; // 字幹沒變就不是這種情況
      const sib = who === 'du' && e === 't' ? ` Only -t, not -st, because the stem ends in -${stem.slice(-1)}.` : '';
      return [{
        what: `${q(w.text)} is the ${who} form of ${c.lemma}. The stem changes to ${stem}- here, then the regular ending -${e} is added.${sib}`,
        why: 'Present tense endings: ich -e, du -st, er/sie/es -t, wir -en, ihr -t, sie/Sie -en. Some irregular verbs change their stem in the present tense (wissen → du weißt, nehmen → du nimmst), but the endings still follow the pattern.',
        pattern: `${c.lemma}: ${stem} + ${e}`,
        data: { lemma: c.lemma, persons: [who], ending: e, irregularStem: stem },
      }];
    }
  }
  return [];
}

export default {
  id: 'G18',
  level: 'word',
  title: 'Why this verb ending',
  detect(S, w) {
    // 只講「這個子句的變位動詞」：主句是第一個變位動詞、從句是句尾那個（arbeiten 在 muss 後面是原形，不講）
    const clause = clauseOf(S, w);
    if (!clause || !verbPlausible(w)) return [];
    const isTheVerb = clause.type === 'sub' ? lastWord(clause) === w : firstFinite(clause) === w;
    if (!isTheVerb) return [];
    // P2.1（B5 根因）：原本把子句裡所有 ihr 都當主詞；Ihr Kind／ihr Kind 的 ihr 是所有格。只收真的能當主詞的代名詞
    const pron = new Set(clause.body.filter((x) => isSubjectPronoun(S, x)).map((x) => x.lower));
    // 人稱要對得上子句裡看得到的主詞：ich/du/wir/ihr 要有那個代名詞；
    // 第三人稱要有 er/sie/es/man（或 sie/Sie）或一個名詞，而且子句裡沒有 ich/du/wir/ihr
    const nounIn = (num) => clause.body.some((x) => x !== w && x.cands.some((c) => c.pos === 'noun' && c.tags.includes(num)));
    const agrees = (who) => {
      if (['ich', 'du', 'wir', 'ihr'].includes(who)) return pron.has(who);
      if (['ich', 'du', 'wir', 'ihr'].some((p) => pron.has(p))) return false;
      if (who === 'er/sie/es') return ['er', 'sie', 'es', 'man'].some((p) => pron.has(p)) || nounIn('singular');
      return pron.has('sie') || nounIn('plural');
    };
    // P2.2（P6 根因）：Weißt 被對到罕用動詞 weißen（刷白）的規則詞尾。只用「最常用的那個動詞」講
    const present = verbCands(w).filter((c) => c.tags.includes('present') && !c.tags.some((t) => t.startsWith('subjunctive') || t === 'imperative'));
    if (!present.length) return [];
    const rank = (c) => (c.entry && c.entry.rank) || Infinity;
    const best = present.reduce((a, c) => (rank(c) < rank(a) ? c : a)).lemma;
    const fits = [];
    for (const c of present.filter((x) => x.lemma === best)) {
      const p = PERSON.find(([a, b]) => c.tags.includes(a) && c.tags.includes(b));
      const stem = stemOf(c.lemma);
      if (!p || !stem) continue;
      const who = p[2];
      if (!agrees(who)) continue;
      for (const [st, change] of vowelVariants(stem, who)) {
        const e = endingsFor(who, stem, c.lemma).find((x) => w.lower === (st + x).toLowerCase());
        if (e) { fits.push({ who, ending: e, stem: st, change, lemma: c.lemma }); break; }
      }
    }
    if (!fits.length) return irregular(S, w, present.filter((x) => x.lemma === best), agrees);
    const lemma = fits[0].lemma;
    const same = fits.filter((f) => f.lemma === lemma);
    const whos = [...new Set(same.map((f) => f.who))];
    const f = same[0];
    const change = same.find((x) => x.change);
    let what = `${q(w.text)} = ${f.stem} + -${f.ending}: the ending for ${whos.join(' and ')}.`;
    if (change) what += ` ${lemma} also changes ${change.change} in the du and er/sie/es forms.`;
    let why = 'Present tense endings: ich -e, du -st, er/sie/es -t, wir -en, ihr -t, sie/Sie -en.';
    if (/^e(s)?t$/.test(f.ending)) why += ' If the stem ends in -t or -d, an extra e is added (du arbeitest, er arbeitet).';
    else if (f.who === 'du' && f.ending === 't') why += ' If the stem ends in -s, -ß, -z or -x, du only adds -t (du heißt).';
    if (change) why += ' Some strong verbs change their vowel in the du and er/sie/es forms (fahren → du fährst, sprechen → du sprichst).';
    return [{
      what,
      why,
      pattern: `${lemma}: ${f.stem} + ${f.ending}`,
      data: { lemma, persons: whos, ending: f.ending, vowelChange: change ? change.change : null },
    }];
  },
  examples: {
    positive: [{ text: 'Du fährst morgen.', target: 'fährst' }, { text: 'Ich spiele gern.', target: 'spiele' }, { text: 'Weißt du das?', target: 'Weißt' }],
    negative: [
      { text: 'Ich bin müde.', target: 'bin' }, { text: 'Er kann schwimmen.', target: 'kann' },
      { text: 'Ich muss noch arbeiten.', target: 'arbeiten' }, { text: 'Er hat einen Hund.', target: 'einen' },
      { text: 'Kannst du bitte kommen?', target: 'bitte' },
      { text: 'Ich versuche, die Kinder zu wecken.', target: 'wecken' },
    ],
  },
};
