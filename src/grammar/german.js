// 德文文法的固定資料（手寫，只收標準文法書沒有爭議的表格）。規則模組共用。

// 從屬連接詞：後面的子句動詞放句尾（SPEC §4.2 G02 指定的九個）
export const SUBORDINATORS = new Set(['weil', 'dass', 'wenn', 'ob', 'als', 'obwohl', 'damit', 'bevor', 'nachdem']);
// 對等連接詞：不佔位置、動詞不後移
export const COORDINATORS = new Set(['und', 'oder', 'aber', 'denn', 'sondern']);
export const W_WORDS = new Set(['was', 'wer', 'wen', 'wem', 'wessen', 'wo', 'wohin', 'woher', 'wann', 'warum', 'wieso', 'weshalb', 'wie', 'welche', 'welcher', 'welches', 'welchen', 'welchem']);
export const SUBJECT_PRONOUNS = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man']);
// 主詞代名詞要求的動詞人稱（sie 可以是單數或複數，只要求第三人稱）
export const PRON_PERSON = {
  ich: ['first-person', 'singular'], du: ['second-person', 'singular'], er: ['third-person', 'singular'], es: ['third-person', 'singular'],
  man: ['third-person', 'singular'], wir: ['first-person', 'plural'], ihr: ['second-person', 'plural'], Sie: ['third-person', 'plural'],
  sie: ['third-person'],
};
// P2.3（Charles 判定 2）：句首感嘆詞在 Vorfeld 之外，不佔動詞第二位的第一位（Sorry, ich bin … ／ sorry war krank）
export const LEAD_INTERJECTIONS = new Set(['sorry', 'ok', 'okay', 'ja', 'nein', 'na', 'also', 'hey', 'hallo', 'ach', 'lol']);
// P2.3（Charles 判定 1，收窄後）：句中的 mich／mir 是省略 ich 的強烈訊號（freu mich = ich freue mich）。
// dich 不算：接在沒有詞尾的字幹後面（freu dich、beeil dich）不可能是 du 的直述句（du freust dich），是命令式
export const ELIDED_SUBJECT_SIGNALS = new Set(['mich', 'mir']);
// 後面接名詞的限定詞（小寫名詞的語境證據）。der/die/das 也是代名詞（das essen wir）、ihr/sein 也是代名詞／動詞，不收
export const DET_BEFORE_NOUN = /^(ein(e[rsnm]?)?|kein(e[rsnm]?)?|mein(e[rsnm]?)?|dein(e[rsnm]?)?|unser(e[rsnm]?)?|eure[rsnm]?|seine[rsnm]?|ihre[rsnm]?|dies(e[rsnm]?)?|jede[rsnm]?|welche[rsnm]?|n|nen|nem|ner)$/;
export const MODAL_LEMMAS = new Set(['können', 'müssen', 'dürfen', 'sollen', 'wollen', 'mögen']);
export const NEGATION_KEIN = new Set(['kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines']);

// 介系詞＋冠詞縮寫（G08）
export const CONTRACTIONS = {
  im: ['in', 'dem'], am: ['an', 'dem'], zum: ['zu', 'dem'], zur: ['zu', 'der'],
  ins: ['in', 'das'], beim: ['bei', 'dem'], vom: ['von', 'dem'],
  // P2.2（可延後項）：口語與書面都常見的 +das 縮寫
  ans: ['an', 'das'], aufs: ['auf', 'das'], fürs: ['für', 'das'], ums: ['um', 'das'], durchs: ['durch', 'das'],
};

