// TH 集外迴歸：P6 第一輪 Tester 集外組（p6-holdout.txt，2026-09-30；照 TESTS §0 TH 在 P6.6 驗收後轉進迴歸，P6.7）。
// 判定照 TESTS §12 TK 分界：「切錯卻沒標 Check split」任何一筆＝不通過；標了 Check split 算沒切錯。
// 期望值照 Tester 檔案的 EXPECTED 段逐條寫成資料（RD 沒有改期望值）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDictionary } from '../../src/dict.js';
import { importPreview } from '../../src/wordbook/parse.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const raw = readFileSync(join(HERE, 'p6-holdout.txt'), 'utf8').replace(/\r\n/g, '\n');
// 標記要在行首（檔頭註解裡也寫了「=== INPUT ===」字樣）
const INPUT = raw.slice(raw.indexOf('\n=== INPUT ===\n') + '\n=== INPUT ===\n'.length, raw.indexOf('\n=== EXPECTED ==='));

// [這一筆的第一行（去掉條列符號後）, 期望德文段, 期望 Your note, 選項]
//   cs: 標 Check split 也算對；mustFlag: 一定要標；sug: 拼字建議；key: 存的原形；nf: 查不到＋沒有建議
const E = [
  ['德文單字 9/30 VHS', null, null, { mustFlag: true }],
  ['der Anruf - call 電話', 'der Anruf', 'call 電話'],
  ['zurückrufen = call back', 'zurückrufen', 'call back'],
  ['die Überweisung: bank transfer 轉帳', 'die Überweisung', 'bank transfer 轉帳'],
  ['Steuererklärung 報稅', 'Steuererklärung', '報稅'],
  ['eigentlich actually 其實', 'eigentlich', 'actually 其實'],
  ['Bescheid geben', 'Bescheid geben', 'let someone know'],
  ['Mahnung', 'Mahnung', '催繳通知'],
  ['sich beschweren über\tto complain about', 'sich beschweren über', 'to complain about'],
  ['die Hausordnung | house rules', 'die Hausordnung', 'house rules'],
  ['Nebenkosten – utilities, 水電費', 'Nebenkosten', 'utilities, 水電費'],
  ['Kita', 'Kita', 'daycare'],
  ['der Mieter tenant', 'der Mieter', 'tenant'],
  ['Vermieter 房東!!', 'Vermieter', '房東!!'],
  ['kündigen – to cancel (contract)', 'kündigen', 'to cancel (contract)'],
  ['abholen pick up 接', 'abholen', 'pick up 接'],
  // Tester 期望：「Ausweis ‖ ID card ⏎ 身分證（或 ID card 那筆標 Check split）」→ nextFlagged
  ['Ausweis', 'Ausweis', 'ID card\n身分證', { nextFlagged: 'ID card' }],
  ['die Kaution deposit 押金', 'die Kaution', 'deposit 押金'],
  ['übrigens by the way', 'übrigens', 'by the way'],
  ['Feierabend machen', 'Feierabend machen', 'call it a day'],
  ['Rechnug', 'Rechnug', 'invoice?', { sug: 'Rechnung' }],
  ['Termn appointmnet', 'Termn', 'appointmnet', { cs: true, sug: 'Termin' }],
  ['Kühlschrnak fridge', 'Kühlschrnak', 'fridge', { cs: true, sug: 'Kühlschrank' }],
  ['Wohnungsbesichtigung 看房', 'Wohnungsbesichtigung', '看房'],
  ['Termin vereinbaren make an appointment', 'Termin vereinbaren', 'make an appointment'],
  ['Arm poor', 'Arm', 'poor'],
  ['also so / therefore', 'also', 'so / therefore', { cs: true }],
  ['Handy mobile phone', 'Handy', 'mobile phone', { cs: true }],
  ['Winter winter', 'Winter', 'winter', { cs: true }],
  ['Rock skirt', 'Rock', 'skirt'],
  ['fast almost', 'fast', 'almost'],
  ['bekommen get (NOT become!)', 'bekommen', 'get (NOT become!)'],
  ['E-Mail - email', 'E-Mail', 'email'],
  ['Das ist mir Wurst = I don\'t care 🤷', 'Das ist mir Wurst', 'I don\'t care 🤷'],
  ['Keine Ahnung no idea 不知道', 'Keine Ahnung', 'no idea 不知道'],
  ['Arzt', 'Arzt', null],
  ['Apotheke', 'Apotheke', null],
  ['Rezept', 'Rezept', null],
  ['Milch, Käse, blablub', null, null, { mustFlag: true }],
  ['Schatz', 'Schatz', null],
  ['Liebling', 'Liebling', null],
  ['schwanger pregnant', 'schwanger', 'pregnant'],
  ['die Hebamme midwife 助產士', 'die Hebamme', 'midwife 助產士'],
  ['Umzug', 'Umzug', '搬家'],
  ['ÜBERSTUNDEN overtime', 'ÜBERSTUNDEN', 'overtime', { key: 'Überstunde' }],
  ['die See sea / der See lake', 'die See', 'sea / der See lake', { cs: true }],
  ['Quatschkopfigkeit', 'Quatschkopfigkeit', null, { nf: true }],
  ['gingen went', 'gingen', 'went', { key: 'gehen' }],
  ['Wohnung - apartment', 'Wohnung', 'apartment'],
  ['Miete rent 房租', 'Miete', 'rent 房租'],
  ['Hose trousers', 'Hose', 'trousers'],
  ['sich kümmern um + Akk. take care of', 'sich kümmern um + Akk.', 'take care of', { cs: true }],
  ['Wie geht\'s? how are you', 'Wie geht\'s?', 'how are you'],
  ['der/die Kollege/in colleague', 'der/die Kollege/in', 'colleague', { cs: true }],
  ['nach Hause gehen go home 回家', 'nach Hause gehen', 'go home 回家'],
  ['doch yes (contradicting) 還是', 'doch', 'yes (contradicting) 還是'],
  ['Mama mom', 'Mama', 'mom', { cs: true }],
  ['Pause break', 'Pause', 'break'],
  ['Die Rechnung bitte! the bill please', 'Die Rechnung bitte!', 'the bill please'],
  ['Ich bin fertig I\'m done / exhausted', 'Ich bin fertig', 'I\'m done / exhausted', { cs: true }],
  ['in Ordnung OK', 'in Ordnung', 'OK', { cs: true }],
  ['Stau traffic jam', 'Stau', 'traffic jam'],
  ['super great', 'super', 'great'],
  ['Moment mal wait a sec', 'Moment mal', 'wait a sec'],
  ['leider unfortunately 可惜', 'leider', 'unfortunately 可惜'],
  ['Gute Besserung get well soon', 'Gute Besserung', 'get well soon'],
  ['Termin absagen - cancel appointment', 'Termin absagen', 'cancel appointment'],
  ['Mist', 'Mist', 'damn'],
];

