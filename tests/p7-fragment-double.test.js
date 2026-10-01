// 2026-10-01 Sherry 真機截圖：從 WhatsApp 一次轉傳多則長訊息，捷徑把每則內容多編碼一次，
// 解一次後畫面上還是 %20、%C3%A4、%0A。解碼後還像編碼過的就再解（最多兩次），解不開的片段原樣留著。
import { describe, it, expect } from 'vitest';
import { parseFragment } from '../src/fragment.js';

const once = (s) => encodeURIComponent(s);
const twice = (s) => encodeURIComponent(encodeURIComponent(s));

describe('parseFragment：多則轉傳被多編碼一次', () => {
  it('真機樣本：每則內容編碼兩次、訊息之間的換行編碼一次', () => {
    const m1 = 'Hey, ich kann leider heute Mega erkältet und kann nicht mitmachen :(( \nViel Spaß euch!\n';
    const m2 = 'oh, das klingt heftig, ich hoffe du bist ok. gute besserung ✨️✨️🍵🫖\n';
    const r = parseFragment(`#t=${twice(m1)}${once('\n')}${twice(m2)}`);
    expect(r).toEqual({ kind: 'text', text: `${m1}\n${m2}` });
  });

  it('正常只編碼一次的不受影響', () => {
    const t = 'Ich bin 100 % sicher, dass es 20 € kostet.';
    expect(parseFragment(`#t=${once(t)}`)).toEqual({ kind: 'text', text: t });
  });

  it('原文本身寫著 %20 這種字樣（極少見）：只出現一次不當成編碼', () => {
    const t = 'Rabatt: 50%20 Stück';
    expect(parseFragment(`#t=${once(t)}`)).toEqual({ kind: 'text', text: t });
  });

  it('第二層有壞掉的片段：解得開的解、解不開的原樣留著，不整段報錯', () => {
    const good = twice('Viel Spaß euch!');
    const r = parseFragment(`#t=${good}${once(' %F0%9F')}`);
    expect(r.kind).toBe('text');
    expect(r.text.startsWith('Viel Spaß euch!')).toBe(true);
  });
});
