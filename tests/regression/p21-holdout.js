// P2.1 Tester 第二輪集外句組（docs/tester/round2/holdout-th.txt，68 句）轉成的迴歸期望值。TESTS §0 TH，之後每期都跑。
// 欄位同 p2-holdout.js；另外：
//   cards 的期望可以有 form（「這個形是什麼」要符合）、notForm（不可出現）、gloss（首要義項要符合）
//   sentences：這段文字必須斷成幾句（M-e 斷句）
// id：A1–A5、M-a～M-f 對應 docs/tester/P2.1-acceptance.md；P5、P6 是「講得不完整」兩條；RD 是 RD 自己補的同類問題
export const HOLDOUT2 = [
  // --- WhatsApp：host family ---
  { text: 'Hi Sherry, wir sind heute Abend erst um neun zurück.', cards: [['wir', { lemma: 'wir', pos: 'pron' }], ['neun', { lemma: 'neun', pos: 'num' }]] },
  { text: 'Kannst du bitte die Kinder um vier vom Kindergarten abholen?', fire: ['G04', 'G08', 'G09'], cards: [['bitte', { lemma: 'bitte', pos: 'particle', gloss: /please/ }]], id: 'M-d' },
  { text: 'Das Essen steht im Kühlschrank, du musst es nur warm machen.', fire: ['G01', 'G04', 'G08'], cards: [['nur', { lemma: 'nur', pos: 'adv', gloss: /only/ }]], id: 'M-d' },
  { text: 'Danke, dass du gestern so lange auf Lukas aufgepasst hast!', fire: ['G02', 'G05'] },
  { text: 'Sorry, ich hab deine Nachricht zu spät gesehen.', not: ['G14'], cards: [['deine', { lemma: 'dein', pos: 'det', gloss: /your/ }]] },
  { text: 'Wir fahren am Samstag zu meinen Eltern, kommst du mit?', id: 'M-a', fire: ['G06'], not: ['G14'], cards: [['meinen', { lemma: 'mein', pos: 'det', gloss: /\bmy\b/ }]] },
  { text: 'Vergiss bitte nicht, den Müll rauszubringen.', fire: ['G10', 'G11', 'G14'] },
  { text: 'Der Schlüssel liegt unter der Matte.', fire: ['G01'], say: { G07: /a location/ } },
  { text: 'Ich bin noch beim Arzt, es dauert leider länger.', id: 'M-d', fire: ['G01', 'G08'], cards: [['noch', { lemma: 'noch', pos: 'adv', gloss: /still/ }], ['leider', { lemma: 'leider', pos: 'adv', gloss: /unfortunately/ }]] },
  { text: 'Kein Problem, das kriegen wir schon hin.', fire: ['G06', 'G11'], cards: [['das', { lemma: 'das', pos: 'pron' }], ['schon', { lemma: 'schon', pos: 'adv' }]] },
  { text: 'Hast du Lust, am Sonntag mit uns wandern zu gehen?', fire: ['G08', 'G09', 'G14'], cards: [['uns', { lemma: 'wir', pos: 'pron' }]] },
  {
    text: 'Die Kleine hat Fieber, deshalb bleibt sie heute zu Hause.', id: 'M-c', fire: ['G01'],
    word: [['Die', { notSay: /plural/ }]], cards: [['Kleine', { lemma: 'klein', pos: 'adj', form: /feminine/ }]],
  },
  { text: 'Ich melde mich, sobald ich mehr weiß.', fire: ['G01'], cards: [['mich', { lemma: 'ich', pos: 'pron', gloss: /\bme\b/, notGloss: /^I\b/ }]], id: 'M-d' },
  { text: 'Tut mir echt leid wegen gestern.', not: ['G10'], cards: [['mir', { lemma: 'ich', pos: 'pron', gloss: /\bme\b/, notGloss: /^I\b/ }]] },
  { text: 'Kannst du mir die Adresse schicken?', fire: ['G04', 'G09'] },
  { text: 'Wir treffen uns um halb acht vor dem Kino.', fire: ['G01', 'G07'], cards: [['acht', { lemma: 'acht', pos: 'num' }]] },
  { text: 'Bin in fünf Minuten da!', not: ['G10'], cards: [['da', { lemma: 'da', pos: 'adv', gloss: /there/ }]] },
  { text: 'Schönen Abend noch und danke für alles!', not: ['G10'], cards: [['alles', { lemma: 'alles', pos: 'pron' }]] },
  { text: 'Wer bringt morgen den Kuchen mit?', fire: ['G06'], cards: [['Wer', { lemma: 'wer', pos: 'pron', gloss: /who/ }], ['morgen', { lemma: 'morgen', pos: 'adv', gloss: /tomorrow/ }]] },
  { text: 'Ich würde lieber am Freitag kommen, wenn das okay ist.', fire: ['G01', 'G02', 'G08', 'G12'] },
  // --- WhatsApp：朋友、群組 ---
  { text: 'Wollen wir nächste Woche zusammen kochen?', id: 'M-d', fire: ['G04', 'G09'], cards: [['Wollen', { lemma: 'wollen', pos: 'verb' }]] },
  { text: 'Ich kann leider erst ab sieben.', id: 'M-b', not: ['G04'], cards: [['sieben', { lemma: 'sieben', pos: 'num', gloss: /seven/ }]] },
  { text: 'Habt ihr schon Pläne fürs Wochenende?', id: 'A3', fire: ['G09'], cards: [['ihr', { lemma: 'ihr', pos: 'pron', form: /2nd person/, notForm: /feminine|dative/ }], ['fürs', { contraction: ['für', 'das'] }]] },
  { text: 'Ich habe mich total gefreut, dich wiederzusehen.', fire: ['G01', 'G05', 'G14'], cards: [['dich', { lemma: 'du', pos: 'pron' }]] },
  { text: 'Wo seid ihr gerade?', id: 'A4', cards: [['Wo', { lemma: 'wo', pos: 'adv', gloss: /where/ }], ['ihr', { lemma: 'ihr', pos: 'pron', form: /2nd person/, notForm: /feminine|dative/ }]] },
  { text: 'Lass uns morgen telefonieren.', cards: [['uns', { lemma: 'wir', pos: 'pron' }]] },
  { text: 'Meine Mutter hat mir ein Paket aus Taiwan geschickt.', id: 'A1', fire: ['G01', 'G05'], cards: [['Meine', { lemma: 'mein', pos: 'det', gloss: /\bmy\b/ }]] },
  {
    text: 'Weißt du, ob der Laden am Sonntag offen hat?', id: 'P6', fire: ['G02', 'G08', 'G09'],
    word: [['Weißt', { notSay: /= weiß \+ -t/ }]], cards: [['Weißt', { lemma: 'wissen', pos: 'verb' }]],
  },
  { text: 'Es regnet schon den ganzen Tag.', fire: ['G01'], word: [['den', { fire: ['G15'], say: /time/ }]] },
  { text: 'Ich freue mich schon auf die Party!', fire: ['G01'], notSay: { G07: /a direction/ } },
  // --- 官方信件與表格 ---
  { text: 'Sehr geehrte Damen und Herren, hiermit kündige ich meinen Vertrag.', id: 'A1', cards: [['meinen', { lemma: 'mein', pos: 'det', gloss: /\bmy\b/ }]] },
  { text: 'Bitte senden Sie uns die Unterlagen bis zum 15. Oktober zurück.', id: 'M-e', sentences: 1, cards: [['Bitte', { lemma: 'bitte', pos: 'particle', gloss: /please/ }]] },
  { text: 'Ihr Antrag wurde bearbeitet.', fire: ['G01', 'G13'], cards: [['Ihr', { lemma: 'ihr', pos: 'det' }]] },
  { text: 'Wir bitten Sie, den Betrag innerhalb von vierzehn Tagen zu überweisen.', fire: ['G01', 'G14'], word: [['überweisen', { not: ['G18'] }]] },
  { text: 'Die Anmeldung muss persönlich im Bürgeramt erfolgen.', fire: ['G01', 'G04', 'G08'] },
  { text: 'Für Rückfragen stehen wir Ihnen gern zur Verfügung.', fire: ['G08'], cards: [['Ihnen', { lemma: 'Sie', pos: 'pron' }], ['gern', { lemma: 'gern', pos: 'adv' }]] },
  { text: 'Bitte füllen Sie das Formular vollständig aus.', id: 'M-d', cards: [['Bitte', { lemma: 'bitte', pos: 'particle', gloss: /please/ }]] },
  { text: 'Ihre Karte wird Ihnen per Post zugeschickt.', cards: [['Ihre', { lemma: 'ihr', pos: 'det' }]] },
  { text: 'Der Termin kann leider nicht verschoben werden.', id: 'RD', fire: ['G01', 'G11'], notSay: { G04: /main verb “werden”/ } },
  { text: 'Wir haben Ihre Zahlung erhalten.', fire: ['G01', 'G05'] },
  { text: 'Bei Fragen rufen Sie uns bitte an.', fire: ['G01', 'G06'] },
  { text: 'Unterschrift des Antragstellers' },
  // --- A1–B1 課本句 ---
  { text: 'Mein Bruder ist älter als ich.', fire: ['G01'], not: ['G02'], cards: [['Mein', { lemma: 'mein', pos: 'det', gloss: /\bmy\b/ }], ['als', { lemma: 'als', pos: 'conj' }]] },
  { text: 'Im Sommer fahren wir oft ans Meer.', fire: ['G08'], cards: [['oft', { lemma: 'oft', pos: 'adv', gloss: /often/ }], ['ans', { contraction: ['an', 'das'] }]] },
  { text: 'Wie spät ist es?', cards: [['Wie', { lemma: 'wie', pos: 'adv', gloss: /how/ }]] },
  { text: 'Ich stehe jeden Morgen um sechs Uhr auf.', fire: ['G01', 'G06'], cards: [['sechs', { lemma: 'sechs', pos: 'num' }]] },
  { text: 'Der Zug nach Düsseldorf hat zehn Minuten Verspätung.', cards: [['zehn', { lemma: 'zehn', pos: 'num' }], ['nach', { lemma: 'nach', pos: 'prep' }]] },
  { text: 'Gestern habe ich meinen Pass verloren.', id: 'A1', fire: ['G01', 'G05'], cards: [['meinen', { lemma: 'mein', pos: 'det', gloss: /\bmy\b/ }]] },
  { text: 'Er ist mit dem Fahrrad zur Arbeit gefahren.', fire: ['G01', 'G05', 'G07', 'G08'] },
  { text: 'Das Buch, das du mir empfohlen hast, ist spannend.', fire: ['G03'] },
  { text: 'Wenn es morgen nicht regnet, gehen wir schwimmen.', fire: ['G02', 'G11'] },
  {
    text: 'Ich weiß nicht, wo meine Brille ist.', id: 'A1', fire: ['G01', 'G11'],
    cards: [['wo', { lemma: 'wo', pos: 'adv', gloss: /where/ }], ['meine', { lemma: 'mein', pos: 'det', gloss: /\bmy\b/ }], ['weiß', { lemma: 'wissen', pos: 'verb' }]],
  },
  { text: 'Sie hat sich die Hände gewaschen.', fire: ['G01', 'G05'], cards: [['Sie', { lemma: 'sie', pos: 'pron', gloss: /she/ }], ['sich', { lemma: 'sich', pos: 'pron' }]] },
  { text: 'Kinder dürfen hier nicht spielen.', fire: ['G01', 'G04', 'G11'], cards: [['hier', { lemma: 'hier', pos: 'adv', gloss: /here/ }]] },
  { text: 'Welches Kleid gefällt dir besser?', cards: [['Welches', { lemma: 'welcher', pos: 'det', gloss: /which/ }], ['dir', { lemma: 'du', pos: 'pron' }]] },
  { text: 'Obwohl er müde war, hat er weitergearbeitet.', fire: ['G02', 'G05'] },
  // --- 長句 ---
  {
    text: 'Nachdem wir den ganzen Nachmittag im Park verbracht hatten, sind wir mit dem Bus nach Hause gefahren.', id: 'M-d',
    fire: ['G02', 'G05', 'G07', 'G08'], cards: [['verbracht', { lemma: 'verbringen', pos: 'verb' }]],
  },
  { text: 'Die Brücke, die im letzten Jahr gebaut wurde, ist schon wieder gesperrt.', fire: ['G03', 'G08'] },
  { text: 'Ich hätte dich gern angerufen, aber mein Akku war leer.', fire: ['G01', 'G12'], cards: [['mein', { lemma: 'mein', pos: 'det' }], ['aber', { lemma: 'aber', pos: 'conj' }]] },
  { text: 'Weil der Zug ausgefallen ist, komme ich heute etwas später.', fire: ['G02', 'G05'], cards: [['heute', { lemma: 'heute', pos: 'adv' }]] },
  // G19 是字形規則，放在 word 檢查（原本誤放在句型 fire 裡）
  { text: 'Das Fenster wurde von den Kindern kaputt gemacht.', fire: ['G01', 'G07', 'G13'], word: [['Kindern', { fire: ['G19'] }]] },
  { text: 'Bevor du losfährst, solltest du noch tanken.', fire: ['G02', 'G04'], cards: [['noch', { lemma: 'noch', pos: 'adv' }]] },
  { text: 'Er hat mir versprochen, das Problem bis Montag zu lösen.', fire: ['G01', 'G05', 'G14'] },
  { text: 'Man muss den Antrag ausfüllen, bevor man einen Termin bekommt.', fire: ['G01', 'G02', 'G04'], cards: [['Man', { lemma: 'man', pos: 'pron' }]] },
  {
    text: 'Das Konzert ist abgesagt worden, weil die Sängerin krank geworden ist.', id: 'P5', fire: ['G02', 'G05'],
    say: { G05: /passive/ }, notSay: { G05: /“ist” \+ “worden” is the perfect tense/ },
  },
  { text: 'Ich glaube, dass er schon angekommen ist.', fire: ['G01', 'G02', 'G05'], cards: [['dass', { lemma: 'dass', pos: 'conj' }]] },
  { text: 'Die Wohnung wird nächste Woche renoviert, deshalb ziehen wir kurz aus.', fire: ['G01', 'G06', 'G13'] },
  { text: 'Kannst du mir sagen, wann der nächste Bus abfährt?', fire: ['G04', 'G09'], cards: [['wann', { lemma: 'wann', pos: 'adv', gloss: /when/ }]] },
];

