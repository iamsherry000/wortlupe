// P2.3：第三輪 Tester（docs/tester/P2.2-acceptance.md）的 A1–A5、M-1～M-5，以及 Charles 的判定 1–3。
import { describe, it, expect } from 'vitest';
import { runCase, cardOf, sentenceMatches } from './regression/run-case.js';

const CHAT = /subject ich left out, common in chat/;

describe('A1 kein＋小寫名詞：kein 是限定詞，G11 講 kein + 名詞', () => {
  for (const [text, noun] of [['hab heut keine zeit, sorry', 'zeit'], ['keine ahnung was er meint', 'ahnung'], ['hab echt keine lust mehr', 'lust']]) {
    it(`A1 ${text}`, runCase({
      text, say: { G11: new RegExp(`negates the noun “${noun}”`) }, notSay: { G11: /stands alone/ },
      cards: [['keine', { lemma: 'kein', pos: 'det' }]],
    }));
  }
  it('A1 大寫照舊（Ich habe keine Zeit.）', runCase({ text: 'Ich habe keine Zeit.', say: { G11: /negates the noun “Zeit”/ } }));
  it('A1 真的單獨用的 keiner 照舊（Keiner hat angerufen.）', runCase({ text: 'Keiner hat angerufen.', say: { G11: /stands alone/ } }));
});

describe('判定 1：省略主詞的動詞開頭句不下判斷（A2–A4）', () => {
  it('A2 hab … geschickt：不是命令式，是省略 ich 的完成式', runCase({ text: 'hab dir die fotos geschickt, schau mal', not: ['G10'], say: { G05: CHAT } }));
  it('A2 hab gestern bis zehn gearbeitet', runCase({ text: 'hab gestern bis zehn gearbeitet', not: ['G10'], say: { G05: CHAT } }));
  it('A2 hab meine tasche … liegen lassen', runCase({ text: 'hab meine tasche bei dir liegen lassen glaub ich', not: ['G10'] }));
  it('A3 freu mich：反身代名詞 mich → 省略 ich，即使有 !', runCase({ text: 'freu mich schon auf samstag!! 🎉', not: ['G10'] }));
  it('A4 muss … einkaufen, brauchst du was?：第一個子句沒有主詞 → 不是是非問句', runCase({ text: 'muss noch schnell einkaufen, brauchst du was?', not: ['G09'], fire: ['G04'] }));
  it('完成式省略主詞但不是 ich（hat super geklappt）不寫 ich', runCase({ text: 'danke, hat super geklappt', notSay: { G05: /subject ich/ } }));
  it('有主詞的完成式不加註（Ich habe dir die Fotos geschickt.）', runCase({ text: 'Ich habe dir die Fotos geschickt.', fire: ['G05'], notSay: { G05: /left out/ } }));
  // 例外：真正的命令式
  it('命令式例外：句尾 ! ＋只能是 du 命令式（Komm bitte her!）', runCase({ text: 'Komm bitte her!', fire: ['G10'] }));
  it('命令式例外：bitte（Mach bitte das Fenster zu.）', runCase({ text: 'Mach bitte das Fenster zu.', fire: ['G10'] }));
  it('命令式例外：句尾 !（Mach das Fenster zu!）', runCase({ text: 'Mach das Fenster zu!', fire: ['G10'] }));
  // Charles 收窄判定 1：只有 mich／mir 是省略 ich 的訊號；dich 接在沒有詞尾的字幹後面是命令式
  it('dich＋!：Freu dich! → G10', runCase({ text: 'Freu dich!', fire: ['G10'] }));
  it('dich＋bitte：Beeil dich bitte. → G10', runCase({ text: 'Beeil dich bitte.', fire: ['G10'] }));
  it('dich 沒有 ! 也沒有 bitte：freu dich schon → 不判斷', runCase({ text: 'freu dich schon', not: ['G10'] }));
  it('mich：freu mich schon → 不觸發 G10', runCase({ text: 'freu mich schon', not: ['G10'] }));
  it('mich＋!：freu mich schon!! → 不觸發 G10', runCase({ text: 'freu mich schon!!', not: ['G10'] }));
  it('freust dich? → 不觸發 G10', runCase({ text: 'freust dich?', not: ['G10'] }));
  it('mir：hab mir was gekauft! → 不觸發 G10', runCase({ text: 'hab mir was gekauft!', not: ['G10'] }));
  it('golden：Gib mir das Salz.（e→i 變音的命令式不可能是口語第一人稱）', runCase({ text: 'Gib mir das Salz.', fire: ['G10'] }));
  it('沒有 ! 也沒有 bitte 的 mach … → 不判斷', runCase({ text: 'mach schon mal den ofen an', not: ['G10'] }));
  // 例外：是非問句
  it('是非問句照常（hast du n bisschen milch übrig?）', runCase({ text: 'hast du n bisschen milch übrig?', fire: ['G09'] }));
  it('是非問句照常（Ist der Laden heute offen?）', runCase({ text: 'Ist der Laden heute offen?', fire: ['G09'] }));
  it('是非問句照常（Gibt es hier ein Café?）', runCase({ text: 'Gibt es hier ein Café?', fire: ['G09'] }));
});

