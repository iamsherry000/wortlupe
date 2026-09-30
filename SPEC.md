# Wortlupe — 規格

版本 0.3 ｜ 2026-09-29 ｜ 0.3：新增 §5.1 單字本（批次貼上＋熟悉度複習，P6）
0.1（2026-09-22）是雲端架構；0.2 依 Sherry 9/26 拍板改成**離線優先**，見 README 決策紀錄。

開發方法：**SDD → BDD → TDD**。這份是規格（SDD）；`TESTS.md` 是把規格寫成可驗收的情境與 golden set（BDD）；實作時每條規則先寫會失敗的測試再寫程式（TDD）。

---

## 1. 硬約束（不可協商）

- **沒有 Mac** → 不能做原生 App、分享擴充、Safari 擴充套件、上 App Store。
- **iOS 不給第三方讀別的 App 的畫面文字、不給常駐浮層。** 原版 DianDu「原地浮起來」在 iOS 不存在，Wortlupe 是「送進來、在自己的頁面點」。
- **離線優先（9/26）**：安裝後，查字、變化形、文法講解全部在手機本機完成，不發任何網路請求。唯一例外是 Sherry 主動按下的「問 AI」（§7）。
- **WhatsApp 氣泡只能整則拷貝**：所以輸入單位是「整則訊息」，點字發生在 Wortlupe 裡。整則進來反而是優點：可分離動詞、從句判斷都需要整句。
- **解釋語言：英文。** 不做德中（9/26 Sherry 拍板）。

---

## 2. 架構

**純靜態 PWA，放 Cloudflare，第一次開啟後完全離線。**

- 前端：HTML + CSS + 原生 JS modules，無框架、無 runtime 依賴。上線產物是純靜態檔。
- 開發依賴：Node 24 + Vitest（單元）+ Playwright WebKit（端對端）。**這是 Sherry 核准的例外**（RD 預設不用 npm），因為 TDD / BDD 需要測試框架；上線產物不含任何 npm 套件。
- 部署：`npx wrangler deploy`（靜態資源，跟 Season 33 同一套）。伺服器上只有程式與字典，**沒有任何使用者資料**。
- 離線：service worker 預先快取所有程式與字典檔，版本號變更才更新。
- 本機儲存：IndexedDB（生字本、失敗紀錄、設定）；啟動時呼叫 `navigator.storage.persist()`。

### 資料流

```
WhatsApp 長按 → 拷貝 → 開主畫面的 Wortlupe → 按「貼上」
                                     │
         斷詞 → 查詢（變化形表 → 原形表）→ 句子層分析（可分離動詞、文法規則）
                                     │
                          閱讀頁：每個字可點、每句可展開文法
```

### 為什麼預設是「貼上」而不是分享選單

iOS 上，主畫面 App 和 Safari 的儲存空間分開。捷徑用「打開網址」丟文字進來會開在 Safari，生字本就分裂成兩份；Safari 對一般網站還有「7 天沒開就可能清掉資料」的機制。貼上路線全程在主畫面 App 內，儲存只有一份。捷徑路線留到 P5 由 Sherry 真機 spike 後再決定。

---

## 3. 資料

