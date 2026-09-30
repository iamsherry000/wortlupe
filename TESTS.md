# Wortlupe — 驗收標準與測試

版本 0.2 ｜ 2026-09-26（0.1：2026-09-22）

> **測試先於實作。** 這份文件在寫任何一行 code 之前就定稿。
> 每一期實作完成，跑完對應測試組才算過。所有測試組在後續每一期都要重跑（迴歸）。
> 對應關係：`SPEC.md` 是規格（SDD）→ 本文件 §1 的情境與各 golden set 是行為規格（BDD）→ 每一條 golden 例句都是一支自動化測試，先紅再綠（TDD）。

---

## 0. 通過門檻（數字，不接受「感覺還行」）

- **T1 變化形還原**：準確率 ≥ 95%
- **T2 複合詞拆解**：正確率 ≥ 85%；拆法有歧義時「列出多種」算正確，「擅自挑一種」算錯
- **T3 OCR**：移到 P5，由 Sherry 真機素材驗；20 張截圖字元錯誤率 ≤ 2%
- **T4 可分離動詞重組**：≥ 90%；**誤拆不可分離動詞 = 直接不通過**
- **T5 名詞文法完整度**：查得到的名詞，**100%** 同時有定冠詞與複數形
- **T6 效能（離線）**：點字到卡片出現 ≤ 150 ms；飛航模式冷啟動到可貼上 ≤ 2 秒；2000 字訊息貼上到可點 ≤ 1 秒
- **T7 零編造**：**100%**。任一次把猜測當答案顯示 = 直接不通過
- **T8 穩定性**：對抗性輸入 100% 不壞頁；P5 真機連續 100 次真實使用，失敗 ≤ 1 次
- **TG 文法規則**：正向例句命中率 ≥ 90%；**負向例句 100% 不可誤觸發**（誤判比漏判嚴重，理由同 T7）
- **TN 離線**：service worker 安裝後，全部情境執行期間 App 發出的網路請求數 = 0（「問 AI」除外）。唯一例外是瀏覽器自己發的 `/sw.js` 更新檢查（版本更新就靠它；斷網時安靜失敗，S07 已驗）。請求數在伺服器端計算
- **TE 口語**：§6 口語組 100% 不壞、縮寫全部還原
- **TH 集外驗收（2026-09-26 新增，P2 Tester 驗收不通過後訂定）**：golden set 只證明 RD 過了自己看過的考題。每一期由 Tester 另寫一份 **RD 看不到的集外句組**（≥ 40 句真實德文），規則誤觸發（自信但講錯）≤ 2%，字卡首要讀法錯誤 = 0。上一輪的集外句組在驗收後**轉進迴歸測試**（`tests/regression/`），RD 可以看；下一輪 Tester 必須寫新的一組。方法論：機器學習的 train / test split（holdout set），防止「對考題過擬合」
- **TC 字卡內容**：代名詞、冠詞、介系詞、縮寫這類高頻功能詞，首要讀法必須正確（er → he、mein → my、im → in dem）

---

## 1. BDD 情境（端對端，Playwright WebKit）