let dict, result;
beforeAll(async () => {
  const fileFetch = async (url) => {
    const body = readFileSync(join(ROOT, url.replace(/^\.?\//, '')), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
  };
  dict = createDictionary({ base: './', fetchImpl: fileFetch });
  await dict.ready();
  result = await importPreview(INPUT, dict);
});

const pair = (e) => (e.note ? `${e.german} ‖ ${e.note}` : e.german);

describe('TH 集外迴歸：P6 第一輪集外組（Tester 2026-09-30，80 行）', () => {
  it('TH-P6 題庫完整', () => {
    expect(E).toHaveLength(68);
    expect(INPUT).toContain('sich beschweren über\tto complain about');
  });
  it('TH-P6 略過 5 行（😂😂、2026、www.dm.de、🙏、---）', () => {
    expect(result.skipped).toBe(5);
  });

  for (const [line, german, note, opt = {}] of E) {
    it(`TH-P6 ${line.replace('\t', '⇥')}`, () => {
      const e = result.entries.find((x) => x.line === line);
      if (!e) {
        // 這一行被併成上一筆的解釋：那一筆一定要標 Check split，否則就是「切錯沒標」
        const owner = result.entries.find((x) => (x.note || '').split('\n').includes(line));
        expect(owner, `${line} 不見了`).toBeTruthy();
        expect(owner.flags.checkSplit, `${line} 被併進「${owner.german}」卻沒標`).toBe(true);
        return;
      }
      if (opt.mustFlag) { expect(e.flags.checkSplit).toBe(true); return; }
      const right = e.german === german && (e.note ?? null) === note;
      // 切錯卻沒標＝不通過（標了算沒切錯）
      const next = opt.nextFlagged && result.entries.find((x) => x.line === opt.nextFlagged);
      if (!right && next) expect(next.flags.checkSplit, `「${opt.nextFlagged}」自成一筆卻沒標`).toBe(true);
      else if (!right) expect(e.flags.checkSplit, `切錯沒標：${pair(e)}（期望 ${german} ‖ ${note ?? ''}）`).toBe(true);
      if (right && opt.sug) expect(e.flags.suggestion).toBe(opt.sug);
      if (opt.key) expect(e.key).toBe(opt.key);
      if (opt.nf) {
        expect(e.status).toBe('notfound');
        expect(e.dict).toBe(null);
        expect(e.flags.suggestion).toBe(null);
      }
    });
  }

  it('TH-P6 沒有對不上期望的多餘一筆沒標（例如 daycare 自成一筆）', () => {
    const known = new Set(E.map(([line]) => line));
    const extra = result.entries.filter((x) => !known.has(x.line));
    for (const x of extra) expect(x.flags.checkSplit, `多出來的一筆沒標：${pair(x)}`).toBe(true);
  });
  it('TH-P6 分界正確率 ≥ 95%（Check split 算沒切錯）', () => {
    let ok = 0;
    for (const [line, german, note] of E) {
      const e = result.entries.find((x) => x.line === line);
      if (!e || e.flags.checkSplit || (e.german === german && (e.note ?? null) === note)) ok++;
    }
    expect(ok / E.length).toBeGreaterThanOrEqual(0.95);
  });
});
