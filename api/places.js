// Vercel Serverless Function：Google Places 代理
// 路徑會自動對應到  POST /api/places
// 金鑰來源：Vercel 環境變數 GOOGLE_PLACES_KEY（不寫進原始碼）
const FIELD_MASK = [
  "places.displayName", "places.rating", "places.userRatingCount",
  "places.priceLevel", "places.location", "places.formattedAddress",
  "places.googleMapsUri", "places.currentOpeningHours.openNow",
  "places.primaryTypeDisplayName",
].join(",");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method Not Allowed" } });
  }
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) {
    return res.status(500).json({ error: { message: "伺服器未設定 GOOGLE_PLACES_KEY 環境變數。" } });
  }
  try {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const gRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body,
    });
    const data = await gRes.json();
    return res.status(gRes.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: { message: "代理請求失敗：" + e.message } });
  }
};