```gherkin
功能: 點字查詢與文法講解

  場景: S01 名詞顯示冠詞、複數與解釋
    假設 我貼上 "Das Haus ist groß."
    當 我點 "Haus"
    那麼 卡片顯示 "das Haus"、複數 "Häuser" 和 "house"

  場景: S02 變化形顯示原形與變化說明
    假設 我貼上 "Wir gingen nach Hause."
    當 我點 "gingen"
    那麼 卡片顯示原形 "gehen"、"past tense" 和 "to go"

  場景: S03 同形多義全部列出
    假設 我貼上 "Die Bank ist geschlossen."
    當 我點 "Bank"
    那麼 卡片同時列出 "bench" 和 "bank"

  場景: S04 句首大寫的動詞也查得到
    假設 我貼上 "Kommst du morgen?"
    當 我點 "Kommst"
    那麼 卡片顯示原形 "kommen"

  場景: S05 可分離動詞提示
    假設 我貼上 "Ich rufe dich morgen an."
    當 我點 "rufe"
    那麼 卡片提示 "anrufen"，解釋是 "to call"
    而且 "an" 用虛線連回 "rufe"

  場景: S06 查不到的字不編造
    假設 我貼上 "Hallo Jonas 😊 https://x.de 15 Uhr"
    當 我點 "Jonas"
    那麼 卡片顯示 "Not in dictionary"，沒有任何文法欄位
    而且 表情符號、網址、數字都不能點

  場景: S07 離線可用
    假設 App 已安裝過，網路中斷
    當 我重新開啟、貼上文字並點一個字
    那麼 照常顯示卡片，而且沒有任何網路請求

  # S08 屬 P4（生字本），P1–P3 期間標 fixme
  場景: S08 存生字以原形去重
    假設 我已經存過 "gingen"
    當 我在另一句話裡存 "ging"
    那麼 生字本只有一筆 "gehen"，底下有兩個原句

  場景: S09 句子文法講解
    假設 我貼上 "Ich bleibe zu Hause, weil ich krank bin."
    當 我按第一句的 "Grammar"
    那麼 列出 G01 與 G02
    而且 G02 的講解引用 "weil" 和 "bin"，並標記 "bin" 在從句句尾

  場景: S10 沒有規則命中就誠實說
    假設 我貼上 "Alles klar 👍"
    當 我按 "Grammar"
    那麼 顯示 "No rule matched for this sentence"
```

---

## 2. T1 — 變化形還原（Golden Set A）

格式：`句子` → `目標詞` → `期望原形 + 期望標註`

- Ich **ging** gestern nach Hause. → gehen（過去式・第一人稱單數）
- Wir wohnen in zwei **Häusern**. → Haus（複數・第三格）
- Das ist die **bessere** Lösung. → gut（比較級・形容詞變格）
- Er **wurde** krank. → werden（過去式）
- Sie hat mit den **Kindern** gespielt. → Kind（複數・第三格）
- Sie hat mit den Kindern **gespielt**. → spielen（過去分詞）
- Der **größte** Fehler war die Eile. → groß（最高級）
- Ich **las** das Buch zu Ende. → lesen（過去式）
- Hast du das **gewusst**? → wissen（過去分詞，不規則）
- Den **Männern** gefällt es nicht. → Mann（複數・第三格）
- **Gib** mir bitte das Salz. → geben（命令式）
- Wenn ich Zeit **hätte**, käme ich. → haben（第二虛擬式）
- Die **Vereinigten** Staaten. → vereinigen（過去分詞當形容詞）

陷阱項：

- Ich **esse** gern. → essen ＜不可還原成「Esse」（煙囪）＞
- Das **Band** war blau. → das Band（帶子）＜不可還原成 die Band／der Band；無法判斷須標歧義＞

---

## 3. TG — 文法規則（Golden Set G，9/26 新增）

每條規則至少一個正向、一個負向。負向項＝這條規則**不准**觸發。