// 冠詞變格表：形 → [性別, 格]（pl = 複數）。定冠詞與不定冠詞（kein 同 ein，另計）
const DEF = {
  der: [['m', 'nom'], ['f', 'dat'], ['f', 'gen'], ['pl', 'gen']],
  die: [['f', 'nom'], ['f', 'acc'], ['pl', 'nom'], ['pl', 'acc']],
  das: [['n', 'nom'], ['n', 'acc']],
  den: [['m', 'acc'], ['pl', 'dat']],
  dem: [['m', 'dat'], ['n', 'dat']],
  des: [['m', 'gen'], ['n', 'gen']],
};
const INDEF = {
  ein: [['m', 'nom'], ['n', 'nom'], ['n', 'acc']],
  eine: [['f', 'nom'], ['f', 'acc']],
  einen: [['m', 'acc']],
  einem: [['m', 'dat'], ['n', 'dat']],
  einer: [['f', 'dat'], ['f', 'gen']],
  eines: [['m', 'gen'], ['n', 'gen']],
};
export function articleForms(lower) {
  if (DEF[lower]) return { kind: 'definite', rows: DEF[lower] };
  if (INDEF[lower]) return { kind: 'indefinite', rows: INDEF[lower] };
  return null;
}
export const DER_WORDS = /^(der|die|das|den|dem|des|dies(e[rsnm]?)?|jede[rsnm]?|jene[rsnm]?|welche[rsnm]?)$/;
export const EIN_WORDS = /^(ein(e[rsnm]?)?|kein(e[rsnm]?)?|mein(e[rsnm]?)?|dein(e[rsnm]?)?|sein(e[rsnm]?)?|ihr(e[rsnm]?)?|unser(e[rsnm]?)?|euer|eure[rsnm]?|Ihr(e[rsnm]?)?)$/;

export const CASE_NAME = { nom: 'nominative', acc: 'accusative', dat: 'dative', gen: 'genitive' };
export const GENDER_NAME = { m: 'masculine', f: 'feminine', n: 'neuter', pl: 'plural' };
export const TAG_CASE = { nominative: 'nom', accusative: 'acc', dative: 'dat', genitive: 'gen' };
export const PREP_CASES = { Dat: ['dat'], Akk: ['acc'], Gen: ['gen'], Wechsel: ['dat', 'acc'] };

// 可分離前綴（G06 額外防線：前綴字必須在這張表，而且字典標明該動詞可分離、前綴相符）
export const SEPARABLE_PARTICLES = new Set([
  'ab', 'an', 'auf', 'aus', 'bei', 'dabei', 'dar', 'durch', 'ein', 'empor', 'entgegen', 'fern', 'fest', 'fort', 'frei',
  'her', 'herab', 'heran', 'herauf', 'heraus', 'herbei', 'herein', 'herüber', 'herum', 'herunter', 'hervor', 'hin',
  'hinab', 'hinauf', 'hinaus', 'hinein', 'hinüber', 'hinunter', 'hoch', 'kennen', 'los', 'mit', 'nach', 'nieder',
  'rein', 'raus', 'rüber', 'statt', 'teil', 'um', 'vor', 'voran', 'voraus', 'vorbei', 'vorüber', 'weg', 'weiter',
  'wieder', 'zu', 'zurecht', 'zurück', 'zusammen', 'über', 'unter', 'heim', 'kaputt', 'klar', 'bereit', 'wach',
]);

// P2.1（M1、M2）：時間名詞。介系詞＋時間名詞講的是「什麼時候」，不是地點；不帶介系詞的受格時間名詞（den ganzen Tag）不是直接受詞
export const TIME_NOUNS = new Set([
  'Jahr', 'Jahrzehnt', 'Jahrhundert', 'Monat', 'Woche', 'Wochenende', 'Tag', 'Nacht', 'Morgen', 'Vormittag', 'Mittag',
  'Nachmittag', 'Abend', 'Stunde', 'Minute', 'Sekunde', 'Moment', 'Augenblick', 'Zeit', 'Zeitpunkt',
  'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag',
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  'Frühling', 'Frühjahr', 'Sommer', 'Herbst', 'Winter', 'Feiertag', 'Silvester', 'Weihnachten', 'Ostern',
]);
export const isTimeNoun = (w) => w.cands.some((c) => c.pos === 'noun' && TIME_NOUNS.has(c.lemma));

// 引號：講解一律用 “ ” 引用句中的字
export const q = (s) => `“${s}”`;
