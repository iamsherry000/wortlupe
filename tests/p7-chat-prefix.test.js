// 2026-10-01 Sherry：從 WhatsApp 一次拷貝好幾則訊息時，每行前面的「[日期, 時間] 名字:」要自動拿掉
import { describe, it, expect } from 'vitest';
import { stripChatPrefixes } from '../src/chat-prefix.js';

describe('stripChatPrefixes：WhatsApp 拷貝多則訊息的前綴', () => {
  it('iPhone 德國地區：[01.10.26, 14:03:12] 名字: 內容', () => {
    const t = '[01.10.26, 14:03:12] Melis: Wie geht’s?\n[01.10.26, 14:03:30] Melis: Kommst du morgen?';
    expect(stripChatPrefixes(t)).toBe('Wie geht’s?\nKommst du morgen?');
  });

  it('iPhone 英文地區：12 小時制、AM/PM 前是窄空白、行首有隱形方向字元', () => {
    const t = '‎[10/1/26, 2:03:12 PM] Sherry Chen: Ich bin müde.\n[10/1/26, 2:04:01 PM] Melis: Ich auch!';
    expect(stripChatPrefixes(t)).toBe('Ich bin müde.\nIch auch!');
  });

  it('Android 拷貝：[14:03, 1.10.2026] 名字: 內容', () => {
    expect(stripChatPrefixes('[14:03, 1.10.2026] Melis: Bis bald')).toBe('Bis bald');
  });

  it('匯出聊天格式：01.10.26, 14:03 - 名字: 內容', () => {
    expect(stripChatPrefixes('01.10.26, 14:03 - Melis: Bis bald\n1/10/26, 2:03 PM - Sherry: Tschüss')).toBe('Bis bald\nTschüss');
  });

  it('多行訊息：接續的行沒有前綴，原樣保留', () => {
    const t = '[01.10.26, 14:03:12] Melis: Erste Zeile\nzweite Zeile\n[01.10.26, 14:05:00] Sherry: Okay';
    expect(stripChatPrefixes(t)).toBe('Erste Zeile\nzweite Zeile\nOkay');
  });

  it('一般德文不動：句中的時間、冒號、方括號都不是前綴', () => {
    for (const t of ['Der Zug fährt um 14:03 ab.', 'Hinweis: bitte pünktlich sein.', '[Anmerkung] Das ist wichtig: wirklich.', 'Am 01.10.26 um 14:03: Treffen']) {
      expect(stripChatPrefixes(t)).toBe(t);
    }
  });

  it('只有前綴、沒有內容的行變成空行，不留下名字', () => {
    expect(stripChatPrefixes('[01.10.26, 14:03:12] Melis: \nHallo')).toBe('\nHallo');
  });
});