- **主要來源**：kaikki.org 從**英文** Wiktionary 抽出的德文條目（wiktextract JSONL，CC BY-SA）。0.1 寫的是德文 Wiktionary，已更正：要英文解釋，就該用英文 Wiktionary 的德文條目。一份資料同時給原形、詞性、性別、複數、完整變化表（含 tags：格、數、人稱、時態）、英文義項。
- **詞彙範圍（2026-09-27 Sherry 拍板擴大到 A1–C1）**：依德文詞頻表取前約 **40,000 個原形**＋它們的全部變化形（P0 原本是 15,000，只到 A1–B1）。詞頻表改用 hermitdave FrequencyWords 的**完整版** `de_full.txt`（CC BY-SA 4.0；50k 版換算成原形不夠到 C1）。
- **C1 涵蓋率驗收（TV）**：沒有公開的德文 C1 詞表，所以用「真實 C1 程度文本的字詞涵蓋率」量：Tester 取德文維基百科條目段落（CC BY-SA）與官方信件、報紙評論風格文本共 ≥ 3,000 個字詞，扣掉人名、地名、數字後，≥ 97% 查得到原形（複合詞拆解 P3 上線後再加計）。
- **建置產物**（`data/` 下，由 `build/` 的 Node 腳本產生，產物進版控，原始 dump 不進）：
  - `forms.json`：變化形 → [{lemma, pos, tags, i}]，`i` 指向 lexicon 陣列中的第幾個條目（讓 Bänder 只對到 das Band）
  - `lexicon.json`：原形 → **陣列** [{pos, gender[], plural[], noPlural, glosses[≤3], verb: {separable, prefix, irregular, principalParts, auxiliary}, adj: {comparative, superlative}, prep: {case}}]。陣列是因為同形異義要全部列出（§4.1-10）
  - `colloquial.json`：WhatsApp 口語縮寫 → 還原（手寫，TESTS §6）
  - `prepositions.json`：A1–B1 介系詞 → 支配的格（Akk / Dat / Gen / Wechsel），約 30 個，**手寫**。英文 Wiktionary 幾乎沒標介系詞的格（P0 實測 87 個只有 3 個有），字卡第 7 欄與 G07 靠這份
- **收錄規則（P0 定案）**：人名、地名不收（S06：Jonas 要顯示查不到；副作用是 Berlin 也查不到，可接受）；缺冠詞或複數資料的名詞不收（清單在 `build/build-report.json`）；字典明確標「沒有複數」的名詞算有答案。
- **候選排序（P1 必做）**：同一個字有多種讀法時，依原形詞頻排序；標 rare / archaic / obsolete 的讀法收進「其他讀法」，不在字卡第一屏（例：`heute` 第一個是副詞 today，不是 heuen 的過去式）。義項順序以最常用義為先，Wiktionary 原順序不理想時（例：fahren 第一義是 "to go at speed"），用手寫覆寫表 `gloss-overrides.json` 修正，只收 A1–B1 高頻動詞。
- **大小上限**：`data/` 上線部分 gzip 後 ≤ 25 MB（9/27 因 A1–C1 從 15 MB 放寬）；單一檔案 < 25 MiB（Cloudflare 上限）。超過就縮詞彙範圍，不縮欄位。
- **明確排除**：dict.cc（條款禁止再散布）、HanDeDict（中→德，用不到）。

---

## 4. 閱讀頁規格

深色模式自適應、手機直式優先、原文保留原始換行、字級可讀（≥ 18px）。

### 4.1 字層：點任一個字出卡片

卡片是底部面板，擋到被點的字就移到上方。◀ ▶ 逐字移動。欄位照順序，**有就顯示，沒有就不顯示，不編造**：

1. 原形（Lemma）——地基，一定要有，否則整張卡改成「查不到」
2. 這個形是什麼（例：`Häusern` ＝ Haus・plural・dative）
3. 詞性
4. 名詞：定冠詞＋複數形（兩者缺一不可，T5）
5. 動詞：可分離（＋前綴）｜不規則（＋三態）｜完成式助動詞 haben/sein
6. 形容詞：原級／比較級／最高級
7. 介系詞：支配的格（Akk / Dat / Wechsel）
8. 複合詞拆解（§4.3）
9. 英文解釋，最多三個義項
10. 同形多義：全部列出，不擅自挑一個（例 `Bank`）
11. 「存生字」按鈕

### 4.2 句子層：文法講解（9/26 新增，核心功能）

Sherry 要的不只是單字，而是「**為什麼這樣寫**」。離線做法是**規則引擎**：每條規則＝偵測器＋英文講解模板＋例句。

- 每句旁邊有一個「Grammar」按鈕，展開後列出這句命中的所有規則。
- 每條講解三段：**What**（這句裡發生了什麼，直接引用句中的字）→ **Why**（德文為什麼這樣規定）→ **Pattern**（套用公式）。
- 句中對應的字要標記（例：V2 動詞底線、句尾動詞另一種底線、從句淡底色、可分離前綴虛線連回主動詞）。
- **沒有規則命中就誠實顯示 "No rule matched for this sentence"**，不編。
- 講解文字不給發音。

MVP 規則清單（A1–B1，每條都要有 golden set 正向＋負向例句，TESTS §3）：

