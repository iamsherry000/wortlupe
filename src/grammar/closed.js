// P2.2：封閉詞類表（data/closed-class.json）的查法。字卡與文法規則共用。
// 大小寫：
//   小寫字 → 表上同一個 key
//   句中大寫 → 只查大寫的 key（Sie、Ihnen、Ihr…＝敬稱）；沒有就不是封閉詞類（Morgen 在句中是名詞）
//   句首大寫 → 小寫 key 的讀法＋大寫 key 的讀法（Sie 在句首可能是 sie 也可能是 Sie）
export function closedList(closed, text, sentenceInitial) {
  if (!closed || !closed.forms) return null;
  const f = closed.forms;
  const has = (k) => Object.prototype.hasOwnProperty.call(f, k);
  const lower = text.toLowerCase();
  if (!/^\p{Lu}/u.test(text)) return has(text) ? f[text] : null;
  if (sentenceInitial) {
    const list = [...(has(lower) ? f[lower] : []), ...(text !== lower && has(text) ? f[text] : [])];
    return list.length ? list : null;
  }
  return has(text) ? f[text] : null;
}
