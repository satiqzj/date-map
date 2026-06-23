# 💕 約會地圖（IG 地點蒐集器）

把你在 Instagram 上看到的活動、展覽、市集、咖啡廳貼文「貼進來」，由 AI 整理、分析風格與**約會適合度**；再用 Google Places 找周邊的咖啡廳／餐廳／公園，最後排出一條順暢的約會路線（含 Google 地圖導航連結）。

> ⚠️ Instagram 沒有開放的貼文擷取 API（第三方爬蟲違反條款且會被擋），所以本工具採「**你貼上內容、AI 幫你整理分析**」的方式運作，穩定可用且合規。

## 功能

0. **IG 監看精選（整合）** — 自動讀取 [IG 監看器](https://github.com/satiqzj/ig-monitor) 每天整理好的 `feed.json`，直接顯示成可加入清單的卡片（店名／風格／約會指數／圖片），不用再複製貼上。在 `index.html` 的 `IG_REPO` 設定你的監看器 repo。
1. **IG 貼文分析** — 也可手動貼上貼文文字 → 抽出每個地點、給風格標籤與約會指數（1–10）。
2. **找周邊地點** — 用目前位置搜尋附近咖啡廳／餐廳／公園。預設用 **OpenStreetMap（免費、免金鑰）**，可切換 Google Places（需金鑰）。
3. **排約會路線** — 從收藏清單排出「開場 → 主要活動 → 用餐 → 散步收尾」的路線。

> 💡 **預設全免費**：找周邊用 OSM、IG 分析由監看器（免費 GitHub Models）做好，所以這個 app 不需要任何付費金鑰就能用。Google／Anthropic 金鑰都是選配升級。

- 前端：單一 `index.html`（響應式，手機可用）
- 後端代理：
  - `api/places.js` → Google Places（評分／營業中／地圖連結）
  - `api/analyze.js` → Anthropic Claude（風格分析與路線規劃；共用邏輯在 `api/_anthropic.js`）
- 金鑰安全：兩個外部 API 一律經後端代理，金鑰只放環境變數，前端永不接觸。
- **沒設金鑰也能跑**：分析與路線會自動退回「本機關鍵字推測」模式（較陽春，但可用）。

## 本機開發

```bash
# 金鑰放在與 server.js 同目錄（已被 .gitignore 忽略）：
#   key.txt            → Google Places API (New) 金鑰
#   anthropic_key.txt  → Anthropic API 金鑰
# 或改用環境變數 GOOGLE_PLACES_KEY / ANTHROPIC_API_KEY
node server.js
# 開 http://localhost:8000
```

## 部署到 Vercel（免費）

1. 把這個資料夾推上 GitHub。
2. 到 https://vercel.com → **Add New… → Project** → 匯入這個 repo。
3. 在 **Environment Variables** 新增：
   - `GOOGLE_PLACES_KEY`：Google Places API (New) 金鑰
   - `ANTHROPIC_API_KEY`：Anthropic API 金鑰（沒有也能部署，分析改用離線推測）
4. 按 **Deploy**。`api/places.js`、`api/analyze.js` 會自動對應到 `POST /api/places`、`POST /api/analyze`。

## 模型

風格分析與路線規劃使用 `claude-opus-4-8`，並透過 structured outputs（`output_config.format`）保證回傳可解析的 JSON。

## 安全提醒

- `key.txt` / `anthropic_key.txt` 已被 `.gitignore` 排除，不進版控。
- 建議在 Google Cloud 對金鑰加「API 限制 → 只允許 Places API (New)」。
