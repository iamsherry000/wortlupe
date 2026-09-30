// P2.7（SPEC §4.6）：送進翻譯模型之前，把 WhatsApp 的省略拼寫還原成完整寫法。
// spike（docs/spike-translation.md）：Freu mich drauf → "Fee looking forward to it"；還原成 Freue mich darauf 就翻對。
// 只還原「拼寫」：慣用語（Bock auf、kein Ding）模型本身不會，這裡不改意思、不猜。
// 還原後的句子會顯示在翻譯下面（Read as …），讓使用者看得到翻的是什麼。

// 只給翻譯用、字卡不用的還原（字卡的口語表是 data/colloquial.json）
const MT_ONLY = { drauf: 'darauf', drüber: 'darüber', dran: 'daran', drin: 'darin', drunter: 'darunter' };

const capitalizeLike = (model, s) => (/^\p{Lu}/u.test(model) ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// 一句話的原文：第一個字到最後一個字，再帶上緊接在後面的標點與 emoji
export function sentenceRange(tokens, s) {
  const words = tokens.filter((t) => t.type === 'word' && t.sentence === s);
  if (!words.length) return null;
  const start = words[0].index;
  let end = words[words.length - 1].index;
  for (let j = end + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.type === 'word' || (t.type === 'space' && t.text.includes('\n'))) break;
    if (t.type === 'space') {
      const n = tokens[j + 1];
      if (!n || n.type === 'word' || n.type === 'space') break;
      continue;
    }
    if (t.type === 'punct' || t.type === 'emoji') end = j;
    else break;
  }
  return { start, end };
}

const nextWord = (tokens, k) => {
  for (let j = k + 1; j < tokens.length; j++) {
    if (tokens[j].type === 'word') return tokens[j];
    if (tokens[j].type !== 'space') return null;
  }
  return null;
};

// 字典只列成命令式的動詞＋後面接 mich（freu mich、meld mich）＝口語省略 e 的 ich 形
function clippedFirstPerson(dict, tok, tokens) {
  const nx = nextWord(tokens, tok.index);
  if (!nx || nx.text.toLowerCase() !== 'mich' || !dict.lookup) return null;
  const cands = dict.lookup(tok.text, { sentenceInitial: tok.sentenceInitial }).candidates;
  const lower = tok.text.toLowerCase();
  const verbs = cands.filter((c) => c.pos === 'verb');
  if (!verbs.length || !verbs.every((c) => c.tags.includes('imperative') && c.tags.includes('singular'))) return null;
  if (!verbs.some((c) => c.lemma.toLowerCase().startsWith(lower))) return null;
  return `${tok.text}e`;
}

/**
 * @returns {{ source: string, text: string, changed: boolean }} source＝原句，text＝送進模型的句子
 */
export function mtText(tokens, s, dict) {
  const r = sentenceRange(tokens, s);
  if (!r) return null;
  let source = '', text = '';
  for (let j = r.start; j <= r.end; j++) {
    const t = tokens[j];
    source += t.text;
    if (t.type !== 'word') { text += t.text; continue; }
    const key = t.text.toLowerCase().replace(/’/g, "'");
    const exp = dict.colloquial && dict.colloquial[key];
    let rep = null;
    if (Array.isArray(exp) && exp.length === 1) rep = capitalizeLike(t.text, exp[0]); // ne＝nein／eine 這種有歧義的不動
    else if (MT_ONLY[key]) rep = capitalizeLike(t.text, MT_ONLY[key]);
    else rep = clippedFirstPerson(dict, t, tokens);
    text += rep || t.text;
  }
  source = source.trim();
  text = text.trim();
  return { source, text, changed: text !== source };
}
