# GitHub多國語言

GitHub 多國語言介面：預設**正體中文（台灣用語）**，並可即時切換為繁體中文（香港）、簡體中文、日本語，或保持原文。
同時提供**油猴腳本**與 **Chrome／Edge／Firefox 擴充**兩種安裝方式。

## 特色

- **零延遲**：在頁面一開始載入（document_start）時就同步翻譯，畫面第一次繪製時已是中文，不會先閃英文。
- **即時切換語言**：保留原文，切換語言時當下套用，不必重新整理。
- **在地化相對時間**：沿用 GitHub 本身的 `relative-time` 機制，交由瀏覽器依語言顯示（例如「3 天前」）。
- **不誤翻使用者內容**：略過程式碼、README、留言、議題標題、檔名、使用者名稱、標籤等。
- **可擴充**：收集未翻譯字串 → 填譯文 → 存入自訂詞庫；也能匯入其他語言的語言包。

## 安裝

### 油猴腳本（Tampermonkey／Violentmonkey）
開啟 `GitHub多國語言.user.js`，或在管理員中新增腳本後貼上全部內容並儲存。
設定入口：油猴選單 →「⚙️ 語言與翻譯設定」。

### Chrome／Edge
1. 解壓縮 `GitHub多國語言-chrome-v*.zip`。
2. 開啟 `chrome://extensions`（Edge 為 `edge://extensions`），開啟右上角「開發人員模式」。
3. 點「載入未封裝項目」，選擇解壓縮後的資料夾。

### Firefox
- 臨時安裝：`about:debugging#/runtime/this-firefox` →「載入暫用附加元件」→ 選 zip 中的 `manifest.json`。
- 正式安裝需送交 addons.mozilla.org 簽署（可選擇「自行散布」）。

> 擴充與油猴腳本請擇一使用，同時啟用會重複翻譯。

## 用語對照（台灣）

| 英文 | 台灣 | 香港 | 簡體 | 日本語 |
|---|---|---|---|---|
| Repository | 儲存庫 | 存儲庫 | 仓库 | リポジトリ |
| Pull request | 合併請求 | 合併請求 | 拉取请求 | プルリクエスト |
| Issue | 議題 | 議題 | 议题 | Issue |
| Fork | 分叉 | 分叉 | 复刻 | フォーク |
| Star / Watch | 星標／關注 | 星標／關注 | 星标／关注 | Star／Watch |
| Commit | 提交 | 提交 | 提交 | コミット |
| Settings | 設定 | 設定 | 设置 | 設定 |
| Profile | 個人檔案 | 個人資料 | 个人资料 | プロフィール |

## 自動補齊漏翻

GitHub 改版很頻繁，內建詞庫一定會有漏網之魚，所以腳本內建一套「收集 → 翻譯 → 審核 → 併回詞庫」的流程：

1. **自動收集**（預設開啟）：瀏覽時遇到沒翻譯的介面文字就記下來，跨頁面累積，記錄出現次數與頁面類型（網址中的帳號、儲存庫名稱、編號都會換成代號）。只存在本機，不會上傳。
   會自動排除使用者名稱、檔名、commit SHA、網址、版本號、程式碼等「不是介面」的文字，README、留言、議題內容本來就不會處理。
2. **自動機器翻譯**（預設關閉）：開啟後，新遇到的漏翻字串會在背景批次送去翻譯，約一秒內就換成譯文。
   - Google 翻譯：免費、免金鑰，會自動把「代碼、默認、存儲庫…」修正為台灣用語。
   - Anthropic Claude、OpenAI、Google Gemini、DeepSeek、Ollama 或任何 OpenAI 相容 API：會附上目前語言的術語表（儲存庫、合併請求、議題…），用語更一致。
   - 填入 API 金鑰後按「取得模型清單」，會從服務讀回目前可用的模型供下拉選擇，並自動挑選適合翻譯的便宜快速模型（例如 Claude Haiku、Gemini Flash）。
   - **私人儲存庫的頁面不會自動送出**；連續失敗三次會暫停，避免一直打擾翻譯服務。
