// 共用：呼叫 Anthropic Messages API 做「IG 貼文風格分析」與「約會路線規劃」
// server.js（本機）與 api/analyze.js（Vercel）都 require 這個檔，確保提示詞與 schema 只有一份。
//
// 金鑰來源：環境變數 ANTHROPIC_API_KEY（前端永不接觸）
// 文件參考：POST https://api.anthropic.com/v1/messages
//   headers：x-api-key, anthropic-version: 2023-06-01, content-type
//   模型：claude-opus-4-8；用 output_config.format 強制回傳可解析的 JSON。

const MODEL = "claude-opus-4-8";

// 物件 schema 小工具：structured outputs 要求每個物件都標 additionalProperties:false，
// 且所有屬性都列入 required。
function obj(properties) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

// 模式一：分析 IG 貼文 → 抽出地點/活動，判斷風格與約會適合度
const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    spots: {
      type: "array",
      items: obj({
        name: { type: "string", description: "地點 / 活動 / 店家名稱" },
        category: { type: "string", description: "分類：咖啡廳 / 展覽 / 市集 / 活動 / 餐廳 / 景點 / 其他" },
        vibe_tags: { type: "array", items: { type: "string" }, description: "2–4 個中文風格標籤，例如 文青、浪漫、戶外、熱鬧、靜謐" },
        date_score: { type: "integer", description: "約會適合度 1–10（10 最適合）" },
        reason: { type: "string", description: "一句話說明為何（不）適合約會" },
        best_time: { type: "string", description: "建議時段，例如 下午、傍晚、週末白天" },
        location_hint: { type: "string", description: "可在地圖搜尋的名稱或區域；不確定就填空字串" },
      }),
    },
  },
  required: ["spots"],
  additionalProperties: false,
};

const ANALYZE_SYSTEM =
  "你是一位細膩的約會地點策展人。使用者會貼上一段或多段 Instagram 貼文文字" +
  "（可能含 hashtag、帳號名、地點名、心得）。請從中辨識出每一個「地點 / 活動 / 展覽 / 市集 / 店家」，" +
  "並判斷它的風格氛圍與是否適合約會。請務必用繁體中文，語氣溫暖務實。" +
  "若文字資訊不足，就根據名稱與常識合理推測，但別捏造不存在的店。" +
  "date_score 用 1–10 整數，理由要具體（人潮、氛圍、是否方便聊天、好不好拍）。";

// 模式二：把選好的地點排成一條約會路線
const ROUTE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "這條約會路線的標題" },
    intro: { type: "string", description: "2–3 句開場，描述整體節奏與氛圍" },
    stops: {
      type: "array",
      items: obj({
        name: { type: "string", description: "地點名稱" },
        type: { type: "string", description: "在這條路線中的角色：開場咖啡 / 主要活動 / 用餐 / 散步收尾 等" },
        activity: { type: "string", description: "在這站建議做什麼" },
        duration: { type: "string", description: "建議停留時間，例如 約 1 小時" },
        tip: { type: "string", description: "一個貼心小提醒（訂位、人潮、拍照點等）" },
      }),
    },
    closing: { type: "string", description: "1–2 句收尾建議" },
  },
  required: ["title", "intro", "stops", "closing"],
  additionalProperties: false,
};

const ROUTE_SYSTEM =
  "你是一位約會行程規劃師。使用者會給你一份候選地點清單（名稱、分類、可能含區域）。" +
  "請把它們排成一條順暢、舒服的約會路線，依約會節奏安排：輕鬆開場 → 主要活動 → 用餐 → 散步收尾，" +
  "並依地點性質與（若有）區域，把距離相近、節奏合理的安排在一起。" +
  "每站給出建議活動、停留時間與一個貼心提醒。請用繁體中文，語氣溫暖、像朋友在幫忙規劃。" +
  "只使用清單內的地點，不要新增清單外的店。";

// 依模式組出 Messages API 的 request body
function buildRequest(mode, payload) {
  if (mode === "analyze") {
    const text = (payload && payload.text ? String(payload.text) : "").slice(0, 12000);
    return {
      model: MODEL,
      max_tokens: 4000,
      system: ANALYZE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: ANALYZE_SCHEMA }, effort: "medium" },
      messages: [{ role: "user", content: "以下是要分析的 IG 貼文內容：\n\n" + text }],
    };
  }
  if (mode === "route") {
    const spots = Array.isArray(payload && payload.spots) ? payload.spots : [];
    const note = payload && payload.note ? String(payload.note) : "";
    const lines = spots.map((s, i) =>
      `${i + 1}. ${s.name || "（未命名）"}` +
      (s.category ? `（${s.category}）` : "") +
      (s.area ? ` - 區域：${s.area}` : "")
    ).join("\n");
    return {
      model: MODEL,
      max_tokens: 3000,
      system: ROUTE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: ROUTE_SCHEMA }, effort: "medium" },
      messages: [{
        role: "user",
        content: "候選地點清單：\n" + lines +
          (note ? `\n\n使用者偏好：${note}` : "") +
          "\n\n請排出一條約會路線。",
      }],
    };
  }
  throw new Error("未知的 mode：" + mode);
}

// 從回應的 content 陣列取出文字 block 並解析成 JSON（structured outputs 保證是合法 JSON）
function extractJson(data) {
  const blocks = (data && data.content) || [];
  const textBlock = blocks.find(b => b.type === "text");
  if (!textBlock) throw new Error("回應中找不到文字內容");
  return JSON.parse(textBlock.text);
}

// 呼叫 Anthropic，回傳解析後的物件；失敗丟出含訊息的 Error
async function callAnthropic(key, mode, payload) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(buildRequest(mode, payload)),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || ("HTTP " + res.status);
    throw new Error(msg);
  }
  if (data.stop_reason === "refusal") throw new Error("模型基於安全原因拒絕了這個請求。");
  return extractJson(data);
}

module.exports = { callAnthropic, buildRequest, extractJson, MODEL };
