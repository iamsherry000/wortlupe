// P2 Tester 集外抽測句（docs/tester/sentences.txt，81 句）轉成的迴歸期望值。TESTS §0 TH：之後每一期都要跑。
// 每句可以有：
//   id      對應 Tester 報告的問題編號（B1–B6、M1–M4、D＝可延後項），沒有就是「抽測時確認沒問題」的句子
//   fire    必須觸發的規則
//   not     不可觸發的規則
//   notSay  某條規則若觸發，講解（What＋Why＋Pattern）不可出現的字樣
//   say     某條規則必須觸發，而且講解要出現的字樣
//   cards   點某個字，字卡第一個讀法的原形／詞性（TC）；notfound: true 表示必須顯示查不到（T7）
//   word    字形規則（G15–G20）：點某個字時 fire / not / notSay
// 期望值依標準德文文法逐句寫成；只要求「一定對」的項目，規則可以漏判的地方不硬性要求觸發。
export const HOLDOUT = [
  // --- G02：句首 damit / als 當副詞或介系詞 ---
  { text: 'Damit kann ich leben.', id: 'B3', fire: ['G01', 'G04'], not: ['G02'] },
  { text: 'Als Kind wollte ich Pilot werden.', id: 'B3', fire: ['G04'], not: ['G02'] },
  { text: 'Als Lehrerin muss man viel arbeiten.', id: 'B3', fire: ['G04'], not: ['G02'] },
  { text: 'Damit habe ich nicht gerechnet.', id: 'B3', fire: ['G01', 'G05', 'G11'], not: ['G02'] },
  { text: 'Wenn du willst, können wir morgen kochen.', fire: ['G02', 'G04'] },
  { text: 'Ich weiß nicht, ob er heute kommt.', fire: ['G01', 'G02', 'G11'] },
  { text: 'Er ist älter, als ich dachte.', fire: ['G01', 'G02'] },
  // --- WhatsApp 口語：省略主詞的第三人稱單數，不是命令式 ---
  { text: 'Geht klar!', id: 'B2', not: ['G10'] },
  { text: 'Stimmt, das habe ich vergessen.', id: 'B2', fire: ['G05'], not: ['G10'] },
  { text: 'Passt schon.', id: 'B2', not: ['G10'] },
  { text: 'Klingt gut!', id: 'B2', not: ['G10'] },
  { text: 'Schade, dass du nicht kommst.', id: 'B2', fire: ['G02', 'G11'], not: ['G10'] },
  { text: 'Kommt drauf an.', id: 'B2', fire: ['G06'], not: ['G10'] },
  { text: 'Freut mich!', id: 'B2', not: ['G10'] },
  { text: 'Macht nichts.', id: 'B2', not: ['G10', 'G11'] },
  { text: 'Hab einen schönen Tag!', word: [['schönen', { fire: ['G16'] }]] },
  { text: 'Sag mal, hast du heute Zeit?' },
  { text: 'Liebe Grüße und bis bald!', id: 'B2', not: ['G10'] },
  { text: 'Viele Grüße aus Berlin', id: 'B2', not: ['G10'] },
  // --- G12：虛擬式要以原形對得上為前提 ---
  { text: 'Ich führe morgen ein Gespräch mit meinem Chef.', id: 'B6', not: ['G12'], cards: [['führe', { lemma: 'führen', pos: 'verb' }]] },
  { text: 'Wir führen ein langes Gespräch.', id: 'B6', not: ['G12'], cards: [['führen', { lemma: 'führen', pos: 'verb' }]] },
  { text: 'Ich wollte dich fragen, ob du Zeit hast.', fire: ['G02', 'G04'], not: ['G12'] },
  { text: 'Es wäre schön, wenn du kommen könntest.', fire: ['G02', 'G12'] },
  { text: 'Ich hätte gern einen Kaffee.', fire: ['G12'] },
  { text: 'Er sollte mehr schlafen.', fire: ['G04'], not: ['G12'] },
  // --- G13：被動 vs 未來 vs 成為 ---
  { text: 'Es wird heute Abend kalt.', not: ['G13'] },
  { text: 'Ich werde dich morgen anrufen.', not: ['G13'] },
  { text: 'Er wird bestimmt Arzt.', not: ['G13'] },
  { text: 'Das Paket wurde gestern geliefert.', id: 'D', fire: ['G13'] },
  { text: 'Sie wird nächste Woche operiert.', fire: ['G13'] },
  { text: 'Ich werde das nie vergessen.', not: ['G13', 'G05'] },
  // --- G07：方向／位置只在有把握時講；時間用法不可講成地點 ---
  { text: 'Ich war vor einem Jahr in Berlin.', id: 'M1', say: { G07: /time/ }, notSay: { G07: /a location|answers wo\?/ } },
  { text: 'In der Nacht schlafe ich schlecht.', id: 'M1', say: { G07: /time/ }, notSay: { G07: /a location|answers wo\?/ } },
  { text: 'Ich lege das Handy auf den Tisch.', say: { G07: /direction/ } },
  { text: 'Das Handy liegt auf dem Tisch.', say: { G07: /location/ } },
  { text: 'Wir warten auf den Bus.', notSay: { G07: /a direction|answers wohin/ } },
  { text: 'Ich bin in die Stadt gegangen.', fire: ['G05'], say: { G07: /direction/ } },
  { text: 'Nach dem Essen gehen wir spazieren.', notSay: { G07: /a location|a direction/ } },
  // --- G15／G03：關係代名詞不是冠詞；時間受格不是直接受詞；罕用讀法不列 ---
  {
    text: 'Der Mann, der Kaffee trinkt, ist mein Vater.', id: 'M2', fire: ['G03'],
    word: [['der', { not: ['G15'] }], ['Der', { fire: ['G15'], certain: true }]],
  },
  { text: 'Ich kenne eine Frau, die Kinder hat.', id: 'M2', fire: ['G03'], word: [['die', { not: ['G15'] }]] },
  { text: 'Den ganzen Tag habe ich gearbeitet.', id: 'M2', fire: ['G05'], word: [['Den', { fire: ['G15'], say: /time/, notSay: /direct object/ }]] },
  { text: 'Ich rufe den Mann an, der hier wohnt.', fire: ['G03', 'G06'], word: [['den', { fire: ['G15'], certain: true }]] },
  // --- G20：複數 -s 不是所有格 ---
  { text: 'Wir haben zwei Autos.', id: 'B4', word: [['Autos', { not: ['G20'] }]] },
  { text: 'Ich habe zwei Handys.', id: 'B4', word: [['Handys', { not: ['G20'] }]] },
  { text: 'Die Hotels sind sehr teuer.', id: 'B4', word: [['Hotels', { not: ['G20'] }]] },
  { text: 'Das ist das Auto meines Opas.', word: [['Opas', { fire: ['G20'] }]] },
  // --- G17：名詞化動詞不套 -chen ---
  { text: 'Rauchen verboten.', word: [['Rauchen', { not: ['G17'] }]] },
  { text: 'Das Kochen macht mir Spaß.', word: [['Kochen', { not: ['G17'] }]] },
  { text: 'Beim Lachen tut mir der Bauch weh.', id: 'M4', word: [['Lachen', { not: ['G17'] }]], cards: [['Beim', { contraction: ['bei', 'dem'] }]] },
  // --- G18：所有格 ihr 不是主詞；zu 不定詞不講人稱詞尾 ---
  { text: 'Ich versuche, die Kinder zu wecken.', id: 'B5', fire: ['G14'], word: [['wecken', { not: ['G18'] }]] },
  { text: 'Ich fahre nach Hamburg, um meine Eltern zu besuchen.', id: 'B5', fire: ['G14'], word: [['besuchen', { not: ['G18'] }]] },
  { text: 'Ihr Kind spielt im Garten.', id: 'B5', word: [['spielt', { notSay: /for ihr|and ihr/ }]] },
  { text: 'Maria ruft ihr Kind.', id: 'B5', notSay: { G01: /subject “ihr”/ }, word: [['ruft', { notSay: /for ihr|and ihr/ }]] },
  { text: 'Ihr Sohn wohnt in Berlin.', id: 'B5', notSay: { G01: /subject “Ihr”/ }, word: [['wohnt', { notSay: /for ihr|and ihr/ }]] },
  { text: 'Ihr kommt morgen, oder?', not: ['G10'] },
  { text: 'Du arbeitest zu viel.', not: ['G14'], word: [['arbeitest', { fire: ['G18'] }]] },
  { text: 'Er liest gern Bücher.', word: [['liest', { fire: ['G18'] }]], cards: [['Er', { lemma: 'er', pos: 'pron' }]] },
  // --- G05：完成式 vs 狀態 ---
  { text: 'Ich bin in Taiwan geboren.', not: ['G05'] },
  { text: 'Das Geschäft ist heute geschlossen.', not: ['G05'] },
  { text: 'Die Milch ist abgelaufen.' },
  { text: 'Ich habe noch viel zu tun.', fire: ['G14'], not: ['G05'] },
  { text: 'Sie ist gestern nach Köln gefahren.', fire: ['G05'] },
  // --- G06 ---
  { text: 'Ich komme gleich wieder.', fire: ['G06'] },
  { text: 'Er sieht heute müde aus.', fire: ['G06'] },
  { text: 'Wir kommen später vorbei.', fire: ['G06'], cards: [['Wir', { lemma: 'wir', pos: 'pron' }]] },
  { text: 'Ich übersetze den Brief.', not: ['G06'], cards: [['Ich', { lemma: 'ich', pos: 'pron' }]] },
  // --- G14 ---
  { text: 'Das ist mir zu laut.', not: ['G14'], cards: [['mir', { lemma: 'ich', pos: 'pron' }]] },
  { text: 'Es ist schwer, Deutsch zu lernen.', fire: ['G14'] },
  { text: 'Ich habe vergessen, dich anzurufen.', fire: ['G14'] },
  // --- G11 ---
  // Why 的通則本來就會提到「kein negates a noun…」；錯的是 What 斷言 Keiner 在否定名詞
  { text: 'Keiner hat angerufen.', id: 'D', notSay: { G11: /“Keiner” negates/ } },
  { text: 'Das ist nicht nur teuer, sondern auch schlecht.', id: 'D', not: ['G11'] },
  // --- 官方信件 ---
  { text: 'Sehr geehrte Damen und Herren,' },
  { text: 'hiermit bestätigen wir den Eingang Ihrer Unterlagen.' },
  { text: 'Bitte bringen Sie Ihren Reisepass zum Termin mit.', not: ['G10'], cards: [['zum', { contraction: ['zu', 'dem'] }]] },
  { text: 'Ihr Antrag wurde genehmigt.', notSay: { G01: /subject “Ihr”/ } },
  { text: 'Mit freundlichen Grüßen', word: [['freundlichen', { fire: ['G16'] }]] },
  // --- 荷蘭文／假詞：不可有任何規則，查不到就說查不到 ---
  // P2.5：詞彙擴大到 40,000 後，stad 是真的德文字（巴伐利亞／奧地利口語的形容詞 quiet）。照 Charles 判定 3（同形的真德文字照常顯示，不算編造）
  // 改成只檢查 Wij 查不到、而且整句不觸發規則；stad 的卡片是真實條目
  { text: 'Wij wonen in de stad.', none: true, cards: [['Wij', { notfound: true }], ['wonen', { notfound: true }]] },
  { text: 'Ik heb een huis gekocht.', none: true, cards: [['Ik', { notfound: true }], ['huis', { notfound: true }]] },
  { text: 'Gestern habe ich Blarkenschaft gekauft.', fire: ['G05'], cards: [['Blarkenschaft', { notfound: true }]] },
  { text: 'Das Schmurgelverwaltungsanstalt ist geschlossen.', cards: [['Schmurgelverwaltungsanstalt', { notfound: true }]] },
  { text: 'Häuserin gingte Kinderbaum.', none: true, cards: [['Häuserin', { notfound: true }], ['gingte', { notfound: true }], ['Kinderbaum', { notfound: true }]] },
];

