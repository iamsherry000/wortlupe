// P2.2：封閉詞類首要讀法表 data/closed-class.json（手寫）。
// 為什麼用產生器：所有格 × 6 個詞尾、冠詞 × 格這種規則性的變化，一個一個手打很容易漏（P2.1 就是 mein 修了、meine 沒修）。
// 這裡把「文法表」寫一次，展開成每一個變化形；內容全部是標準德文文法，不讀 Wiktionary。
// 用法：node build/make-closed-class.mjs
//
// 每一筆讀法：{ lemma, pos, form（這個形是什麼）, gloss（英文）, ctx?（語境規則，符合時排第一）, useDict?（開放詞類讀法直接用字典）, parts?（縮寫） }
// ctx：noun 後接名詞｜verbUse 當動詞用（前面或後面有主詞代名詞、後面不是名詞）｜verb 後接變位動詞｜subj3sg 後接第三人稱單數動詞
//      demonstrative 後面沒有名詞（或形容詞＋名詞）、不是關係代名詞、而且後面還有字或句尾標點
//      subjPl 後接複數動詞｜otherSubject 子句裡已經有別的主詞｜rel 關係代名詞｜afterComma 逗號後｜adjNext 後接形容詞｜infNext 後接不定詞
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const forms = {};
const add = (key, ...readings) => { (forms[key] = forms[key] || []).push(...readings); };
const R = (lemma, pos, form, gloss, extra = {}) => ({ lemma, pos, form, gloss, ...extra });

// ---------- 人稱代名詞（全部格）----------
add('ich', R('ich', 'pron', '1st person · nominative · singular', 'I'));
add('mich', R('ich', 'pron', '1st person · accusative · singular (also reflexive)', 'me; myself'));
add('mir', R('ich', 'pron', '1st person · dative · singular (also reflexive)', 'me, to me, for me; myself'));
add('du', R('du', 'pron', '2nd person · nominative · singular (informal)', 'you (one person, informal)'));
add('dich', R('du', 'pron', '2nd person · accusative · singular (also reflexive)', 'you; yourself'));
add('dir', R('du', 'pron', '2nd person · dative · singular (also reflexive)', 'you, to you, for you; yourself'));
add('er', R('er', 'pron', '3rd person · masculine · nominative · singular', 'he; it (for a masculine noun)'));
add('ihn', R('er', 'pron', '3rd person · masculine · accusative · singular', 'him; it (for a masculine noun)'));
add('ihm', R('er', 'pron', '3rd person · masculine/neuter · dative · singular', 'him, to him; it, to it'));
add('sie',
  R('sie', 'pron', '3rd person · feminine · nominative/accusative · singular', 'she; her; it (for a feminine noun)', { ctx: 'subj3sg' }),
  R('sie', 'pron', '3rd person · nominative/accusative · plural', 'they; them', { ctx: 'subjPl' }));
add('Sie', R('Sie', 'pron', 'polite form of address · nominative/accusative (one or more people)', 'you (polite)', { ctx: 'subjPl' }));
add('es', R('es', 'pron', '3rd person · neuter · nominative/accusative · singular', 'it'));
add('wir', R('wir', 'pron', '1st person · nominative · plural', 'we'));
add('uns', R('wir', 'pron', '1st person · accusative/dative · plural (also reflexive)', 'us, to us; ourselves; each other'));
add('ihr',
  R('ihr', 'pron', '2nd person · nominative · plural (informal)', 'you (more than one person, informal)'),
  R('sie', 'pron', '3rd person · feminine · dative · singular', 'her, to her, for her', { ctx: 'otherSubject' }),
  R('ihr', 'det', 'possessive · masculine nominative singular, or neuter nominative/accusative singular', 'her; their (Ihr: your, polite)', { ctx: 'noun' }));