- **G01 V2**：＋ `Morgen gehe ich ins Kino.`（gehe 第二位，倒裝）／－ `Gehst du morgen ins Kino?`（這是 G09）
- **G02 從句動詞句尾**：＋ `Ich bleibe zu Hause, weil ich krank bin.`／－ `Ich bin krank, aber ich komme.`、`Ich komme nicht, denn ich bin krank.`（aber / denn 是對等連接詞，動詞不後移）
- **G03 關係子句**：＋ `Das ist der Mann, der hier wohnt.`／－ `Der Mann wohnt hier.`（der 是冠詞）
- **G04 情態動詞框架**：＋ `Ich muss heute arbeiten.`／－ `Ich muss los.`（句尾不是原形動詞，不可聲稱有原形動詞）
- **G05 完成式**：＋ `Wir sind nach Berlin gefahren.`（sein：移動）、`Ich habe das Buch gelesen.`／－ `Ich habe ein Auto.`（haben 是主要動詞）
- **G06 可分離動詞**：與 T4 共用
- **G07 介系詞支配格**：＋ `Ich fahre mit dem Bus.`（Dat）、`Ich gehe in die Stadt.`（Wechsel・方向→Akk）、`Ich bin in der Stadt.`（Wechsel・位置→Dat）／－ `Ich lerne, um Geld zu verdienen.`（um … zu 是 G14，不是 um＋Akk）
- **G08 縮寫**：＋ `Ich bin im Büro.`（im = in dem）／－ `Wir essen im Imbiss.` 只能在 `im` 觸發，不可在 `Imbiss` 內部觸發
- **G09 是非問句**：＋ `Hast du Zeit?`／－ `Was machst du?`（W 問句是 V2）
- **G10 命令式**：＋ `Komm bitte her!`、`Gib mir das Salz.`／－ `Kommst du?`
- **G11 否定**：＋ `Ich habe keine Zeit.`、`Ich komme nicht.`／－ `Nichts ist passiert.`（nichts 不是 nicht）
- **G12 第二虛擬式**：＋ `Ich würde gern kommen.`、`Könnten Sie mir helfen?`／－ `Ich konnte nicht kommen.`（過去式，沒有變音，不是虛擬式）
- **G13 被動式**：＋ `Das Haus wird gebaut.`／－ `Er wird Lehrer.`（成為）、`Ich werde morgen kommen.`（未來式）
- **G14 zu＋原形**：＋ `Ich habe keine Lust, heute zu kochen.`／－ `Ich gehe zu Anna.`、`Ich fahre zum Bahnhof.`（介系詞 zu）
- **G15 冠詞變格**：＋ `Ich gebe dem Mann das Buch.` → dem = 陽性第三格，因為是 geben 的間接受詞／－ `Die Frau sieht die Kinder.` 兩個 die 的格無法單靠字形決定時，必須列出可能性，不可斷言
- **G16 形容詞詞尾**：＋ `ein großer Mann`（混合變化・陽性主格 -er）、`mit dem großen Mann`（弱變化 -en）
- **G17 名詞詞尾判性別**：＋ `die Zeitung`（-ung）、`das Mädchen`（-chen）／－ `der Sprung`（-ung 是字根不是詞尾，字典說 der，**不可**套 -ung 規則解釋）
- **G18 動詞人稱詞尾**：＋ `Du fährst morgen.` → fahren，du -st＋a→ä
- **G19 複數第三格 -n**：＋ `mit den Kindern`
- **G20 所有格 -s/-es**：＋ `das Auto des Mannes`

---

## 4. T2 — 複合詞拆解（Golden Set B）

- **Krankenversicherungskarte** → krank / Versicherung / `-s-`（連接音）/ Karte ⇒ **die**（尾字 Karte 決定）
- **Aufenthaltserlaubnis** → Aufenthalt / `-s-` / Erlaubnis ⇒ die
- **Geschwindigkeitsbegrenzung** → Geschwindigkeit / `-s-` / Begrenzung ⇒ die
- **Lebensmittelgeschäft** → Leben / `-s-` / Mittel / Geschäft ⇒ das
- **Arbeitserlaubnis** → Arbeit / `-s-` / Erlaubnis ⇒ die
- **Anmeldebestätigung** → anmelden / Bestätigung ⇒ die
- **Kindergarten** → Kind / `-er-` / Garten ⇒ der
- **Haustürschlüssel** → Haus / Tür / Schlüssel ⇒ der
- **Versicherungsnummer** → Versicherung / `-s-` / Nummer ⇒ die

極端壓力（不計入通過率，只看會不會整個掛掉）：

- **Bundesausbildungsförderungsgesetz**
- **Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz**

歧義項（**必須列出兩種**）：

- **Wachstube** → Wach + Stube（警衛室）／ Wachs + Tube（蠟管）
- **Staubecken** → Stau + Becken（蓄水池）／ Staub + Ecken（灰塵角落）

負向項（**不可硬拆**）：**Fenster**、**Computer**、**Kartoffel**

---

## 5. T4 — 可分離動詞（Golden Set D）

必須重組：