- G01 主句動詞第二位（V2），含倒裝：`Morgen gehe ich …`
- G02 從句動詞放句尾：weil / dass / wenn / ob / als / obwohl / damit / bevor / nachdem
- G03 關係子句動詞放句尾：逗號後的 der / die / das / den / dem / deren / dessen
- G04 情態動詞＋原形動詞放句尾（Satzklammer）
- G05 完成式：haben / sein ＋過去分詞放句尾；講清楚什麼時候用 sein（移動、狀態改變）
- G06 可分離動詞：前綴跑到句尾（與 T4 共用偵測）
- G07 介系詞支配的格：Dativ 組、Akkusativ 組、Wechsel 組（位置用 Dat、方向用 Akk）
- G08 介系詞縮寫：im / am / zum / zur / ins / beim / vom
- G09 是非問句：動詞放第一位
- G10 命令式
- G11 否定：nicht 與 kein 的分工
- G12 第二虛擬式：würde＋原形、hätte / wäre / könnte（禮貌或假設）
- G13 被動式：werden＋過去分詞
- G14 zu＋原形動詞

字形層規則（Sherry 9/26：「大部分的德文規則都有特定規則可以遵守」→ 不只講句型，連「這個字為什麼長這樣」都要講）。這些掛在**字卡**上，不在句子按鈕裡：

- G15 冠詞變格：`dem` / `den` / `des` / `einem` … 為什麼是這個形（性別 × 格 × 數，並指出是誰決定了格：介系詞、動詞、主詞／受詞位置）
- G16 形容詞詞尾：強／弱／混合變化，指出決定詞尾的冠詞（`ein großer Mann` vs `der große Mann`）
- G17 名詞詞尾判性別：-ung / -heit / -keit / -schaft / -ion / -tät → die；-chen / -lein → das；-er（動作者）/ -ling / -ismus → der。字典性別優先，規則只用來**解釋**，不用來猜
- G18 動詞人稱詞尾：ich -e / du -st / er -t / wir -en / ihr -t / sie -en，含 du/er 母音變化（`fahren → fährt`）
- G19 名詞複數第三格加 -n（`den Kindern`）
- G20 所有格 -s / -es（`des Mannes`）

**規則目錄可擴充**：每條規則是 `rules/` 下一個獨立模組（id、偵測器、講解模板、正向＋負向測試例句），新增一條規則＝新增一個檔案＋它的測試，不動引擎本體。

規則只在偵測有把握時顯示。**誤判（把不是這個句型的句子標成這個句型）比漏判嚴重**，門檻見 TESTS §0。

### 4.3 複合詞拆解

名詞查不到原形、或長度 ≥ 12 字母時嘗試：

- 切成組成部分，連接音（`-s-` `-es-` `-n-` `-en-` `-er-`）獨立標出並寫明「只是連接音，沒有意思」。
- 每一塊給原形與英文。
- 卡片上直接寫規則：**最後一塊決定整個詞的性別與意思**。
- 拆法不唯一就全部列出（`Wachstube`）。
- 拆出來的詞若本身不在字典，卡片標 "Guess (not in dictionary)"，不給完整文法卡（T7）。

### 4.4 零編造原則（硬規則）

查不到就顯示 "Not in dictionary"，旁邊是「問 AI」按鈕（§7）。**絕不用聽起來合理的猜測填滿欄位。** 對 A1–B1 學習者，一個自信的錯誤答案比沒有答案傷害大一個數量級。T7 是 100% 門檻。

### 4.5 字卡只講「這句裡」＋用法（P2.6，2026-09-27 Sherry 拍板）

起因：點 `freuen` 出現五組形容詞比較級標籤（快取混版 bug，見 §6），但 Sherry 同時指出：就算標籤正確，列出一個字**理論上所有可能的形**對學習者沒有意義。

**A. 這句裡的形（欄位 2 改寫）**

- 句子證據能決定時，欄位 2 只顯示「這句裡的那個形」，其他可能的形收進摺疊的 "Other possible forms (N)"。
- 證據來源（全部是既有偵測，不新增猜測）：
  - 變位動詞：子句裡看得到、人稱對得上的主詞（代名詞或名詞）→ 只留人稱／數相符的直述式形；直述式對不上才留虛擬式。人稱後面附代名詞提示（`1st person · plural (wir)`）
  - 原形：G04（情態動詞＋原形）、G14（zu＋原形）指到這個字
  - 過去分詞：G05／G13 指到這個字
  - 命令式：G10 指到這個字
  - 形容詞：G16 已確定的性別／格／數／變化類型
  - 名詞：G15 確定（certain）的格；G19 複數第三格；G20 單數所有格
  - 冠詞類：G15 確定的那一組
