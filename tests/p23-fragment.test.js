// P2.3（S11）：從網址片段接收文字（iOS 捷徑：…/#t=<URL 編碼的文字>）的解碼。
import { describe, it, expect } from 'vitest';
import { parseFragment } from '../src/fragment.js';

describe('S11 網址片段解碼', () => {
  it('S11 %20 是空白', () => expect(parseFragment('#t=Das%20Haus%20ist%20gro%C3%9F.')).toEqual({ kind: 'text', text: 'Das Haus ist groß.' }));
  it('S11 + 也是空白（捷徑的另一種編碼）', () => expect(parseFragment('#t=Das+Haus+ist+gro%C3%9F.')).toEqual({ kind: 'text', text: 'Das Haus ist groß.' }));
  it('S11 %2B 是真的加號', () => expect(parseFragment('#t=1%2B1')).toEqual({ kind: 'text', text: '1+1' }));
  it('S11 換行 %0A 保留', () => expect(parseFragment('#t=Hallo%0AWie%20gehts%3F%0D%0ATsch%C3%BCss')).toEqual({ kind: 'text', text: 'Hallo\nWie gehts?\r\nTschüss' }));
  it('S11 表情符號與變音字母', () => {
    const text = 'Schöne Grüße aus Köln 😊🇩🇪 Äpfel über Öl';
    expect(parseFragment(`#t=${encodeURIComponent(text)}`)).toEqual({ kind: 'text', text });
  });
  it('S11 分解形的變音字母轉成組合形（NFC）', () => {
    expect(parseFragment(`#t=${encodeURIComponent('Grüße')}`).text).toBe('Grüße');
  });
  it('S11 5000 字以上的長訊息', () => {
    const text = 'Ich gehe heute nach Hause, weil ich müde bin. '.repeat(120);
    expect(text.length).toBeGreaterThan(5000);
    expect(parseFragment(`#t=${encodeURIComponent(text)}`)).toEqual({ kind: 'text', text });
  });
  it('S11 文字裡的 & 和 = 不會被當成參數', () => {
    expect(parseFragment(`#t=${encodeURIComponent('a=b & c')}`)).toEqual({ kind: 'text', text: 'a=b & c' });
  });
  it('S11 片段是空的 → 照常顯示輸入頁', () => {
    for (const h of ['', '#', '#t=', '#t=%20%20', null, undefined]) expect(parseFragment(h)).toEqual({ kind: 'none' });
  });
  it('S11 不是 #t= 的片段不理', () => expect(parseFragment('#about')).toEqual({ kind: 'none' }));
  it('S11 解碼失敗 → 可讀的錯誤訊息', () => {
    const r = parseFragment('#t=Das%E0%A4%A');
    expect(r.kind).toBe('error');
    expect(r.message).toMatch(/could not be read/);
  });
});