add('euch', R('ihr', 'pron', '2nd person · accusative/dative · plural (also reflexive)', 'you, to you (more than one person); yourselves'));
add('ihnen', R('sie', 'pron', '3rd person · dative · plural', 'them, to them'));
add('Ihnen', R('Sie', 'pron', 'polite form of address · dative', 'you, to you (polite)'));
add('man', R('man', 'pron', 'indefinite pronoun · nominative', 'one, you, people (in general)'));
add('sich', R('sich', 'pron', 'reflexive pronoun · 3rd person or polite Sie · accusative/dative', 'himself, herself, itself, themselves, yourself (polite); each other'));

// ---------- 變格描述：逐項列出（跟字卡其他地方同一種寫法：feminine · nominative · singular）----------
const GN = { m: 'masculine', f: 'feminine', n: 'neuter' };
const CN = { nom: 'nominative', acc: 'accusative', dat: 'dative', gen: 'genitive' };
const rows = (s) => s.split(' ').map((x) => x.split('.'));
const desc = (spec) => rows(spec).map(([g, c]) => (g === 'pl' ? `plural · ${CN[c]}` : `${GN[g]} · ${CN[c]} · singular`)).join('; ');
// 「ein-類」詞尾（所有格、kein-）與「der-類」詞尾（定冠詞、dieser、welcher）
const EIN_ROWS = { '': 'm.nom n.nom n.acc', e: 'f.nom f.acc pl.nom pl.acc', en: 'm.acc pl.dat', em: 'm.dat n.dat', er: 'f.dat f.gen pl.gen', es: 'm.gen n.gen' };
const DER_ROWS = { er: 'm.nom f.dat f.gen pl.gen', e: 'f.nom f.acc pl.nom pl.acc', es: 'n.nom n.acc m.gen n.gen', en: 'm.acc pl.dat', em: 'm.dat n.dat' };

// ---------- 所有格限定詞（6 個詞尾全部展開）----------
const POSS_END = Object.fromEntries(Object.entries(EIN_ROWS).map(([e, s]) => [e, desc(s)]));
const POSS = [
  ['mein', 'mein', 'my'], ['dein', 'dein', 'your (one person, informal)'], ['sein', 'sein', 'his; its'],
  ['ihr', 'ihr', 'her; their (Ihr: your, polite)'], ['unser', 'unser', 'our'], ['euer', 'eur', 'your (more than one person, informal)'],
];
for (const [lemma, stem, gloss] of POSS) {
  for (const [end, desc] of Object.entries(POSS_END)) {
    const form = end === '' ? lemma : stem + end; // euer → eure, euren …
    const r = R(lemma, 'det', `possessive (${gloss.split(';')[0]}) · ${desc}`, gloss, { ctx: 'noun' });
    if (form === 'ihr') continue; // ihr 已在上面（代名詞＋所有格三種讀法）
    if (form === 'sein') { add('sein', { lemma: 'sein', pos: 'verb', useDict: true }, r); continue; }
    if (form === 'meine' || form === 'meinen') { add(form, r, { lemma: 'meinen', pos: 'verb', useDict: true, ctx: 'verbUse' }); continue; }
    add(form, r);
    // 句中大寫 Ihr-：敬稱「您的」
    if (lemma === 'ihr') add(form[0].toUpperCase() + form.slice(1), R('ihr', 'det', `possessive (your, polite) · ${desc}`, 'your (polite)', { ctx: 'noun' }));
  }
}
add('Ihr', R('ihr', 'det', `possessive (your, polite) · ${POSS_END['']}`, 'your (polite)', { ctx: 'noun' }));

// ---------- 冠詞、關係／指示代名詞、kein- ----------
add('der',
  R('der', 'article', desc('m.nom f.dat f.gen pl.gen'), 'the'),
  R('der', 'pron', 'relative or demonstrative pronoun · masculine · nominative; feminine · dative', 'who, which, that; that one', { ctx: 'rel' }));
add('die',
  R('der', 'article', desc('f.nom f.acc pl.nom pl.acc'), 'the'),
  R('der', 'pron', 'relative or demonstrative pronoun · feminine or plural · nominative/accusative', 'who, which, that; that one, they', { ctx: 'rel' }));
