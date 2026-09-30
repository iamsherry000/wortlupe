// P2.3（Charles 判定 1、2）：WhatsApp 省略主詞的動詞開頭句，句型規則 G09、G10、G01 一律不下判斷。
// 句子是 RD 自己寫的（不是 Tester 句組），全部是省略主詞的真實寫法：沒有問號、句中沒有跟動詞對得上的主詞，
// 或是句首感嘆詞後面接省略主詞的句子。命令式的例外（句尾 ! 或 bitte，而且動詞只能是 du 命令式）另外測。
import { describe, it, expect } from 'vitest';
import { sentenceMatches } from './run-case.js';

export const CHAT_STYLE = [
  'hab keine zeit heute',
  'bin gleich da',
  'komm später vorbei',
  'muss noch arbeiten',
  'hab dich lieb',
  'hab dich lieb!!',
  'freu mich auf dich',
  'freu mich riesig!!',
  'bin schon unterwegs',
  'war echt schön gestern',
  'kann heute leider nicht',
  'geh jetzt schlafen',
  'mach mir gleich was zu essen',
  'hab gerade erst gesehen',
  'weiß noch nicht genau',
  'schaff es heute nicht mehr',
  'melde mich später',
  'muss los',
  'bin total müde',
  'hab hunger',
  'komm gleich runter',
  'schreib dir nachher',
  'ruf dich morgen an',
  'hatte keine zeit',
  'wollte nur kurz fragen, ob alles okay ist',
  'dachte, du kommst heute',
  'fand den film richtig gut',
  'bin mir nicht sicher',
  'hab den bus verpasst',
  'kann dich gerade nicht anrufen',
  'muss noch kurz tanken, soll ich dich abholen?',
  'sorry, bin spät dran',
  'ok bin gleich da',
  'hab dir ne mail geschickt',
  'danke, hat super geklappt',
  'war gestern beim arzt',
  'treff mich heute mit lisa',
  'hab keine ahnung',
  'fahr morgen nach köln',
  'lol hab total vergessen',
  'na, bin schon wieder zu hause',
  'also muss ich morgen früh raus',
];
// 最後一句：also 之後「muss ich」有主詞 ich（倒裝的直述句），同樣不可觸發 G09、G10；G01 看的是 also 後面的第一個字，是動詞開頭 → 不判斷

describe('省略主詞的 WhatsApp 句：G09、G10、G01 都不誤觸發', () => {
  it('句數 ≥ 30', () => expect(CHAT_STYLE.length).toBeGreaterThanOrEqual(30));
  for (const text of CHAT_STYLE) {
    it(`CHAT ${text}`, async () => {
      const { matches } = await sentenceMatches(text);
      const hit = matches.filter((m) => ['G01', 'G09', 'G10'].includes(m.id)).map((m) => `${m.id}: ${m.what}`);
      expect(hit).toEqual([]);
    });
  }
});