- Ich **stehe** um sieben Uhr **auf**. → aufstehen
- **Rufst** du mich morgen **an**? → anrufen
- Der Zug **fährt** gleich **ab**. → abfahren
- **Mach** bitte das Fenster **zu**. → zumachen
- Ich **kaufe** heute Nachmittag **ein**. → einkaufen
- Wann **fängt** der Film **an**? → anfangen

**不可**重組（誤拆 = 直接不通過）：

- Ich **verstehe** das nicht. → verstehen（`ver-` 不可分離）
- Er **bekommt** ein Paket. → bekommen
- Sie **erzählt** eine Geschichte. → erzählen
- Das Auto ist teuer, **aber** schön. → `aber` 是連接詞
- ..., weil ich um sieben **aufstehe**. → 從句中已合體，不可再拆

---

## 6. TE — 真實 WhatsApp 口語（Golden Set E）

必須不壞，且縮寫要還原：

- `Hey, kommst du heut Abend? Ich hab nix vor 😅` → heut→heute、hab→habe、nix→nichts
- `Ne, ich kann leider nicht, muss noch arbeiten.` → Ne→Nein
- `Kannste mir kurz helfen?` → Kannste→Kannst du
- `Alles klar, dann machen wir das so 👍`
- `Bis später! 👋`
- `Moin! Wie gehts?` → gehts→geht es

---

## 7. T7 — 零編造（最高優先）

每一項都必須明確回 "Not in dictionary"，不准生出任何文法欄位：

- `Blarkenschaft`、`Quimbertung`、`asdfghjkl`
- `Schmurgelverwaltungsanstalt`（像真的複合詞但不存在，最危險）
- 荷蘭文 `Ik ga morgen naar huis.`

最後兩項允許「拆解結果標 Guess、且明確標註查不到」，不允許「當已知詞顯示完整文法卡」。

---

## 8. T8 — 穩定性（沿用 talkToMe 換引擎的教訓）

> 2026-09-21 OpenVINO 上線當天炸掉，因為 bench 只跑四段乾淨素材。**只量準確率與速度不算驗過。**

自動化必測（P1 起每期迴歸）：

- 只有 emoji、空白、純數字、2000 字以上、德英混雜 `Ich hab das Meeting gecancelt.`、荷蘭文 → 頁面不壞、給可讀訊息
- 字典檔載入失敗（模擬檔案毀損）→ 明確錯誤訊息，不可空白頁
- 剪貼簿權限被拒 → 提示改用手動貼進文字框

真機（P5，Sherry）：連續 100 次真實使用，失敗 ≤ 1 次；失敗輸入自動存本機，可匯出重跑。

---

## 9. T3 — OCR 與捷徑（P5，需真機）

20 張真實截圖，Sherry 提供：WhatsApp 淺色／深色、全變音符號句 `Die Bäckerei öffnet um fünf Uhr, die Straße ist groß.`、換行連字號 `Versiche-`/`rung`、官方信件 PDF、手拍紙本信件、全大寫 `ACHTUNG BAUSTELLE`。對抗性：只有 emoji、空白畫面、模糊照片。

---

## 10. 驗收責任歸屬

- **P0–P4**：Charles 自己驗。所有 golden set 與 BDD 情境寫成自動化測試（Vitest＋Playwright WebKit），本機跑，不需要 Sherry 介入。
- **P5**：**只有 Sherry 能驗**（Charles 沒有 iPhone）。交付時必須標「未驗證」。
- WebKit 模擬通過 ≠ iPhone 驗過。

---

## 11. 這份測試設計的方法論

**負向測試與正向測試同等份量。** 這個產品的失敗模式不是「查不到」，而是「自信地給錯答案」。對 A1 學習者，錯的文法會被當真背起來。所以 T7 與 TG 負向項都是 100% 門檻。

通用原則：**當使用者無法判斷輸出對錯時，「不知道」必須是一等公民的輸出，而不是 fallback。**

---

## 12. TK — 單字本：批次貼上＋熟悉度複習（P6，2026-09-29 新增，對應 SPEC §5.1）

**門檻**

