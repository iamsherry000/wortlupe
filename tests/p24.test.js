// P2.4：第四輪 Tester（docs/tester/P2.3-acceptance.md）的修正項 1–5。
import { describe, it, expect } from 'vitest';
import { runCase, cardOf } from './regression/run-case.js';

describe('1. G18 du 的 -st：詞尾的 s 不可算進詞幹', () => {
  const CASES = [
    ['Kommst du morgen?', 'Kommst', /Komm \+ -st/i],
    ['Isst du gern Fisch?', 'Isst', /iss \+ -t/i],
    ['Liest du das Buch?', 'Liest', /lies \+ -t/i],
    ['Wie heißt du?', 'heißt', /heiß \+ -t/],
    ['Reist du morgen ab?', 'Reist', /reis \+ -t/i],
    ['Tanzt du gern?', 'Tanzt', /tanz \+ -t/i],
    ['Wo sitzt du?', 'sitzt', /sitz \+ -t/],
    ['Du musst jetzt gehen.', 'musst', /muss- here, then the regular ending -t/],
    ['Nennst du das Musik?', 'Nennst', /nenn \+ -st/i],
  ];
  for (const [text, w, re] of CASES) {
    it(`G18 ${w}`, runCase({ text, word: [[w, { say: re, notSay: /komms-|\bmus-|\bis-|\blie-|\brei-/ }]] }));
  }
  // 回歸：不是 s 結尾的字幹照舊 -st（第一版修正把 hast、kannst 講成 has-／kanns-，對照 Tester 句組時抓到）
  it('G18 hast = ha + -st', runCase({ text: 'Hast du Zeit?', word: [['Hast', { say: /ha- here, then the regular ending -st/i, notSay: /has-/i }]] }));
  it('G18 kannst = kann + -st', runCase({ text: 'Kannst du kommen?', word: [['Kannst', { say: /kann- here, then the regular ending -st/i, notSay: /kanns-/i }]] }));
  it('G18 atmest 仍加 e（atm + -est）', runCase({ text: 'Atmest du ruhig?', word: [['Atmest', { say: /atm \+ -est/i }]] }));
});

describe('2. das 後面沒有名詞 → 指示代名詞 that', () => {
  const PRON = [
    ['findest du das auch komisch?', 'das'], ['das war so lecker', 'das'], ['das geht nicht', 'das'],
    ['Ich weiß das.', 'das'], ['Findest du das auch komisch?', 'das'],
  ];
  for (const [text, w] of PRON) {
    it(`das 代名詞：${text}`, runCase({ text, cards: [[w, { lemma: 'das', pos: 'pron', gloss: /that/ }]] }));
  }
  const ART = [['das Auto ist neu', 'das'], ['Das große Haus ist alt.', 'Das'], ['Ich kaufe das neue Auto.', 'das'], ['hast du das rezept?', 'das']];
  for (const [text, w] of ART) {
    it(`das 冠詞：${text}`, runCase({ text, cards: [[w, { lemma: 'der', pos: 'article' }]] }));
  }
  it('das 關係代名詞照常（Das Haus, das ich kenne, ist alt.）', runCase({ text: 'Das Haus, das ich kenne, ist alt.', cards: [['das', { lemma: 'der', pos: 'pron', gloss: /which/ }]] }));
});

describe('3. ne 口語的「不」', () => {
  it('ne 單獨', runCase({ text: 'ne', cards: [['ne', { lemma: 'nein', pos: 'intj' }]] }));
  it('ne 句首＋逗號', runCase({ text: 'ne, heute nicht', cards: [['ne', { lemma: 'nein', pos: 'intj' }]] }));
  it('ja ne, …', runCase({ text: 'ja ne, das geht leider nicht', cards: [['ne', { lemma: 'nein', pos: 'intj' }]] }));
  it('ne 句尾附加問句 → right?', runCase({ text: 'das ist gut, ne?', cards: [['ne', { lemma: 'nein', pos: 'intj', firstGloss: /right\?/ }]] }));
  it('ne 後接名詞 → eine', runCase({ text: 'hast du ne idee?', cards: [['ne', { lemma: 'ein', pos: 'article' }]] }));
  it('ne 後接名詞（大寫）→ eine', runCase({ text: 'Ich hab ne Frage.', cards: [['ne', { lemma: 'ein', pos: 'article' }]] }));
  it('ne 口語還原維持 nein／eine', async () => {
    const c = await cardOf('ja ne, das geht nicht', 'ne');
    expect(c.colloquial.expansions).toEqual(['nein', 'eine']);
  });
});

describe('4. 一般字', () => {
  it('lecker（小寫聊天）', runCase({ text: 'das war so lecker', cards: [['lecker', { lemma: 'lecker', pos: 'adj', gloss: /tasty|delicious/ }]] }));
  it('lecker（標準句）', runCase({ text: 'Die Suppe war so lecker.', cards: [['lecker', { lemma: 'lecker', pos: 'adj' }]] }));
  it('den ganzen tag：ganzen 是形容詞修飾 tag', runCase({ text: 'war den ganzen tag unterwegs', cards: [['ganzen', { lemma: 'ganz', pos: 'adj', notPosLabel: /used as a noun/ }]] }));
  it('die kleinen schlafen：名詞化照舊', runCase({ text: 'die kleinen schlafen schon', cards: [['kleinen', { lemma: 'klein', pos: 'adj', posLabel: /used as a noun/ }]] }));
  it('zuhause → at home', runCase({ text: 'ist jemand zuhause?', cards: [['zuhause', { lemma: 'zuhause', pos: 'adv', firstGloss: /at home/ }]] }));
  it('Zuhause（句中大寫名詞）照舊', runCase({ text: 'Das ist mein Zuhause.', cards: [['Zuhause', { lemma: 'Zuhause', pos: 'noun' }]] }));
  it('grad → gerade（副詞）', runCase({ text: 'bin grad im bus', cards: [['grad', { colloquial: ['gerade'], lemma: 'gerade', pos: 'adv' }]] }));
  it('min → Minute', runCase({ text: 'komme in 20 min', cards: [['min', { colloquial: ['Minute'], lemma: 'Minute', pos: 'noun' }]] }));
});

describe('5. 可分離動詞', () => {
  it('ich hol … ab（口語省略 -e）', runCase({ text: 'ich hol die kinder heute ab', say: { G06: /abholen/ } }));
  it('Hör auf zu lachen!', runCase({ text: 'Hör auf zu lachen!', say: { G06: /aufhören/ } }));
  it('ich komm gleich nach', runCase({ text: 'ich komm gleich nach', say: { G06: /nachkommen/ } }));
  it('Ich fange an zu arbeiten.（zu 不定詞前的前綴）', runCase({ text: 'Ich fange an zu arbeiten.', say: { G06: /anfangen/ } }));
  it('zu 不定詞前不是前綴時不硬拆（Ich habe keine Lust zu lachen.）', runCase({ text: 'Ich habe keine Lust zu lachen.', not: ['G06'] }));
});
