// 斷詞：把整則訊息切成 token，原文一字不漏（全部 token 的 text 串起來 = 原文，含換行）。
// type：word（可點）｜abbr（縮寫 St. z.B.）｜url｜number｜emoji｜space｜punct｜other（都不可點）
// word 另有 sentenceInitial（句首）與 sentence（第幾句），句首判斷給查詢的大小寫規則用。

const RE = new RegExp([
  // P2.2（M-e）：常見縮寫連同句點（St. Nr. ca. Dr. usw. bzw. z.B. e.V. …）＝一個 abbr token，不可點、不是句尾。
  // 只收沒有歧義的；會跟一般字撞的（星期、S.）只在後面接的東西排除句尾時才收（見下）
  String.raw`(?<abbr>(?<![\p{L}\d])(?:z\.\s?B|e\.\s?V|d\.\s?h|u\.\s?a|o\.\s?Ä|u\.\s?U|z\.\s?T|St|Nr|ca|Dr|usw|bzw|etc|evtl|ggf|inkl|Str|Tel|Hr|Prof|Mio|Mrd|vgl|bspw|zzgl|Abs|Jh|Jhd`
    // P2.3（M-4）：街名縮寫（Hauptstr.、Bahnhofstr.）
    + String.raw`|\p{L}+str`
    // P2.3（M-4）：星期縮寫 Mo.–So. 會跟句尾的字撞（Mach es so.），所以只收大寫、而且後面緊接小寫字、數字、連字號或逗號的
    + String.raw`|(?:Mo|Di|Mi|Do|Fr|Sa|So)(?=\.\s*[\p{Ll}\d–,-])`
    // P2.3（M-4）：頁碼 S. 5 只在後面接數字時算縮寫
    + String.raw`|S(?=\.\s*\d)`
    + String.raw`)\.(?!\p{L}))`,
  // 網址與 email：句尾的標點不算進網址
  String.raw`(?<url>(?:https?:\/\/|www\.)[^\s<>"'“”]*[^\s<>"'“”.,;:!?)\]]|[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)+)`,
  // 沒有 http 的網域（x.de、dw.com/de）：字母＋點＋常見頂級網域
  String.raw`(?<domain>\b[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.(?:de|com|org|net|at|ch|eu|io|info|tw)(?:\/[^\s<>"'“”]*[^\s<>"'“”.,;:!?)\]])?(?![\p{L}\d]))`,
  // 字：字母開頭，中間可有連字號、撇號（E-Mail、geht's），結尾撇號另外處理
  String.raw`(?<word>\p{L}[\p{L}\p{M}]*(?:[-'’]\p{L}[\p{L}\p{M}]*)*)`,
  String.raw`(?<num>\d(?:[\d.,:/]*\d)?)`,
  String.raw`(?<emoji>(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic}|\p{Regional_Indicator})|[\u{1F3FB}-\u{1F3FF}]|\p{Regional_Indicator}|⃣)*)`,
  String.raw`(?<space>\s+)`,
  String.raw`(?<punct>[.!?…]+|[,;:()\[\]"„“”‚‘’'«»–—-])`,
  String.raw`(?<other>[\s\S])`,
].join('|'), 'gu');

const SENTENCE_END = /[.!?…]/;

export function tokenize(input) {
  const text = String(input ?? '');
  const raw = [];
  for (const m of text.matchAll(RE)) {
    const g = m.groups;
    let type = 'other';
    if (g.abbr !== undefined) type = 'abbr';
    else if (g.url !== undefined || g.domain !== undefined) type = 'url';
    else if (g.word !== undefined) type = 'word';
    else if (g.num !== undefined) type = 'number';
    else if (g.emoji !== undefined) type = 'emoji';
    else if (g.space !== undefined) type = 'space';
    else if (g.punct !== undefined) type = 'punct';
    raw.push({ text: m[0], type, start: m.index });
  }

  // 字與數字黏在一起（B1、3x、MP3）：整塊不可點，免得把 "B" 當德文字去查
  const glue = new Set();
  for (let k = 1; k < raw.length; k++) {
    const a = raw[k - 1].type, b = raw[k].type;
    if ((a === 'word' && b === 'number') || (a === 'number' && b === 'word')) { glue.add(k - 1); glue.add(k); }
  }
  for (const k of glue) raw[k].type = 'other';
  // 結尾撇號（hab'）：前面是字、後面不是字母 → 併進字裡
  for (let k = 0; k < raw.length - 1; k++) {
    const t = raw[k], n = raw[k + 1];
    if (t.type === 'word' && n.type === 'punct' && /^['’]$/.test(n.text)) {
      t.text += n.text;
      raw.splice(k + 1, 1);
    }
  }

  let sentence = 0;
  let atStart = true;
  const nextNonSpace = (k) => { let j = k + 1; while (raw[j] && raw[j].type === 'space' && !raw[j].text.includes('\n')) j++; return raw[j]; };
  raw.forEach((t, index) => {
    t.index = index;
    t.end = t.start + t.text.length;
    // P2.2（M-e）：序數日期（bis zum 15. Oktober）：數字＋句點＋後面還接字 → 不是句尾
    const ordinal = t.type === 'punct' && t.text === '.' && raw[index - 1] && raw[index - 1].type === 'number'
      && nextNonSpace(index) && ['word', 'abbr'].includes(nextNonSpace(index).type); // 19. Jh.
    if (ordinal) return;
    if (t.type === 'word') {
      t.sentenceInitial = atStart;
      t.sentence = sentence;
      atStart = false;
    } else if ((t.type === 'punct' && SENTENCE_END.test(t.text)) || (t.type === 'space' && t.text.includes('\n'))) {
      if (!atStart) sentence++;
      atStart = true;
    }
  });
  return raw;
}