- 決定不了：可能的形 ≤ 2 照列；> 2 顯示 "N possible forms — the sentence doesn't decide"，展開才看得到清單。**不從詞頻或慣例挑一個當答案**（§4.4）。

**B. 用法（新欄位）**

- 對得上這句的那條放在欄位 2 正下方，標題 "Meaning in this sentence"（它就是這句裡的意思；字典第一個義項 freuen = to gladden 在這句是錯的）；其餘用法接在英文解釋後面，不重複。

- 資料來源：Wiktionary 義項上的 `reflexive` 標記與 `+obj` 模板（介系詞＋格、或只標格），外加該義項第一個有英譯的例句，建置時從 kaikki 全量檔抽出；模板裡的介系詞要在字典裡真的是介系詞才收。
- **手寫補充**（Sherry 9/27：「沒被 Wiktionary 標記的字要自己寫好」）：`build/usage-manual.json`，範圍是 A1–B2 常用的固定介系詞搭配與反身動詞（動詞、形容詞、名詞），每條都附例句＋英譯。Wiktionary 已有同一句型就不重複，只補它缺的例句；資料裡標 `src: manual`。跟 gloss-overrides 一樣屬於手寫表，不算編造。
- 句中縮寫（vom、zum、beim…）算那個介系詞；可分離動詞用重組後的原形查（hängt … ab → abhängen）；`es geht um` 這類要子句裡有 es 才算對得上。
- 顯示成句型：`sich freuen auf + accusative — to look forward to`，下接例句。最多 4 條。
- 「對得上這句」的判準：需要 sich 時子句裡要有反身代名詞（mich／dich／sich／uns／euch），需要介系詞時子句裡要有那個介系詞或 da(r)-／wo(r)- 複合形（darauf、worüber）。沒有任何一條對得上就照 Wiktionary 順序，不標。

### 4.6 整句翻譯（P2.7，2026-09-28 Sherry 拍板路線 1：離線模型）

- 模型：Firefox Translations de→en＋Bergamot 引擎（Mozilla，MPL-2.0），約 41 MB。鎖定版本＋sha256（`build/fetch-mt.mjs`），模型切兩片以符合 Cloudflare 單檔 25 MiB。About 標授權。
- 位置：**按 Read 後，閱讀頁每一段下面直接一行英文**（Sherry 9/29），字照樣點、Grammar 照樣按；可 Hide/Show。Grammar 面板**不重複**顯示翻譯（Sherry 9/29）。
- **第一次按 "Download translation (41 MB, once)" 才下載**，存在獨立快取 `wortlupe-mt`，App 換版不清；之後完全離線。沒按之前不發任何請求（TN 照舊為 0）。離線且沒下載過：按鈕停用並說明。
- 送進模型前先還原口語**拼寫**（`src/mt-normalize.js`）：colloquial 表中沒有歧義的條目（hab→habe、grad→gerade）、drauf→darauf 類、字典只列成命令式的動詞＋mich（freu mich→freue mich）。**不改意思**：慣用語（Bock auf、kein Ding）照原樣送。有還原時顯示 "Read as: …"。
- 翻譯下固定標 "Machine translation, offline. It can be wrong, especially for chat slang"。這是唯一不走「查得到出處」的欄位，所以標示是硬規則。
- 模型翻不好的慣用語，補進手寫用法表（§4.5 B，`with` 條件：kein Ding 要有 kein、alles klar 要有 alles）。
- 未驗證：iPhone 真機上的下載時間、翻譯速度、iOS 會不會清掉 41 MB 快取（已請求 persistent storage）。

## 6.1 字典版本一致（P2.6 修）

- 每一片字形檔帶標籤表的指紋（`#tagsets`），載入時比對；對不上＝手機快取混到兩個版本 → 清掉快取重新載入一次（有網路時），離線則顯示可讀訊息，**不可**用錯的標籤表解讀。
- service worker 安裝時繞過 HTTP 快取（`cache: 'reload'`），快取版本名帶資料指紋，資料重建就自動換版。