3. **審核**：「審核與編輯翻譯」面板依出現次數排序，可直接修改譯文並按 ✓ 確認；不是介面文字的按「忽略」，以後就不再收集。
4. **匯出貢獻檔**：下載 JSON，交給維護者或自己用 `build/merge.py` 併入內建詞庫：
   ```bash
   python3 build/merge.py GitHub多國語言-貢獻檔-2026-10-29.json          # 只併入已確認的譯文
   python3 build/merge.py GitHub多國語言-貢獻檔-*.json --machine         # 連同機器翻譯
   python3 build/build.py
   ```
   尚未翻譯的字串會整理到 `src/locales/todo.json`，方便集中翻譯。

翻譯優先順序：已確認（自訂）＞ 內建詞庫 ＞ 機器翻譯。

### 動態字串樣板

含數字、日期、儲存庫（owner/repo）或你的帳號的字串，會自動換成佔位符，一筆樣板涵蓋所有變化：

| 原文 | 樣板 | 譯文 |
|---|---|---|
| No contributions on August 31st. | No contributions on {date}. | {date}沒有貢獻。 |
| Star this repository (6705) | Star this repository ({n}) | 為此儲存庫加上星標（{n}） |
| Pin Hiura-Souji/Html-Helper to your profile | Pin {repo} to your profile | 將 {repo} 釘選到個人檔案 |
| Good evening, Hiura-Souji! | Good evening, {user}! | 晚安，{user}！ |

日期會依介面語言自動格式化（例如「8月31日」「2026年10月29日」）。同類佔位符出現多次時依序編號：`{n}`、`{n2}`、`{n3}`。
自訂詞庫與機器翻譯也可以使用這些佔位符。

### 不會收集的內容

- 連到使用者、組織、儲存庫、檔案、分支、commit、議題的連結文字（名稱與標題）
- 連到外部網站的連結（部落格、新聞標題）
- 儲存庫、App 卡片中的描述文字
- 大型下拉選單（時區、國家、語言）
- 內建忽略清單 `src/locales/ignore.json`（國家、地區、語言名稱、常見名稱等）
- 機器翻譯原樣傳回的字串（多半是名稱）會自動加入忽略清單

審核面板的「清理雜訊」會用上述規則清掉舊紀錄；「重設」則清除目前語言的自訂譯文、機器翻譯與收集紀錄，只用內建詞庫。

> 擴充版的 API 金鑰設定在擴充的「選項」頁，只存在擴充的本機儲存區，不會經過 GitHub 網頁；油猴版的金鑰存在油猴管理員的腳本儲存區。

## 自訂詞庫與語言包

- **自訂詞庫**：`{"原文": "譯文"}`，依目前語言分別儲存，優先於內建詞庫。
- **語言包**：
  ```json
  {"ko": {"name": "한국어", "htmlLang": "ko",
          "entries": {"Code": "코드", "Settings": "설정"},
          "rules": [["^(\\d+) commits?$", "i", "커밋 $1개"]]}}
  ```

## 自行建置

```bash
# 需要 OpenCC 字典檔（git clone https://github.com/BYVoid/OpenCC）
OPENCC_DICT=/path/to/OpenCC/data/dictionary python3 build/build.py
```

- 台灣用語主詞庫：`src/locales/base-entries.json`、`src/locales/zh-TW.extra.json`
- 規則、香港與簡體用語對照：`build/locales.py`
- 日語詞庫：`src/locales/ja.json`；日語規則：`build/ja_rules.py`（用語對齊 GitHub Docs 日語版）
- 動態字串樣板：`src/locales/templates.json`（[台灣, 日語]）；內建忽略清單：`src/locales/ignore.json`
- 翻譯核心：`src/core.js`；機器翻譯與共用工具：`src/shared.js`；擴充：`src/extension/`
- 貢獻檔合併工具：`build/merge.py`

授權：MIT