- **TK 分界**：Golden Set K 每一行「德文段／Sherry 的解釋」切對 ≥ 95%；切不確定的必須標 "Check split"，**切錯卻沒標＝不通過**（同 T7 的邏輯：自信地切錯比說不確定嚴重）
- **TK 原樣**：Sherry 寫的解釋存進去、顯示出來、匯出後，跟她貼上的逐字相同 **100%**（含中文、錯字、標點、大小寫）
- **TK 零編造**：查不到的德文不得出現任何文法欄位 **100%**（T7 迴歸）
- **TK 效能**：300 行貼上到預覽 ≤ 2 秒；翻卡 ≤ 100 ms
- **TK 離線**：TN 照舊為 0

```gherkin
功能: 單字本批次貼上與熟悉度複習

  場景: S12 夾雜輸入切出德文與原樣解釋
    假設 我在單字本貼上
      """
      die Rechnung bill 帳單
      aufstehen - 起床
      der Termin: appointment
      """
    當 預覽出現
    那麼 有三筆：
      | 德文          | Your note     |
      | die Rechnung  | bill 帳單     |
      | aufstehen     | 起床          |
      | der Termin    | appointment   |
    而且 每筆的 Your note 跟我貼的逐字相同

  場景: S13 沒附解釋的字由字典補，變化形存原形
    假設 我貼上 "Kündigungsfrist" 和 "gingen"
    當 預覽出現
    那麼 "Kündigungsfrist" 顯示 "die"、複數與字典英文，Your note 是空的
    而且 "gingen" 顯示 "gingen → gehen"，存進去的是 "gehen"

  場景: S14 查不到的字不編造
    假設 我貼上 "Blarkenschaft - 亂打的"
    當 我匯入並在複習時翻到它
    那麼 背面只有 "亂打的" 和 "Not in dictionary"，沒有冠詞、詞性或英文

  場景: S15 冠詞打錯不默默改
    假設 我貼上 "der Rechnung - 帳單"
    當 預覽出現
    那麼 這筆標紅 "Article: die (you wrote der)"
    而且 我的解釋 "帳單" 不變

  場景: S16 德英同形不猜分界
    假設 我貼上 "gehen will go"
    當 預覽出現
    那麼 這筆標 "Check split"，要我點一下決定分界

  場景: S17 重複的字不新增、熟悉度不歸零
    假設 "gehen" 已在 Almost 組
    當 我再貼上 "ging - 走（過去式）" 並匯入
    那麼 單字本只有一筆 "gehen"，Your note 多了 "走（過去式）"
    而且 它還在 Almost 組

  場景: S18 答對往上、答錯退回
    假設 "die Rechnung" 在 Familiar 組
    當 複習時我按 "Know it"
    那麼 它移到 Almost，下次到期是 7 天後
    當 下次複習我按 "Forgot"
    那麼 它回到 Learning，而且這次複習結束前會再出一次

  場景: S20 Sherry 9/30 真實樣本（解釋在下一行、空行、錯字、片語）
    假設 我貼上
      """
      lebe seit

      bald

      soon

      feiern

      Party machen

      feiren abend

      All das
      """
    當 預覽出現
    那麼 "soon" 掛在 "bald" 下面當 Your note，不是新的一筆
    而且 "Party machen" 沒有 "="，所以是獨立一筆
    而且 "feiren abend" 標 "Did you mean Feierabend?"，沒按之前沒有任何字典欄位
    而且 "lebe seit" 正面照原樣，底下顯示 "leben seit"
    當 我按 "Party machen" 的 "Merge into previous" 和 "Feierabend" 建議
    那麼 預覽剩五筆：lebe seit／bald‖soon／feiern‖Party machen／Feierabend／All das

  場景: S22 行首 = 一定掛到上一筆
    假設 我貼上
      """
      feiern

      = Party machen
      """
    當 預覽出現
    那麼 只有一筆 "feiern"，Your note 是 "Party machen"（= 和空白去掉）

  場景: S23 雙向考
    假設 單字本有 "die Rechnung ‖ 帳單" 和 "Kündigungsfrist"（沒有 note）
    當 我開始複習
    那麼 會出現正面 "die Rechnung" 的卡，也會出現正面 "帳單"、背面 "die Rechnung" 的卡
    而且 "Kündigungsfrist" 的反向卡正面是字典英文
    而且 反向卡按 "Know it" 只移動反向卡的組別，正向卡的組別不變

  場景: S21 拼字建議不按就不採用
    假設 我貼上 "feiren abend"
    當 我不按建議直接匯入
    那麼 存的是 "feiren abend"，標 "Not in dictionary"，沒有冠詞、詞性或英文

  場景: S19 離線複習
    假設 App 已安裝過，網路中斷
    當 我匯入 50 個字並複習 10 個
    那麼 全部正常，進度重開 App 後還在，沒有任何網路請求
```