---

## 5. 生字本

- 以**原形**去重；同一原形存多次時，累加「原句＋日期」。
- 原句只存在手機本機。
- 匯出：一鍵拷貝為 Markdown（原形｜詞性｜英文｜原句），匯出後接到哪裡 P4 再談。

### 5.1 單字本：批次貼上＋按熟悉度複習（P6，2026-09-29 Sherry 拍板）

Sherry 要的：「我可以直接複製貼上一堆，他會直接幫我分類」。分類＝**按熟悉度**（不是按主題、不是按詞性）；載體＝Wortlupe 加一個分頁，共用字典層，離線。

**儲存**：跟 §5 生字本是**同一份清單**（以原形去重）。閱讀頁「存生字」和批次貼上是兩個入口，進的是同一本。〔待拍板 K1〕

**A. 批次貼上（Import）**

輸入是一大塊文字，德文、英文、中文夾雜，例：

```
die Rechnung bill 帳單
aufstehen - 起床
der Termin: appointment
Kündigungsfrist
sich freuen auf	to look forward to
```

Sherry 9/30 給的真實樣本（每項一行、中間有空行、解釋常在**下一行**）：

```
lebe seit

bald

soon

feiern

Party machen

feiren abend

All das
```

期望預覽：`lebe seit` ‖ ／ `bald` ‖ soon ／ `feiern` ‖ ／ `Party machen`（沒打 `=`，所以獨立一筆；之後她會寫成 `= Party machen`）／ `feiren abend`（標 Did you mean Feierabend?）／ `All das` ‖。

- **切筆規則（9/30 改，取代原本的「一行一筆」）**：空行不算分隔，只當成換行。每一行先判斷是德文行還是解釋行：
  - 同一行裡有分隔符號或中文 → 照下面的同行規則切
  - 整行是英文或中文（字典查不到德文）→ **解釋行，掛到上一筆德文下面**（`bald` / `soon`）
  - **行首是 `=` → 一定是上一筆的解釋**（K6，Sherry 9/30 拍板「我每次打 =」）。`=` 與後面的空白去掉，其餘原樣存：`feiern` ⏎ `= Party machen` → `feiern ‖ Party machen`。
  - 德文行後面緊接的**下一行也是德文、而且沒有 `=`** → 各自一筆。理由：`lebe seit`→`bald`（兩個字）與 `feiern`→`Party machen`（德文解釋德文）形狀完全一樣，要懂意思才分得出來，離線規則做不到，所以靠 Sherry 的 `=` 記號，不猜。預覽每筆仍有「Merge into previous」按鈕，忘了打 `=` 時補救用
  - 預覽每筆也有「Split into new word」，把掛錯的解釋拆出來
  - 檔案第一行就是解釋行（上面沒有德文）→ 標 "Check split"
- 只有 emoji／數字／網址的行略過，並在預覽裡列為「略過 N 行」。
- **有分隔符號的行**：第一個 ` - `、` – `、`—`、`:`、`=`、`|`、Tab 左邊是德文，右邊是 Sherry 的解釋。
- **沒有分隔符號的行**：從行首往後，只要是字典查得到的德文（含冠詞 der/die/das、`sich`、可分離動詞整體）就算德文段；第一個中文字（CJK）或第一個字典查不到的字起，後面全部是解釋。
- **分界不確定時不猜**：德文段後面第一個字本身也是德文（`gehen will go` 的 `will`、`bald also soon` 的 `also`）：這一筆在預覽標黃「Check split」，由 Sherry 點一下決定分界。
- **Sherry 寫的解釋一字不改**：不翻譯、不修錯字、不轉大小寫、不刪標點，中文原樣存。§1「解釋語言：英文」管的是 Wortlupe 自己產的內容，不管 Sherry 自己寫的。
- **德文段查字典**：
  - 單字查得到 → 存原形（`gingen` → `gehen`，預覽顯示「gingen → gehen」），並帶字典的詞性、冠詞、複數、英文解釋（最多 3 個）。
  - **片語（兩個字以上，9/30 Sherry 拍板「兩個都要」）**：正面照她打的（`lebe seit`），底下一行小字是還原成原形的版本（`leben seit`）；背面逐字拆解（lebe → leben・1st person singular；seit ＋ Dativ），有 §4.5 用法表對得上的句型就一起列出。去重以原形版本為準，她打過的不同寫法都保留。
  - 查不到 → **拼字建議（9/30 Sherry 拍板）**：只從字典裡找拼法最接近的原形（編輯距離 ≤ 2，含「拆開寫的複合詞」`feiren abend` → `Feierabend`），預覽標 "Did you mean Feierabend?"，**Sherry 按了才換**；找不到或沒按 → 照原樣存，標 "Not in dictionary"，**不生任何文法欄位**（§4.4、T7）。建議不是答案：沒按之前卡片上不出現建議字的任何資料。
  - 名詞沒打冠詞 → 從字典補（`Rechnung` → `die Rechnung`）；打錯冠詞（`der Rechnung`）→ 以字典為準，預覽標紅「Article: die (you wrote der)」，不默默改掉。