// RD 在 P2.1 修完後另寫的 30 句探測（不是 Tester 的題目），抓到的誤判／迴歸也鎖進來
export const RD_PROBE = [
  { text: 'Tut mir leid, ich bin spät dran.', not: ['G10'] }, // tut 是 tuten（罕用）的命令式，也是 tun 的第三人稱
  { text: 'Um acht Uhr fängt die Schule an.', fire: ['G01', 'G06'] }, // 句中的 acht（achten 的命令式）不可搶走動詞位置
  { text: 'Läuft bei dir!', not: ['G10'] },
  { text: 'Hört sich gut an.', not: ['G10'] },
  { text: 'Klappt das morgen?', fire: ['G09'], not: ['G10'] },
  { text: 'Gib mir kurz Bescheid.', fire: ['G10'] },
  // P2.3：Charles 判定 1（README 決策紀錄）後改期望值：規則動詞的命令式（schreib）沒有 ! 也沒有 bitte 時跟口語的 ich 形同形，不判斷
  { text: 'Schreib mir, wenn du da bist.', fire: ['G02'], not: ['G10'] },
  { text: 'Am Montag habe ich keine Zeit.', notSay: { G07: /a location/ } },
  { text: 'Seit einem Jahr wohne ich in Köln.', fire: ['G07'], notSay: { G07: /a location/ } },
  { text: 'Ich freue mich auf das Wochenende.', notSay: { G07: /a direction/ } },
  { text: 'Als ich klein war, wohnten wir in Hamburg.', fire: ['G02'] },
  { text: 'Der Termin wurde verschoben.', fire: ['G13'] },
  { text: 'Ihre Tochter ist sehr nett.', notSay: { G01: /subject “Ihre”/ } },
];