describe('判定 2：句首感嘆詞不佔第一位（A5）', () => {
  it('A5 sorry war krank → 省略主詞，G01 不觸發', runCase({ text: 'sorry war krank, hab deine nachricht erst jetzt gesehen', not: ['G01'], say: { G05: CHAT } }));
  it('A5 sorry bin spät dran', runCase({ text: 'sorry bin spät dran', not: ['G01', 'G09', 'G10'] }));
  it('Sorry, ich bin spät dran. → G01 從 ich 算起', runCase({ text: 'Sorry, ich bin spät dran.', say: { G01: /“bin”.*position 2.*subject “ich”/ } }));
  it('ok ich komme gleich → G01 從 ich 算起', runCase({ text: 'ok ich komme gleich', say: { G01: /“komme”.*subject “ich”/ } }));
  it('Ja, das stimmt. → G01', runCase({ text: 'Ja, das stimmt.', say: { G01: /“stimmt”.*position 2/ } }));
  it('lol das ist so typisch → G01', runCase({ text: 'lol das ist so typisch', say: { G01: /“ist”.*position 2/ } }));
  it('hey kommst du mit? → G09 看 hey 後面的第一個字', runCase({ text: 'hey kommst du mit?', fire: ['G09'] }));
  it('Hallo, wie geht es dir? → W 問句，沒有 G09', runCase({ text: 'Hallo, wie geht es dir?', not: ['G09', 'G01'] }));
});

describe('判定 3：英文字剛好是德文字', () => {
  it('will 照常顯示德文讀法（wollen）', async () => {
    const c = await cardOf('I will call you', 'will');
    expect(c.status).toBe('found');
    expect(c.readings[0].lemma).toBe('wollen');
  });
  it('is → ist（口語表）', async () => {
    const c = await cardOf('das is doch egal', 'is');
    expect(c.colloquial.expansions).toEqual(['ist']);
    expect(c.readings[0].lemma).toBe('sein');
  });
});

describe('M-1 同形過去分詞：取最常用的動詞', () => {
  const CASES = [
    ['Wir haben ihn gestern im Park getroffen.', 'G05', 'treffen', 'triefen'],
    ['Wir haben uns im Café getroffen.', 'G05', 'treffen', 'triefen'],
    ['Er hat den Ball nicht getroffen.', 'G05', 'treffen', 'triefen'],
    ['Das Buch hat lange auf dem Tisch gelegen.', 'G05', 'liegen', null],
    ['Ich habe den ganzen Tag hier gesessen.', 'G05', 'sitzen', null],
    ['Ich bin gestern im Kino gewesen.', 'G05', 'sein', null],
    ['Er hat die Tür geschlossen.', 'G05', 'schließen', null],
    ['Die Tür wurde geschlossen.', 'G13', 'schließen', null],
    ['Sie hat die Schuhe gebunden.', 'G05', 'binden', null],
    ['Ich habe meinen Schlüssel verloren.', 'G05', 'verlieren', null],
    ['Der Brief ist gestern zugestellt worden.', 'G05', 'zustellen', null],
  ];
  for (const [text, rule, verb, wrong] of CASES) {
    it(`M-1 ${text} → ${verb}`, runCase({ text, say: { [rule]: new RegExp(`participle of ${verb}\\b`) }, ...(wrong ? { notSay: { [rule]: new RegExp(wrong) } } : {}) }));
  }
});