- **沒有解釋的行**：背面只放字典的英文解釋；字典也查不到 → 這筆標「no meaning」，仍可匯入。
- **去重**：同一原形已在本裡 → 不新增，把新的解釋併進去（跟舊的不同才加）；熟悉度不歸零。
- **匯入前一定有預覽**：列出每一筆「德文｜Sherry 的解釋｜字典補的東西」，可刪、可改分界，按 "Add N words" 才寫入。
- 規模：一次 ≥ 300 行不能卡住或壞頁（T6 延伸：300 行貼上到預覽 ≤ 2 秒）。

**B. 熟悉度分組（Leitner 盒子）**〔待拍板 K2〕

分成看得見的五組，每組有下次複習的間隔：

- **New**：剛匯入，還沒複習過
- **Learning**（盒 1）：隔 1 天
- **Familiar**（盒 2）：隔 3 天
- **Almost**（盒 3）：隔 7 天
- **Known**（盒 4）：隔 21 天；再答對留在 Known、間隔 × 2（上限 180 天）

規則：答「Know it」→ 往上一組；答「Not sure」→ 留在原組、明天再出；答「Forgot」→ 退回 Learning、當次複習結束前再出一次。分組頁看得到每組有幾個字、點進去看清單，可手動把字移組或刪除。

**C. 複習（Review）**

- 分頁首頁顯示「今天到期 N 個」，按 Start 開始；順序：到期的舊字先、每天新字上限 20 個〔待拍板 K3〕。
- **兩個方向都考（K4，Sherry 9/30 拍板「德文跟意思可以互換考」）**：每個字有兩張卡，各自有自己的熟悉度組別，同一次複習裡混著出。
  - **德 → 意思**：正面德文（名詞連冠詞），背面意思。
  - **意思 → 德**：正面是 Your note；沒有 note 就用字典英文第一個義項；兩個都沒有 → 這個字不出這個方向。背面是德文（名詞一定連冠詞，冠詞答錯就算 Forgot 由 Sherry 自己判斷）。
  - 兩個方向都是**翻面自評**，不用打字（iPhone 打變音符號太慢；要不要改打字考等她用過再說）。
- 點一下翻面。
- 背面：Sherry 的解釋（原樣）→ 字典補的（冠詞、複數、動詞三態、英文），兩者視覺上分開，標 "Your note" / "Dictionary"。
- 背面三個按鈕：Forgot / Not sure / Know it。
- 本次複習結束顯示：複習幾個、各組變動幾個。
- 全部離線，進度存 IndexedDB（跟生字本同一個 DB）；TN 照舊為 0。
- 不做發音（§9）。

**D. 匯出**：沿用 §5 的 Markdown 匯出，加一欄「組別」與「Sherry 的解釋」。

**E. 實作後補定（2026-09-30 PM，依 RD P6.4 疑點；不改產品方向，只把 RD 的合理選擇寫成規格）**