add('das',
  R('der', 'article', desc('n.nom n.acc'), 'the', { ctx: 'noun' }),
  // P2.4：後面沒有名詞（也沒有形容詞＋名詞）就是指示代名詞（findest du das auch komisch?、Ich weiß das.）
  R('das', 'pron', 'demonstrative pronoun · neuter · nominative/accusative', 'that, this', { ctx: 'demonstrative' }),
  R('der', 'pron', 'relative pronoun · neuter · nominative/accusative', 'which, that', { ctx: 'rel' }));
add('den',
  R('der', 'article', desc('m.acc pl.dat'), 'the'),
  R('der', 'pron', 'relative or demonstrative pronoun · masculine · accusative', 'whom, which, that; him, that one', { ctx: 'rel' }));
add('dem',
  R('der', 'article', desc('m.dat n.dat'), 'the'),
  R('der', 'pron', 'relative or demonstrative pronoun · masculine/neuter · dative', '(to) whom, (to) which; him, that one', { ctx: 'rel' }));
add('des', R('der', 'article', desc('m.gen n.gen'), 'the, of the'));
add('dessen', R('der', 'pron', 'relative or demonstrative pronoun · masculine/neuter genitive', 'whose, of which'));
add('deren', R('der', 'pron', 'relative or demonstrative pronoun · feminine or plural genitive', 'whose, of which'));
add('denen', R('der', 'pron', 'relative or demonstrative pronoun · plural dative', '(to) whom, (to) which; them'));
add('ein', R('ein', 'article', desc('m.nom n.nom n.acc'), 'a, an'), R('ein', 'num', 'number', 'one'));
add('eine', R('ein', 'article', desc('f.nom f.acc'), 'a, an'), R('ein', 'num', 'number · feminine', 'one'));
add('einen', R('ein', 'article', desc('m.acc'), 'a, an'), R('ein', 'num', 'number · masculine · accusative', 'one'));
add('einem', R('ein', 'article', desc('m.dat n.dat'), 'a, an'), R('ein', 'num', 'number · dative', 'one'));
add('einer', R('ein', 'article', desc('f.dat f.gen'), 'a, an; of a'), R('einer', 'pron', 'indefinite pronoun · masculine · nominative', 'one (of them), someone', { ctx: 'notNoun' }));
add('eines', R('ein', 'article', desc('m.gen n.gen'), 'of a, of an'), R('einer', 'pron', 'indefinite pronoun · neuter', 'one (of them)', { ctx: 'notNoun' }));
add('eins', R('eins', 'num', 'number (counting)', 'one'));
for (const [end, spec] of Object.entries(EIN_ROWS)) {
  const f = `kein${end}`;
  add(f, R('kein', 'det', `negative article · ${desc(spec)}`, 'no, not a, not any', { ctx: 'noun' }));
  if (f === 'keiner') add(f, R('keiner', 'pron', 'indefinite pronoun (stands alone)', 'nobody, no one; none', { ctx: 'notNoun' }));
  if (f === 'keine' || f === 'keines') add(f, R('keiner', 'pron', 'indefinite pronoun (stands alone)', 'none', { ctx: 'notNoun' }));
}
for (const [end, spec] of Object.entries(DER_ROWS)) {
  add(`dies${end}`, R('dieser', 'det', `demonstrative · ${desc(spec)}`, 'this, these; that'));
  add(`welch${end}`, R('welcher', 'det', `question word · ${desc(spec)}`, 'which'));
}