describe('M-2 口語縮寫', () => {
  const CASES = [
    ['is', 'netz is mega schlecht', ['ist']], ['isses', 'isses ok', ['ist es']], ['wars', 'wie wars beim arzt', ['war es']],
    ['vllt', 'vllt morgen', ['vielleicht']], ['gibts', 'gibts noch kuchen', ['gibt es']], ['haste', 'haste zeit', ['hast du']],
    ['biste', 'biste da', ['bist du']], ['nich', 'geht nich', ['nicht']], ['nix', 'hab nix gegessen', ['nichts']],
    // RD 補的（WhatsApp 常見、沒有歧義）
    ['vlt', 'vlt später', ['vielleicht']], ['iwie', 'iwie komisch', ['irgendwie']], ['iwann', 'iwann mal', ['irgendwann']],
    ['iwo', 'liegt iwo', ['irgendwo']], ['lg', 'lg Sherry', ['liebe Grüße']],
    ['vg', 'vg Sherry', ['viele Grüße']], ['mfg', 'mfg Sherry', ['mit freundlichen Grüßen']], ['hdl', 'hdl', ['hab dich lieb']],
    ['hdgdl', 'hdgdl', ['hab dich ganz doll lieb']], ['kp', 'kp was das ist', ['kein Plan']], ['bzw', 'heute bzw morgen', ['beziehungsweise']],
    ['usw', 'brot, milch usw', ['und so weiter']], ['evtl', 'evtl später', ['eventuell']],
    ['hats', 'hats geklappt', ['hat es']], ['gabs', 'gabs probleme', ['gab es']], ['wirds', 'wirds spät', ['wird es']],
    ['habs', 'habs vergessen', ['habe es']], ['machs', 'machs gut', ['mach es']], ['gings', 'wie gings dir', ['ging es']],
    ['kannste', 'kannste kommen', ['kannst du']], ['gehste', 'gehste mit', ['gehst du']],
  ];
  for (const [w, text, exp] of CASES) {
    it(`M-2 ${w} → ${exp.join(' / ')}`, async () => {
      const c = await cardOf(text, w);
      expect(c.colloquial && c.colloquial.expansions).toEqual(exp);
      expect(c.status).toBe('found');
      expect(c.readings.length).toBeGreaterThan(0);
    });
  }
});