- 分界不確定的判準：德文段後面那個字**同時**是英文字（字典英文解釋裡出現過）且其德文讀法在詞頻前 5000，才標 Check split（`bill` 是 bellen 的命令式但詞頻低 → 照常切開）。
- 解釋行 vs 打錯的德文：整行查不到時，第一個字是英文字 → 解釋行；否則當打錯的德文、給拼字建議。罕見英文字誤判時靠 Merge 補救。
- 片語拆解沒有主詞，照 §4.5 A 顯示 "N possible forms"，不挑人稱。
- Leitner：New 按 Know it → Learning（不跳級）；New 按 Not sure 留 New 但不再佔新字額度；Forgot 當次重出只是練習、不改組別；新字上限以字計，雙向算一個。
- 片語的反向卡正面用對得上的用法句型英文；沒有就不出反向卡。
- 有分隔符號但德文段整段查不到 → 整筆 Not in dictionary，不拿部分查得到的字撐場面。
- 匯出 Markdown 裡 `<br>` 與 `\|` 是表格跳脫；TK 原樣比對以 IndexedDB 內的值與畫面為準，匯出檔比對前先還原。
- **Merge into previous 不加醒目提示**（Sherry 已用 `=` 標解釋）：沒有 Your note 的德文行才顯示 Merge 按鈕，用普通樣式、卡片不亮藍框；已經有 Your note 的那筆不顯示 Merge（避免把 `bald ‖ soon` 誤併進上一筆）。

**F. P6 Tester 不通過後的修正規格（2026-09-30 PM，報告 LifeOS/…/docs/tester/P6-acceptance.md）**

- **英文字判定改用離線英文詞表**（取代 E 的「字典英文解釋裡出現過」）：內建一份公開授權的英文詞表（例：SCOWL，約 50k 字、含常見縮寫如 ID），About 標授權；跟德文字典一樣預先快取、離線。
- **不確定就標，不准靜默**：沒有分隔符號的行，只要有任何一個字「德文查不到也不是英文」（含打錯的字），或同一個字德英都成立且落在分界上，一律標 Check split。**不存在「切了但沒把握又沒標」的路徑。** `Termn appointmnet` → Check split。
- **拼字建議只修德文段，逐字建議**：只對被判成德文段的那個字給建議，絕不把後面的解釋一起「修正」（`Kühlschrnak fridge` → 只建議 Kühlschrank，fridge 仍是 note）。拆開寫的複合詞（`feiren abend`）只在整行都沒有英文字與中文時才嘗試。
- **每一筆都救得回來**：預覽每筆都有「Fix」，打開後可以（1）點字重選分界（2）併到上一筆當解釋（已有 note 的筆，Merge 收在 Fix 裡、不放在外面）（3）刪除。切錯只能刪掉重打＝不通過。
- **版面**：note 與德文段任何長度都不可撐破版面（長網址、無空白長字串要換行），390 px 寬不可橫向捲動。
- **數字要真**：預覽按鈕的 "Add N words" 是去重後實際會新增的數量（併進既有字的另外顯示 "N merged into existing"）；0 筆時按鈕停用並說明原因。匯入後首頁不可先閃舊數字。
- 行首條列符號（`-`、`•`、`*`、`1.`）去掉後再解析。
- 前後空白（含全形空白）去掉不算改字；**中間**的字元一字不動。
- **翻卡 100 ms 的定義**：點下去到新的一面開始畫出（第一個含新內容的 frame），p95 ≤ 100 ms；淡入動畫時間不算，但動畫總長 ≤ 150 ms。
- P6.6 後補定（PM 9/30，採 RD 選擇）：單獨一行、整行是德英同形常見字（`Mama`、`bald`、`Gift`）→ 當一筆德文、不標（沒有分界可切）；德英同形落在行尾 → 非封閉詞類切在它前面（`Mama ‖ mom`）、封閉詞類保留為德文，兩者都標 Check split；詞表漏字導致多標可接受（多標不算錯，切錯沒標才算）；解釋行內含德文同形字（`ID`）而多標，可接受。
- 翻卡正式量法：模擬真實使用——每次翻完等淡入結束再翻，連翻 ≥ 40 次取 p95 ≤ 100 ms；「每影格連翻」壓力測只記錄、不判定。
- **集外組也適用 TK 分界門檻**：切錯沒標在任何測試組出現都是不通過；正確率 ≥ 95% 以 Check split 算「沒切錯」。

**待拍板（PM 列給 Sherry；K1、K2、K3、K5 Sherry 未異議，照預設做）**

