// P2.1 加修：按鈕「看得見」與「點得到」。只用程式點按鈕不算驗過（Read 按鈕白底白字就是這樣漏掉的）。
//   - 對比度：主要按鈕的文字色 vs 實際背景色 ≥ 4.5:1（WCAG AA），淺色、深色都量
//   - 觸控範圍：可點元素的點擊區 ≥ 44×44 px（視覺大小可以不變，用 padding／偽元素加大）
import { test, expect } from '@playwright/test';
import { openApp, readText, tap } from './helpers.js';

// 在頁面裡算：文字色、往上找第一個不透明的背景色、WCAG 相對亮度與對比度
async function contrastOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
    let bgEl = el, bg = parse(getComputedStyle(el).backgroundColor);
    while (bg.a === 0 && bgEl.parentElement) { bgEl = bgEl.parentElement; bg = parse(getComputedStyle(bgEl).backgroundColor); }
    if (bg.a === 0) bg = { r: 255, g: 255, b: 255, a: 1 };
    const fg = parse(getComputedStyle(el).color);
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return { ratio: (l1 + 0.05) / (l2 + 0.05), fg: getComputedStyle(el).color, bg: getComputedStyle(bgEl).backgroundColor };
  }, selector);
}

// 從元素中心往上下左右各 21 px 取點，elementFromPoint 必須落在這個元素（含偽元素）上＝點擊區至少 42＋中心，約 44×44
async function hitArea(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const pts = [[cx, cy], [cx - 21, cy], [cx + 21, cy], [cx, cy - 21], [cx, cy + 21]];
    const miss = pts.filter(([x, y]) => { const hit = document.elementFromPoint(x, y); return !(hit && (hit === el || el.contains(hit))); });
    return { w: Math.round(r.width), h: Math.round(r.height), miss: miss.map(([x, y]) => `${Math.round(x - cx)},${Math.round(y - cy)}`) };
  }, selector);
}

for (const scheme of ['light', 'dark']) {
  test(`A11Y 對比度 ≥ 4.5:1（${scheme}）：Paste、Read、New text、Grammar、◀ ▶ ✕`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    const bad = [];
    const check = async (sel) => {
      const c = await contrastOf(page, sel);
      if (!c) return bad.push(`${sel} 找不到`);
      if (c.ratio < 4.5) bad.push(`${sel} ${c.ratio.toFixed(2)}:1（字 ${c.fg} / 底 ${c.bg}）`);
    };
    // 輸入頁
    for (const sel of ['#paste', '#read']) await check(sel);
    // 閱讀頁＋字卡
    await readText(page, 'Ich bleibe zu Hause, weil ich krank bin.');
    await tap(page, 'bleibe');
    for (const sel of ['#edit', '#paste', '#text .g-btn', '#prev', '#next', '#close']) await check(sel);
    expect(bad).toEqual([]);
  });
}

test('A11Y 觸控範圍 ≥ 44×44：Grammar、◀ ▶ ✕、Paste、New text、Read', async ({ page }) => {
  await openApp(page);
  const bad = [];
  const check = async (sel) => {
    const a = await hitArea(page, sel);
    if (a.miss.length) bad.push(`${sel}（視覺 ${a.w}×${a.h}）點不到的位置：${a.miss.join(' ')}`);
  };
  for (const sel of ['#paste', '#read']) await check(sel);
  await readText(page, 'Ich bleibe zu Hause, weil ich krank bin.\n\nMorgen rufe ich dich an.');
  for (const sel of ['#edit', '#text .g-btn']) await check(sel);
  await tap(page, 'bleibe');
  for (const sel of ['#prev', '#next', '#close']) await check(sel);
  expect(bad).toEqual([]);
});
