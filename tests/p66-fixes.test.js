// P6.6（SPEC §5.1 F）：Tester P6 驗收不通過（LifeOS/…/docs/tester/P6-acceptance.md）的失敗輸入，逐條寫成測試。
// 只用報告裡列出的失敗輸入；集外組本身不看（下一輪 Tester 另寫）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDictionary } from '../src/dict.js';
import { importPreview, acceptSuggestion, mergeIntoPrevious, splitAt } from '../src/wordbook/parse.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fileFetch = async (url) => {
  const body = readFileSync(join(ROOT, url.replace(/^\.?\//, '')), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};
let dict;
beforeAll(async () => {
  dict = createDictionary({ base: './', fetchImpl: fileFetch });
  await dict.ready();
});
const pv = (text) => importPreview(text, dict);
const pair = (e) => (e.note ? `${e.german} ‖ ${e.note}` : e.german);

describe('F1 切錯卻沒標（Tester 報告的 5 筆）', () => {
  it('F1 Kita ⏎ daycare → Kita ‖ daycare（daycare 是英文，離線英文詞表認得）', async () => {
    const { entries } = await pv('Kita\ndaycare');
    expect(entries.map(pair)).toEqual(['Kita ‖ daycare']);
  });
  // P6.8b（SPEC §5.1 F 修正）：ID 也查得到德文（das Id）→ ID card 預設當新的一筆、必標（Tester 期望也接受「ID card 那筆標 Check split」）
  it('F1 Ausweis ⏎ ID card ⏎ =身分證 → ID card 那筆標 Check split，一鍵併回 → Ausweis ‖ ID card⏎身分證', async () => {
    let { entries } = await pv('Ausweis\nID card\n=身分證');
    expect(entries.map((e) => e.german)).toEqual(['Ausweis', 'ID']);
    expect(entries[1].flags.checkSplit).toBe(true);
    expect(entries[1].flags.checkReason).toBe('maybeNote');
    entries = await mergeIntoPrevious(entries, 1, dict);
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('ID card\n身分證');
  });
  it('F1 Termn appointmnet → Termn ‖ appointmnet、Check split、Did you mean Termin', async () => {
    const { entries } = await pv('Termn appointmnet');
    expect(entries).toHaveLength(1);
    expect(pair(entries[0])).toBe('Termn ‖ appointmnet');
    expect(entries[0].flags.checkSplit).toBe(true);
    expect(entries[0].flags.suggestion).toBe('Termin');
  });
  it('F1 Kühlschrnak fridge → Kühlschrnak ‖ fridge、Did you mean Kühlschrank', async () => {
    const { entries } = await pv('Kühlschrnak fridge');
    expect(entries).toHaveLength(1);
    expect(pair(entries[0])).toBe('Kühlschrnak ‖ fridge');
    expect(entries[0].flags.suggestion).toBe('Kühlschrank');
  });
  it('F1 Mama mom → Mama ‖ mom 或標 Check split（mom 不可被當成德文片語的一部分又不標）', async () => {
    const { entries } = await pv('Mama mom');
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(pair(e) === 'Mama ‖ mom' || e.flags.checkSplit).toBe(true);
    expect(e.german).not.toBe('Mama mom');
  });
});

describe('F1 不確定就標：沒有「切了但沒把握又沒標」的路徑（§5.1 F）', () => {
  // 沒有分隔符號的行，只要有任何一個字德文查不到也不是英文 → 一律 Check split
  for (const line of ['Party feirn', 'Termn appointmnet', 'Kündigunsfrist', 'Rechnug', 'Blarkenschaft', 'Arzt blorp zzz']) {
    it(`F1 有查不到也不是英文的字就標：${line}`, async () => {
      const { entries } = await pv(line);
      expect(entries.every((e) => e.flags.checkSplit)).toBe(true);
    });
  }
  // 德英同形的字落在分界上 → 一律標（包含詞頻低的 bill）
  for (const line of ['die Rechnung bill 帳單', 'gehen will go', 'bald also soon']) {
    it(`F1 德英同形在分界上就標：${line}`, async () => {
      const { entries } = await pv(line);
      expect(entries[0].flags.checkSplit).toBe(true);
    });
  }
  it('F1 die Rechnung bill 帳單 分界仍照 Golden K（標了也要切對）', async () => {
    const { entries } = await pv('die Rechnung bill 帳單');
    expect(pair(entries[0])).toBe('die Rechnung ‖ bill 帳單');
  });
});

describe('F2 拼字建議只修德文段', () => {
  it('F2 Kühlschrnak fridge 按建議 → Kühlschrank ‖ fridge（fridge 仍是 note，不會變成 Bridge）', async () => {
    let { entries } = await pv('Kühlschrnak fridge');
    entries = await acceptSuggestion(entries, 0, dict);
    expect(pair(entries[0])).toBe('Kühlschrank ‖ fridge');
    expect(entries[0].display).toBe('der Kühlschrank');
    expect(JSON.stringify(entries[0].dict)).not.toMatch(/Bridge/);
  });
  it('F2 拆開寫的複合詞只在整行沒有英文、沒有中文時嘗試（feiren abend 照舊建議 Feierabend）', async () => {
    const { entries } = await pv('feiren abend');
    expect(entries[0].flags.suggestion).toBe('Feierabend');
  });
});

describe('F3 每一筆都救得回來（解析層）', () => {
  it('F3 有 note 的那筆也能併進上一筆', async () => {
    let { entries } = await pv('Ausweis\nId - card');
    expect(entries).toHaveLength(2);
    entries = await mergeIntoPrevious(entries, 1, dict);
    expect(entries.map(pair)).toEqual(['Ausweis ‖ Id - card']);
  });
  it('F3 Termn appointmnet 可以點字重選分界（全部當德文）', async () => {
    let { entries } = await pv('Termn appointmnet');
    entries = await splitAt(entries, 0, 2, dict);
    expect(pair(entries[0])).toBe('Termn appointmnet');
  });
});

describe('F6 數字要真（解析層）', () => {
  it('F6 = ⏎ : nothing ⏎ | x → 不產生德文空白的一筆', async () => {
    const { entries } = await pv('=\n: nothing\n| x');
    expect(entries.every((e) => e.german && e.german.trim() && e.key)).toBe(true);
  });
});

describe('F7 行首條列符號去掉再解析', () => {
  const cases = [
    ['- Wohnung - apartment', 'Wohnung ‖ apartment', 'die Wohnung'],
    ['• Miete rent 房租', 'Miete ‖ rent 房租', 'die Miete'],
    ['1. Hose trousers', 'Hose ‖ trousers', 'die Hose'],
    ['* Termin: appointment', 'Termin ‖ appointment', 'der Termin'],
  ];
  for (const [line, want, display] of cases) {
    it(`F7 ${line}`, async () => {
      const { entries } = await pv(line);
      expect(entries).toHaveLength(1);
      expect(pair(entries[0])).toBe(want);
      expect(entries[0].display).toBe(display);
    });
  }
});

describe('§5.1 F 前後空白（含全形空白）去掉、中間一字不動', () => {
  it('Lampe - 　全形　空白　 → 全形　空白', async () => {
    const { entries } = await pv('Lampe - 　全形　空白　');
    expect(entries[0].note).toBe('全形　空白');
  });
});

// ---------- P6.7 收尾（SPEC §5.1 F「P6.7 收尾」，Tester P6.6 報告 N1–N3） ----------
import { splitIntoNew } from '../src/wordbook/parse.js';

describe('P6.7 N1 Check split 的理由對應真正的原因', () => {
  it('N1 查不到也不是英文 → 理由不是「德英同形」', async () => {
    const { entries } = await pv('Farbe colr 顏色\nEnde endx');
    const flagged = entries.filter((e) => e.flags.checkSplit);
    expect(flagged.length).toBeGreaterThan(0);
    for (const e of flagged) expect(e.flags.checkReason).not.toBe('boundary');
  });
  it('N1 德英同形 → 理由是 boundary', async () => {
    const { entries } = await pv('gehen will go');
    expect(entries[0].flags.checkReason).toBe('boundary');
  });
  it('N1 第一個字打錯、有建議 → 理由是 typo', async () => {
    const { entries } = await pv('Termn appointmnet');
    expect(entries[0].flags.checkReason).toBe('typo');
  });
  it('N1 德文段後面接查不到的字 → 理由是 unknown', async () => {
    const { entries } = await pv('Arzt blorp zzz');
    expect(entries[0].flags.checkReason).toBe('unknown');
  });
});

describe('P6.7 英文詞表加 en_GB', () => {
  for (const [line, want] of [
    ['Farbe colour 顏色', 'Farbe ‖ colour 顏色'],
    ['Lieblingsfarbe favourite colour', 'Lieblingsfarbe ‖ favourite colour'],
    ['Staubsauger hoover', 'Staubsauger ‖ hoover'],
    ['Führerschein licence', 'Führerschein ‖ licence'],
  ]) {
    it(`en_GB ${line}`, async () => {
      const { entries } = await pv(line);
      expect(pair(entries[0])).toBe(want);
      expect(entries[0].flags.checkSplit).toBe(false);
    });
  }
});

describe('P6.7 N2 英文字不給拼字建議', () => {
  it('N2 Na und? so what? → All German 後沒有 "Na und so Chat" 這種建議', async () => {
    let { entries } = await pv('Na und? so what?');
    entries = await splitAt(entries, 0, entries[0].splitWords.length, dict);
    expect(entries[0].flags.suggestion).toBe(null);
  });
  it('N2 被 Fix 移出來的解釋行（self photo）沒有建議、而且標 Check split', async () => {
    let { entries } = await pv('Kunde\ncustomer\nSelfie\n= self photo');
    const i = entries.findIndex((e) => (e.note || '').includes('self photo'));
    expect(i).toBeGreaterThanOrEqual(0);
    entries = await splitIntoNew(entries, i, dict);
    const moved = entries.find((e) => e.german === 'self photo');
    expect(moved).toBeTruthy();
    expect(moved.flags.suggestion).toBe(null);
    expect(moved.flags.checkSplit).toBe(true);
  });
  it('N2 第一行就是 = soon → 沒有 "Did you mean Sohn?"', async () => {
    const { entries } = await pv('= soon');
    expect(entries[0].flags.suggestion).toBe(null);
  });
  it('N2 查不到也不是英文的字照樣給建議（fiets bike 的 fiets 可以有，bike 不可以被改）', async () => {
    const { entries } = await pv('Kündigunsfrist notice');
    expect(entries[0].flags.suggestion).toBe('Kündigungsfrist');
  });
});

// SPEC §5.1 F「P6.8」（PM 9/30 修正，P6.8b）：整行英文、但有字查得到德文 → 預設當新的一筆、必標，Fix 一鍵改成上一筆的解釋
describe('P6.8b N3 德英都說得通的整行英文：預設新的一筆、必標（Fix 一鍵併成上一筆的解釋）', () => {
  it('N3 Schal scarf ⏎ Mode fashion → 兩筆、第二筆標；併回 → 一筆', async () => {
    let { entries } = await pv('Schal scarf\nMode fashion');
    expect(entries.map(pair)).toEqual(['Schal ‖ scarf', 'Mode ‖ fashion']);
    expect(entries[1].flags.checkReason).toBe('maybeNote');
    entries = await mergeIntoPrevious(entries, 1, dict);
    expect(entries.map(pair)).toEqual(['Schal ‖ scarf\nMode fashion']);
  });
  it('N3 Rente pension ⏎ Taste key (keyboard) → 兩筆、第二筆標', async () => {
    const { entries } = await pv('Rente pension\nTaste key (keyboard)');
    expect(entries.map(pair)).toEqual(['Rente ‖ pension', 'Taste ‖ key (keyboard)']);
    expect(entries[1].flags.checkSplit).toBe(true);
  });
  it('N3 Ausweis ⏎ ID card → 兩筆、ID card 那筆標', async () => {
    const { entries } = await pv('Ausweis\nID card');
    expect(entries.map((e) => e.german)).toEqual(['Ausweis', 'ID']);
    expect(entries[1].flags.checkSplit).toBe(true);
  });
});

describe('P6.7 en dash 也算條列符號', () => {
  it('– Lampe lamp → Lampe ‖ lamp', async () => {
    const { entries } = await pv('– Lampe lamp');
    expect(pair(entries[0])).toBe('Lampe ‖ lamp');
    expect(entries[0].line).toBe('Lampe lamp');
  });
});

// ---------- P6.8 統一判準（SPEC §5.1 F「P6.8」，Tester P6.7 報告 F1–F3、N-a、N-b） ----------
const flaggedSomewhere = (entries) => entries.some((e) => e.flags.checkSplit);

describe('P6.8b F1 上一筆後面、整行英文但有字查得到德文 → 預設新的一筆、必標；Fix 一鍵併成上一筆的解釋', () => {
  it('F1 Konto ⏎ Bank account ⏎ Termin ⏎ Date with doctor ⏎ Stelle ⏎ Job opening', async () => {
    const { entries } = await pv('Konto\nBank account\nTermin\nDate with doctor\nStelle\nJob opening');
    expect(entries.map((e) => e.german)).toEqual(['Konto', 'Bank', 'Termin', 'Date', 'Stelle', 'Job']);
    for (const k of [1, 3, 5]) expect(entries[k].flags.checkReason).toBe('maybeNote');
  });
  for (const [a, b] of [['Spielplatz', 'Park for kids'], ['Mannschaft', 'Team of players'], ['Schuh', 'Boot for winter'],
    ['Handschuh', 'Hand glove'], ['Sportverein', 'Sport club'], ['Schal scarf', 'Mode fashion'],
    ['Termin', 'Arm poor'], ['Kleid', 'Rock skirt'], ['lebe seit', 'bald']]) {
    it(`F1 ${a} ⏎ ${b} → 兩筆、第二筆必標；併回 → 解釋含 ${b}`, async () => {
      let { entries } = await pv(`${a}\n${b}`);
      expect(entries).toHaveLength(2);
      expect(entries[1].flags.checkSplit).toBe(true);
      expect(entries[1].flags.checkReason).toBe('maybeNote');
      entries = await mergeIntoPrevious(entries, 1, dict);
      expect(entries).toHaveLength(1);
      expect(entries[0].note.split('\n')).toContain(b);
    });
  }
  it('F1 Sparkonto ⏎ Bank account 帳戶（中英混寫）→ 兩筆、第二筆必標', async () => {
    const { entries } = await pv('Sparkonto\nBank account 帳戶');
    expect(entries.map((e) => e.german)).toEqual(['Sparkonto', 'Bank']);
    expect(entries[1].flags.checkSplit).toBe(true);
  });
  it('F1 純英文（查不到德文）照舊當解釋、不標：Kita ⏎ daycare、bald ⏎ soon', async () => {
    for (const [text, want] of [['Kita\ndaycare', 'Kita ‖ daycare'], ['bald\nsoon', 'bald ‖ soon']]) {
      const { entries } = await pv(text);
      expect(entries.map(pair)).toEqual([want]);
      expect(entries[0].flags.checkSplit).toBe(false);
    }
  });
  it('F1 Kündigung ⏎ Notice period → 解釋（Notice 不是德文，不必標）', async () => {
    const { entries } = await pv('Kündigung\nNotice period');
    expect(entries.map(pair)).toEqual(['Kündigung ‖ Notice period']);
  });
  it('F1 Kunst ⏎ Art → 兩筆、Art 那筆必標', async () => {
    const { entries } = await pv('Kunst\nArt');
    expect(flaggedSomewhere(entries)).toBe(true);
    expect(entries.map((e) => e.german)).toEqual(['Kunst', 'Art']);
    expect(entries[1].flags.checkReason).toBe('maybeNote');
  });
  it('F1 第一個字是德文、不是英文 → 新的一筆（Kündigungsfrist 解約期限）', async () => {
    const { entries } = await pv('Termin\nKündigungsfrist 解約期限');
    expect(entries.map(pair)).toEqual(['Termin', 'Kündigungsfrist ‖ 解約期限']);
  });
  it('F1 沒有上一筆的單獨同形字（Mama）→ 一筆德文、不標', async () => {
    const { entries } = await pv('Mama');
    expect(entries.map(pair)).toEqual(['Mama']);
    expect(entries[0].flags.checkSplit).toBe(false);
  });
});

describe('P6.8 N-a 英文縮寫算英文字', () => {
  for (const [line, want] of [['Es regnet it\'s raining 下雨', 'Es regnet ‖ it\'s raining 下雨'], ['Wo ist das Klo? where\'s the loo', 'Wo ist das Klo? ‖ where\'s the loo']]) {
    it(`N-a ${line}`, async () => {
      const { entries } = await pv(line);
      expect(pair(entries[0])).toBe(want);
      expect(entries[0].flags.checkSplit).toBe(false);
    });
  }
});

describe('P6.8 N-b 行尾與前一個字同拼法 → 英文解釋、不標（有沒有上一筆都一樣）', () => {
  for (const w of ['Angst', 'Rucksack', 'Kindergarten', 'Kitsch', 'Zeitgeist', 'Handy', 'Kind', 'Hotel']) {
    it(`N-b ${w} ${w.toLowerCase()}`, async () => {
      for (const text of [`${w} ${w.toLowerCase()}`, `Haus\n${w} ${w.toLowerCase()}`]) {
        const { entries } = await pv(text);
        const e = entries[entries.length - 1];
        expect(pair(e)).toBe(`${w} ‖ ${w.toLowerCase()}`);
        expect(e.flags.checkSplit).toBe(false);
      }
    });
  }
});

describe('P6.8 F3 括號、引號內不切開', () => {
  it('F3 Hausarzt ⏎ GP (BrE), family doctor → 整段是解釋', async () => {
    const { entries } = await pv('Hausarzt\nGP (BrE), family doctor');
    expect(entries.map(pair)).toEqual(['Hausarzt ‖ GP (BrE), family doctor']);
  });
  it('F3 Wohnung ⏎ Flat (BrE) → 整段是解釋', async () => {
    const { entries } = await pv('Wohnung\nFlat (BrE)');
    expect(entries.map(pair)).toEqual(['Wohnung ‖ Flat (BrE)']);
  });
  it('F3 同一行：Arzt (doctor, GP) → 德文段不帶半個括號', async () => {
    const { entries } = await pv('Arzt (doctor, GP)');
    expect(pair(entries[0])).toBe('Arzt ‖ (doctor, GP)');
  });
  it('F3 Fix 點字重選分界也不切開括號', async () => {
    let { entries } = await pv('Arzt (doctor, GP)');
    entries = await splitAt(entries, 0, 2, dict); // 點 GP：落在括號裡 → 退到括號前
    expect(pair(entries[0])).toBe('Arzt ‖ (doctor, GP)');
  });
});

describe('P6.8 F2 理由只寫畫面上真的有的東西', () => {
  it('F2 寫 typo 就一定有建議', async () => {
    const { entries } = await pv('Wohnung\nFlat (BrE)\nKonto\nbank account 帳戶\nTermn appointmnet\nfiets bike\nGP (x');
    for (const e of entries) if (e.flags.checkReason === 'typo') expect(e.flags.suggestion, pair(e)).toBeTruthy();
  });
});