// T7 round2（docs/tester/round2/t7-zero-fabrication.txt）＋ A5 壞資料＋ M-f 英文段落
export const T7_ROUND2 = [
  { text: 'Die Plonkerheit ist heute geschlossen.', cards: [['Plonkerheit', { notfound: true }]] },
  { text: 'Wir haben die Vermurzelung beantragt.', cards: [['Vermurzelung', { notfound: true }]] },
  { text: 'Er hat gestern gestrampfelt.', cards: [['gestrampfelt', { notfound: true }]] },
  { text: 'Kannst du die Quenzelbrücke sehen?', cards: [['Quenzelbrücke', { notfound: true }]] },
  { text: 'Die Flumpenwaschbeutelverordnung gilt ab Montag.', cards: [['Flumpenwaschbeutelverordnung', { notfound: true }]] },
  { text: 'Wij hebben gisteren samen gegeten en daarna zijn we naar de bioscoop gegaan.', id: 'A5', cards: [['en', { notfound: true }], ['Wij', { notfound: true }]] },
  { text: 'Wir wohnen in St. Augustin.', id: 'A5', sentences: 1 },
  { text: 'Der Verein ist ein e.V. aus Köln.', id: 'A5', sentences: 1 },
  {
    text: 'Ich hab heute ein super wichtiges Meeting, the deadline is tomorrow and I am totally stressed, kannst du später anrufen?', id: 'M-f',
    not: ['G08'],
  },
  { text: 'Wir treffen uns z.B. am Montag, ca. um 8 Uhr, usw. mit Dr. Weber.', id: 'M-e', sentences: 1 },
];