- K1 批次貼上的字跟閱讀頁存的生字是同一本嗎？（預設：同一本）
- K2 分幾組、間隔多久？（預設：上面五組 Leitner，看得懂為什麼這個字在這組；不用 Anki 那種算不出來的演算法）
- K3 每天新字上限？（預設 20）
- K4 ✔ 9/30：德 ↔ 意思雙向，各自計熟悉度（見 C）
- K6 ✔ 9/30：行首 `=` 表示上一筆的解釋（見 A）
- K5 一行有多個德文字、用逗號隔開（`Rechnung, Termin, Arzt`）要拆成多筆嗎？（預設：有逗號且每段都查得到才拆，否則當一筆）

---

## 6. 穩定性與失敗留存

- 對抗性輸入（只有 emoji、空白、純數字、2000 字以上、德英混雜、荷蘭文）不可讓頁面壞掉，一律給可讀訊息。
- **失敗自動留存：預設開啟，只存本機 IndexedDB**（離線後不再有隱私衝突，0.1 待拍板 2 自動解除）。設定裡可一鍵匯出或清空。

---

## 7. 「問 AI」選配（9/26 Sherry 拍板保留）

- 只在 Sherry 主動按下、而且有網路時使用；只送出**那一句**，不送整則訊息。
- 用途：查不到的字、或規則引擎沒命中的句子。
- 需要一個 Cloudflare Worker 代理和 Claude API key。**P4 才做**，開工前 Charles 要跟 Sherry 確認 API key 與費用。
- 離線或未設定時，按鈕灰掉並寫明原因。

---

## 8. 分期（RD 分期，每期 Charles 驗收，全部跑完才給 Sherry final）

**P0 資料層**：下載 kaikki 德文 dump＋詞頻表，腳本產出 `forms.json` / `lexicon.json`。
驗收：T1 變化形還原、T5 名詞完整度、大小上限。**這關過了專案才活，沒過不往下。**

**P1 閱讀頁＋點字查詢（離線）**：斷詞、查詢、字卡、貼上輸入、service worker。
驗收：BDD 情境 S01–S08 全綠（Playwright WebKit，含離線與零網路請求）、TESTS §5 口語組、T8 對抗性輸入。

**P2 文法規則引擎**：可分離動詞重組＋規則引擎 G01–G20（句型＋字形）＋句中標記。
驗收：T4、Golden Set G。

**P3 複合詞拆解**：驗收 T2、T7。

**P4 生字本＋匯出＋「問 AI」**：「問 AI」開工前先跟 Sherry 確認 API key。

**P6 單字本：批次貼上＋熟悉度複習**（§5.1，2026-09-29 新增）：排在 P2.3 收尾之後；需要 P4 的生字本儲存層，若 P4 還沒做就一起做生字本的儲存與去重（「問 AI」仍留 P4、要先問 API key）。
驗收：TESTS §12（S12–S23、Golden Set K、T7 零編造迴歸）。

**P5 iPhone 真機（只有 Sherry 能驗）**：加到主畫面、飛航模式可用、貼上流程、生字隔 7 天還在、捷徑路線 spike、截圖 OCR 路線。Charles 交付時必須標「未驗證」，不得聲稱已上線。

**部署範圍**（2026-09-26 補）：只部署上線產物（index.html、sw.js、manifest、icons、src、data/runtime 與手寫 json、授權頁）。`data/forms.json`（正本，超過 Cloudflare 單檔 25 MiB 上限）、build、tests、docs、node_modules、PHASE_LOG 一律排除；用 wrangler 設定檔明確指定資產目錄。授權標示寫 Wiktionary「CC BY-SA 4.0 and GFDL」。

每一期 RD 完成 → **Tester 獨立驗收**（含集外句組 TH）→ Charles 看報告 → 才進下一期或部署。

Sherry 9/26 拍板：P2 驗收通過後才部署（原本是 P1 結束時 Charles 先部署一次，讓 Sherry 可以提早在手機上摸；部署前會先告知。

---

## 9. 明確不做

- 發音
- 德中翻譯
- 整句翻譯（那是內建翻譯的工作，Wortlupe 賣的是拆解）
- 帳號、雲端同步
- 全語言覆蓋（詞頻前約 15,000 原形）