// ---------- 疑問詞 ----------
add('wo', R('wo', 'adv', 'question word (place)', 'where'), R('wo', 'conj', 'relative or subordinating (… wo …)', 'where, in which'));
add('wer', R('wer', 'pron', 'question word · nominative', 'who'));
add('wen', R('wer', 'pron', 'question word · accusative', 'whom, who'));
add('wem', R('wer', 'pron', 'question word · dative', 'to whom, who'));
add('was', R('was', 'pron', 'question word or relative pronoun', 'what; which'), R('was', 'pron', 'colloquial short form of etwas', 'something'));
add('wann', R('wann', 'adv', 'question word (time)', 'when, at what time'));
add('wie', R('wie', 'adv', 'question word', 'how'), R('wie', 'conj', 'comparison (so … wie)', 'like, as'));
add('warum', R('warum', 'adv', 'question word', 'why'));
add('wieso', R('wieso', 'adv', 'question word', 'why'));
add('woher', R('woher', 'adv', 'question word (place)', 'where from'));
add('wohin', R('wohin', 'adv', 'question word (direction)', 'where to'));

// ---------- 連接詞 ----------
add('und', R('und', 'conj', 'coordinating conjunction', 'and'));
add('aber', R('aber', 'conj', 'coordinating conjunction', 'but'), R('aber', 'particle', 'particle (emphasis)', 'really, and how'));
add('oder', R('oder', 'conj', 'coordinating conjunction', 'or'), R('oder', 'particle', 'tag question (…, oder?)', 'right?, isn’t it?'));
add('denn', R('denn', 'conj', 'coordinating conjunction (word order does not change)', 'because, for'), R('denn', 'particle', 'particle in questions', 'then (softens a question)'));
add('weil', R('weil', 'conj', 'subordinating conjunction (verb goes to the end)', 'because'));
add('dass', R('dass', 'conj', 'subordinating conjunction (verb goes to the end)', 'that'));
add('wenn', R('wenn', 'conj', 'subordinating conjunction (verb goes to the end)', 'if; when, whenever'));
add('ob', R('ob', 'conj', 'subordinating conjunction (verb goes to the end)', 'whether, if'));
add('als', R('als', 'conj', 'subordinating conjunction (one time in the past)', 'when'), R('als', 'conj', 'comparison', 'than'), R('als', 'conj', 'role', 'as'));
add('damit',
  R('damit', 'conj', 'subordinating conjunction (verb goes to the end)', 'so that', { ctx: 'afterComma' }),
  R('damit', 'adv', 'adverb (da + mit)', 'with it, with that; by that', { ctx: 'verb' }));
add('bevor', R('bevor', 'conj', 'subordinating conjunction (verb goes to the end)', 'before'));
add('nachdem', R('nachdem', 'conj', 'subordinating conjunction (verb goes to the end)', 'after'));
add('obwohl', R('obwohl', 'conj', 'subordinating conjunction (verb goes to the end)', 'although'));
add('also', R('also', 'adv', 'adverb', 'so, therefore; well'));

// ---------- 介系詞（格取自 data/prepositions.json）----------
const PREP_CASE = JSON.parse(readFileSync(join(ROOT, 'data/prepositions.json'), 'utf8'));
const CASE_DESC = { Dat: 'preposition · takes the dative', Akk: 'preposition · takes the accusative', Gen: 'preposition · takes the genitive', Wechsel: 'two-way preposition · dative (where?) or accusative (where to?)' };
const PREPS = {
  in: 'in, inside; into (with accusative)', an: 'at, on (touching a side); to (with accusative)', auf: 'on, onto; at (auf der Arbeit); in (auf Deutsch)',
  mit: 'with; by (mit dem Bus)', für: 'for', von: 'from; of; by', aus: 'out of, from', nach: 'to (cities, countries); after; according to',
  bei: 'at (someone’s place); near; during (beim Essen)', vor: 'in front of; before; ago (vor + time)', über: 'over, above; about (a topic)',
  unter: 'under, below; among', um: 'around; at (um 8 Uhr)', durch: 'through', gegen: 'against; around (gegen 8 Uhr)', ohne: 'without',
  bis: 'until, by; up to', seit: 'since; for (time up to now)', wegen: 'because of', hinter: 'behind', neben: 'next to, beside',
  zwischen: 'between', trotz: 'despite', während: 'during', statt: 'instead of', gegenüber: 'opposite, across from', ab: 'from (a time on)',
};
for (const [p, gloss] of Object.entries(PREPS)) {
  const cs = PREP_CASE[p] || (p === 'ab' ? 'Dat' : null);
  add(p, R(p, 'prep', cs ? CASE_DESC[cs] : 'preposition', gloss));
}
add('zu',
  R('zu', 'prep', CASE_DESC.Dat, 'to (a person or place); at (zu Hause)'),
  R('zu', 'adv', 'before an adjective or adverb', 'too (zu laut = too loud)', { ctx: 'adjNext' }),
  R('zu', 'particle', 'before an infinitive', 'to (zu + infinitive)', { ctx: 'infNext' }));