**Golden Set K（分界，RD 可看；Tester 另寫集外組，比照 TH）**

每行期望的「德文段 ‖ Your note」（‖ 右邊空白＝沒有 note）：

- `die Rechnung bill 帳單` → `die Rechnung ‖ bill 帳單`
- `aufstehen - 起床` → `aufstehen ‖ 起床`
- `der Termin: appointment` → `der Termin ‖ appointment`
- `sich freuen auf	to look forward to`（Tab）→ `sich freuen auf ‖ to look forward to`
- `Kündigungsfrist` → `Kündigungsfrist ‖`
- `Kündigungsfrist 解約期限` → `Kündigungsfrist ‖ 解約期限`
- `anrufen = call someone` → `anrufen ‖ call someone`
- `Bescheid sagen let sb know 通知` → `Bescheid sagen ‖ let sb know 通知`
- `die Wohnung | apartment` → `die Wohnung ‖ apartment`
- `schon – already 已經` → `schon ‖ already 已經`
- `Gift poison` → `Gift ‖ poison`（Gift 是德文、poison 不是，分界清楚）
- `gehen will go` → **Check split**（will 也是德文 wollen 的形）
- `bald also soon` → **Check split**（also 也是德文）
- `Bank bench / bank` → `Bank ‖ bench / bank`
- `Arzt,Termin,Rechnung` → 三筆（K5 預設：每段都查得到才拆）
- `Arzt, Termin, blabla` → 一筆 **Check split**
- 只有 `😊`、`15`、`https://x.de` 的行 → 略過，預覽顯示「略過 3 行」

多行（9/30 起，空行不算分隔）：

- `bald` ⏎ `soon` → `bald ‖ soon`
- `Rechnung` ⏎ ⏎ `帳單` → `Rechnung ‖ 帳單`
- `feiern` ⏎ `Party machen` → 兩筆（沒有 `=`）
- `feiern` ⏎ `= Party machen` → `feiern ‖ Party machen`
- `feiern` ⏎ ⏎ `=Party machen`（= 後沒空白）→ `feiern ‖ Party machen`
- `bald` ⏎ `= soon` ⏎ `= 很快` → `bald ‖ soon ⏎ 很快`（多行解釋都掛上去，保留換行）
- 第一行就是 `= soon` → Check split
- `lebe seit` ⏎ `bald` → 兩筆，第二筆標 Merge into previous（跟上一行同形狀，不准自己判斷成解釋）
- 第一行就是 `soon` → Check split
- `feiren abend` → Did you mean `Feierabend`；`Kündigunsfrist` → Did you mean `Kündigungsfrist`；`Blarkenschaft` → 沒有建議（字典裡沒有距離 ≤ 2 的）

**Leitner 規則單元測試（Vitest，用假時鐘）**：每組 × 三個按鈕的移動與下次到期日全部列舉；Known 答對間隔 ×2、上限 180 天；每天新字上限 20；Forgot 的字當次重出一次且只重出一次。

**對抗性（T8 延伸）**：貼上 2000 行、整段 WhatsApp 對話、全中文、全英文、只有空白 → 不壞頁、給可讀訊息；IndexedDB 寫入失敗 → 明確錯誤，不可假裝已匯入。
