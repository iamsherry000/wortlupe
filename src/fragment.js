// P2.3（S11）：從網址片段接收文字，給 iOS 捷徑用：打開 …/#t=<URL 編碼的文字> ＝貼上後按 Read。
// 用片段（#）而不用查詢字串（?）：瀏覽器發 HTTP 請求時不會帶 # 後面的東西，所以文字不會送到伺服器，
// 也不會出現在伺服器紀錄裡，全程不離開手機（加上 service worker 離線回應，連頁面本身都不用連網）。
// 純函式、不碰 DOM，Vitest 直接測。

const PREFIX = /^#?t=/;
export const FRAGMENT_ERROR = 'The text in this link could not be read (it is not properly URL-encoded). Paste the message into the box below instead.';

// 回傳 { kind: 'none' }（沒有文字：照常顯示輸入頁）｜{ kind: 'text', text }｜{ kind: 'error', message }
export function parseFragment(hash) {
  const h = String(hash ?? '');
  if (!PREFIX.test(h)) return { kind: 'none' };
  const raw = h.replace(PREFIX, '');
  let text;
  try {
    // 捷徑的 URL 編碼有兩種空白：%20 或 +。真正的加號會編成 %2B，所以 + 一律當空白
    text = decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch {
    return { kind: 'error', message: FRAGMENT_ERROR };
  }
  // 分解形的變音字母（u + ¨）轉成組合形，跟貼上的文字一樣查得到字典
  text = text.normalize('NFC');
  if (!text.trim()) return { kind: 'none' };
  return { kind: 'text', text };
}

export const hasFragmentText = (hash) => PREFIX.test(String(hash ?? ''));
