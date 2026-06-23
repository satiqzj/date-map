// Vercel Serverless Function：Anthropic 代理（IG 風格分析 + 約會路線）
// 路徑會自動對應到  POST /api/analyze
// 金鑰來源：Vercel 環境變數 ANTHROPIC_API_KEY（不寫進原始碼、前端不接觸）
//
// 前端送來 { mode: "analyze" | "route", ...payload }，這裡補上金鑰與提示詞後轉發給 Anthropic。
const { callAnthropic } = require("./_anthropic");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method Not Allowed" } });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: { message: "伺服器未設定 ANTHROPIC_API_KEY 環境變數。" } });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { mode, ...payload } = body;
    const data = await callAnthropic(key, mode, payload);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: { message: "分析失敗：" + e.message } });
  }
};