// TC 字卡內容：高頻功能詞的首要讀法（報告 B1、M4）
export const CARD_TC = [
  { text: 'Er kommt.', word: 'Er', lemma: 'er', pos: 'pron', gloss: /\bhe\b/, id: 'B1' },
  { text: 'Wir gehen.', word: 'Wir', lemma: 'wir', pos: 'pron', gloss: /\bwe\b/, id: 'B1' },
  { text: 'Kannst du mir helfen?', word: 'mir', lemma: 'ich', pos: 'pron', id: 'B1' },
  { text: 'Ich sehe sie morgen.', word: 'sie', lemma: 'sie', pos: 'pron', id: 'B1' },
  { text: 'Das ist mein Vater.', word: 'mein', lemma: 'mein', pos: 'det', gloss: /\bmy\b/, id: 'B1' },
  { text: 'Ich komme morgen.', word: 'Ich', lemma: 'ich', pos: 'pron', gloss: /\bI\b/, id: 'B1' },
  { text: 'Das ist unser Haus.', word: 'unser', lemma: 'unser', pos: 'det', gloss: /\bour\b/, id: 'B1' },
  { text: 'Ich gebe es dir.', word: 'dir', lemma: 'du', pos: 'pron', id: 'B1' },
  // ihm 同時是 er 與 es 的第三格，兩個都是正確的首要讀法
  { text: 'Ich helfe ihm.', word: 'ihm', lemma: ['er', 'es'], pos: 'pron', id: 'B1' },
  { text: 'Das Haus ist groß.', word: 'Das', lemma: 'der', pos: 'article', gloss: /^the$/, id: 'B1' },
  { text: 'Ich bin im Büro.', word: 'im', contraction: ['in', 'dem'], id: 'M4' },
  { text: 'Ich fahre zum Bahnhof.', word: 'zum', contraction: ['zu', 'dem'], id: 'M4' },
  { text: 'Beim Essen rede ich nicht.', word: 'Beim', contraction: ['bei', 'dem'], id: 'M4' },
  { text: 'Wir gehen ins Kino.', word: 'ins', contraction: ['in', 'das'], id: 'M4' },
  { text: 'Ich gehe zur Arbeit.', word: 'zur', contraction: ['zu', 'der'], id: 'M4' },
];