// 同時是可分離前綴的介系詞：第二個讀法
for (const [p, gloss] of [['an', 'on (switched on); part of verbs like anrufen, anfangen'], ['auf', 'open; up; part of verbs like aufstehen, aufmachen'],
  ['aus', 'off, over; out; part of verbs like aussehen, ausgehen'], ['mit', 'along, too; part of verbs like mitkommen, mitbringen'],
  ['ab', 'off, away; part of verbs like abfahren, abholen']]) add(p, R(p, 'adv', 'adverb / separable prefix', gloss));
add('um', R('um', 'conj', 'um … zu + infinitive', 'in order to'));
add('bis', R('bis', 'conj', 'subordinating conjunction', 'until'));
add('seit', R('seit', 'conj', 'subordinating conjunction', 'since'));
add('während', R('während', 'conj', 'subordinating conjunction', 'while'));
add('ohne', R('ohne', 'conj', 'ohne … zu + infinitive', 'without …-ing'));

// ---------- 縮寫（介系詞＋冠詞）----------
const CONTR = { am: ['an', 'dem'], im: ['in', 'dem'], ans: ['an', 'das'], ins: ['in', 'das'], zum: ['zu', 'dem'], zur: ['zu', 'der'],
  beim: ['bei', 'dem'], vom: ['von', 'dem'], aufs: ['auf', 'das'], fürs: ['für', 'das'], ums: ['um', 'das'], durchs: ['durch', 'das'] };
for (const [k, parts] of Object.entries(CONTR)) add(k, R(k, 'contraction', `${parts[0]} + ${parts[1]}`, `short for ${parts[0]} ${parts[1]}`, { parts }));

// ---------- 高頻副詞與語氣詞 ----------
const ADV = {
  noch: 'still; yet (noch nicht = not yet); another (noch ein)', nur: 'only, just', schon: 'already; (particle) surely, really',
  leider: 'unfortunately', eben: 'just, exactly; just now', auch: 'also, too', sehr: 'very; very much',
  gern: 'gladly; with a verb: like to (Ich koche gern = I like cooking)', gerne: 'gladly; with a verb: like to (Ich koche gerne = I like cooking)',
  immer: 'always', oft: 'often', heute: 'today', morgen: 'tomorrow', jetzt: 'now', dann: 'then', hier: 'here', dort: 'there',
  nun: 'now; well', nicht: 'not', so: 'so, like this, this way; (so … wie) as … as', gestern: 'yesterday',
};
for (const [w, gloss] of Object.entries(ADV)) add(w, R(w, 'adv', 'adverb', gloss));
add('da', R('da', 'adv', 'adverb', 'there; here (Ich bin gleich da = I’ll be right there); then'), R('da', 'conj', 'subordinating conjunction (verb goes to the end)', 'since, as'));
add('bitte', R('bitte', 'particle', 'particle', 'please; you’re welcome; pardon?'), { lemma: 'bitten', pos: 'verb', useDict: true, ctx: 'verbUse' });
add('doch', R('doch', 'particle', 'particle', 'yes (answering a negative question); after all; (makes a request stronger)'));
add('mal', R('mal', 'particle', 'particle', 'just (softens a request); once; times (drei mal)'));
add('ja', R('ja', 'particle', 'answer / particle', 'yes; (particle) you know, after all'));
add('halt', R('halt', 'particle', 'particle', 'just (that’s how it is)'), R('halt', 'intj', 'interjection', 'stop!'));
add('selbst', R('selbst', 'particle', 'particle', 'myself, yourself, himself … (for emphasis); even'));