describe('M-3 一般高頻字的首要讀法', () => {
  it('M-3 nen gefallen → der Gefallen', runCase({ text: 'kannst du mir nen gefallen tun', cards: [['gefallen', { lemma: 'Gefallen', pos: 'noun', lowercaseNoun: 'Gefallen' }]] }));
  it('M-3 ein Gefallen 大寫照常', runCase({ text: 'Kannst du mir einen Gefallen tun?', cards: [['Gefallen', { lemma: 'Gefallen', pos: 'noun' }]] }));
  it('M-3 Das hat mir gefallen. 動詞照常', runCase({ text: 'Das hat mir gut gefallen.', cards: [['gefallen', { lemma: 'gefallen', pos: 'verb' }]] }));
  it('M-3 voll lieb von dir → lieb (adj)', runCase({ text: 'voll lieb von dir', cards: [['lieb', { lemma: 'lieb', pos: 'adj' }]] }));
  it('M-3 das ist leer → leer (adj)', runCase({ text: 'die flasche ist leer', cards: [['leer', { lemma: 'leer', pos: 'adj' }]] }));
  it('M-3 ich später komm → komme（口語省略 e）', runCase({ text: 'isses ok wenn ich später komm?', cards: [['komm', { lemma: 'kommen', pos: 'verb', form: /^present tense · 1st person · singular/ }]] }));
  it('M-3 Komm her! → 命令式照常', runCase({ text: 'Komm her!', cards: [['Komm', { lemma: 'kommen', pos: 'verb', form: /^imperative/ }]] }));
  it('M-3 die kleinen schlafen → die Kleinen', runCase({ text: 'die kleinen schlafen schon', cards: [['kleinen', { lemma: 'klein', pos: 'adj', posLabel: /used as a noun/, form: /^plural/ }]] }));
  it('M-3 die kleinen Kinder → 形容詞照常', runCase({ text: 'die kleinen Kinder schlafen schon', cards: [['kleinen', { lemma: 'klein', pos: 'adj', notPosLabel: /used as a noun/ }]] }));
  it('M-3 Wir weisen Sie darauf hin → weisen (verb)', runCase({ text: 'Wir weisen Sie darauf hin, dass es spät ist.', cards: [['weisen', { lemma: 'weisen', pos: 'verb' }]] }));
  it('M-3 ausfällt → to be cancelled', runCase({ text: 'Der Kurs fällt morgen aus.', cards: [['fällt', { lemma: 'fallen', pos: 'verb' }]] }));
  it('M-3 ausfällt 的首要義項', runCase({ text: 'dass der Kurs morgen ausfällt', cards: [['ausfällt', { lemma: 'ausfallen', pos: 'verb', firstGloss: /cancel/ }]] }));
  it('M-3 zugestellt → to deliver', runCase({ text: 'Der Brief wurde zugestellt.', cards: [['zugestellt', { lemma: 'zustellen', pos: 'verb', firstGloss: /deliver/ }]] }));
  it('M-3 Aufzug → elevator', runCase({ text: 'Der Aufzug ist kaputt.', cards: [['Aufzug', { lemma: 'Aufzug', pos: 'noun', firstGloss: /elevator|lift/ }]] }));
});

describe('M-4 斷句縮寫', () => {
  const CASES = [
    'Ich wohne in der Hauptstr. 12 in Dinslaken.', 'Die Sitzung ist am Mo. um 18 Uhr.', 'Siehe S. 5 und Nr. 3.',
    'Geöffnet Di. bis Fr. von 9 bis 12 Uhr.', 'Das Haus ist aus dem 19. Jh. und steht unter Denkmalschutz.',
    'Rufen Sie mich an, Tel. 0281 12345.', 'Bitte bringen Sie ggf. Ihren Ausweis mit.', 'Das kostet 20 Euro inkl. Versand.',
    'Das kostet 20 Euro zzgl. Versand.', 'Ich komme evtl. später.', 'Siehe Abs. 2 des Vertrags.', 'Wir treffen uns am Sa. um 10 Uhr.',
    'Er wohnt in der Bahnhofstr. 3.', 'Ich komme heute bzw. morgen.',
  ];
  for (const text of CASES) {
    it(`M-4 ${text} → 一句`, async () => {
      const { sentences } = await sentenceMatches(text);
      expect(sentences.length).toBe(1);
    });
  }
  it('M-4 句尾的 so 不是縮寫（Mach es so. Dann geht es.）', async () => {
    const { sentences } = await sentenceMatches('Mach es so. Dann geht es.');
    expect(sentences.length).toBe(2);
  });
});

describe('M-5 am 後面是英文', () => {
  it('M-5 Das war so good, I am so happy dass du da warst. → 沒有 G08', runCase({ text: 'Das war so good, I am so happy dass du da warst.', not: ['G08'] }));
  it('M-5 I am happy → 沒有 G08', runCase({ text: 'Ich weiß, I am happy.', not: ['G08'] }));
  it('M-5 德文 am 照常（Ich bin am Bahnhof.）', runCase({ text: 'Ich bin am Bahnhof.', fire: ['G08'] }));
});