// ---------- P2.2 加修：WhatsApp 常見感嘆詞（字典沒有 ok、hey，或只有英文借字的零散條目）----------
add('hey', R('hey', 'intj', 'interjection (greeting / getting attention)', 'hey'));
add('hi', R('hi', 'intj', 'interjection (greeting)', 'hi'));
add('ok', R('okay', 'intj', 'interjection (short for okay)', 'OK, all right'));
add('okay', R('okay', 'intj', 'interjection', 'OK, all right'));

// P2.4：zuhause（一個字）是副詞「在家」；字典只有名詞 das Zuhause（大寫，句中大寫照常查字典）
add('zuhause', R('zuhause', 'adv', 'adverb (= zu Hause)', 'at home'));

// ---------- 不定代名詞與數量詞 ----------
add('nichts', R('nichts', 'pron', 'indefinite pronoun', 'nothing'));
add('etwas', R('etwas', 'pron', 'indefinite pronoun', 'something'), R('etwas', 'adv', 'adverb', 'a little, somewhat'));
add('alles', R('alles', 'pron', 'indefinite pronoun', 'everything, all'));
add('alle', R('alle', 'det', 'determiner · plural', 'all (of)'), R('alle', 'pron', 'pronoun · plural', 'everyone, all of them', { ctx: 'notNoun' }));
add('viel', R('viel', 'det', 'determiner', 'much, a lot (of)'), R('viel', 'adv', 'adverb', 'much, a lot'));
add('mehr', R('mehr', 'det', 'comparative of viel', 'more'));
add('viele', R('viel', 'det', 'determiner · plural', 'many, a lot of'), R('viel', 'pron', 'pronoun · plural', 'many (people)', { ctx: 'notNoun' }));
add('vielen', R('viel', 'det', 'determiner · plural dative (vielen Dank = many thanks)', 'many'));
add('vieles', R('viel', 'pron', 'pronoun · neuter', 'much, many things'));
add('wenige', R('wenig', 'det', 'determiner · plural', 'few'));
add('wenigen', R('wenig', 'det', 'determiner · plural dative', 'few'));
add('genug', R('genug', 'adv', 'adverb', 'enough'));
add('paar', R('paar', 'det', 'ein paar (always with ein)', 'a few, a couple of'));
add('jemand', R('jemand', 'pron', 'indefinite pronoun', 'somebody, someone'));
add('niemand', R('niemand', 'pron', 'indefinite pronoun', 'nobody, no one'));
for (const [f, desc] of [['andere', 'feminine nominative/accusative, or plural'], ['anderen', 'masculine accusative, dative, genitive, or plural'], ['anderer', 'masculine nominative (no article)'], ['anderes', 'neuter nominative/accusative (no article)']]) {
  add(f, R('anderer', 'det', `determiner · ${desc}`, 'other, different; (die anderen) the others'));
}

// ---------- 數字 ----------
const NUM = { zwei: 'two', drei: 'three', vier: 'four', fünf: 'five', sechs: 'six', sieben: 'seven', acht: 'eight', neun: 'nine', zehn: 'ten', elf: 'eleven', zwölf: 'twelve', zwanzig: 'twenty', hundert: '(a) hundred' };
for (const [w, gloss] of Object.entries(NUM)) add(w, R(w, 'num', 'number', gloss));

const out = {
  _說明: 'P2.2 封閉詞類首要讀法表（由 build/make-closed-class.mjs 從標準文法表展開，不讀 Wiktionary）。字卡一律以這份為準；第一個讀法是預設首要讀法，ctx 符合時該讀法排第一。',
  forms,
};
writeFileSync(join(ROOT, 'data/closed-class.json'), JSON.stringify(out, null, 1));
console.log(`closed-class.json：${Object.keys(forms).length} 個字形、${Object.values(forms).reduce((a, x) => a + x.length, 0)} 個讀法`);
