// 靜態檔案伺服器 + Google Places 代理 + Anthropic 代理
//   啟動： node server.js   →   http://localhost:8000
//   金鑰來源（每個擇一）：
//     Google：環境變數 GOOGLE_PLACES_KEY  或  與本檔同目錄的 key.txt
//     Anthropic：環境變數 ANTHROPIC_API_KEY  或  與本檔同目錄的 anthropic_key.txt
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { callAnthropic } = require("./api/_anthropic");

const ROOT = __dirname;
const PORT = 8000;

const FIELD_MASK = [
  "places.displayName", "places.rating", "places.userRatingCount",
  "places.priceLevel", "places.location", "places.formattedAddress",
  "places.googleMapsUri", "places.currentOpeningHours.openNow",
  "places.primaryTypeDisplayName",
].join(",");

function readKey(envName, fileName) {
  if (process.env[envName]) return process.env[envName].trim();
  try { return fs.readFileSync(path.join(ROOT, fileName), "utf8").trim(); }
  catch (_) { return ""; }
}
const getGoogleKey = () => readKey("GOOGLE_PLACES_KEY", "key.txt");
const getAnthropicKey = () => readKey("ANTHROPIC_API_KEY", "anthropic_key.txt");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// Google Places：把前端送來的搜尋條件加上金鑰後轉發
function proxyPlaces(req, res) {
  const key = getGoogleKey();
  if (!key) return sendJson(res, 500, { error: { message: "伺服器未設定金鑰。請設定 GOOGLE_PLACES_KEY 或建立 key.txt。" } });
  readBody(req).then(payload => {
    const gReq = https.request({
      hostname: "places.googleapis.com",
      path: "/v1/places:searchText",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": payload.length,
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
    }, gRes => {
      const body = [];
      gRes.on("data", c => body.push(c));
      gRes.on("end", () => {
        res.writeHead(gRes.statusCode, { "Content-Type": "application/json; charset=utf-8" });
        res.end(Buffer.concat(body));
      });
    });
    gReq.on("error", e => sendJson(res, 502, { error: { message: "代理請求失敗：" + e.message } }));
    gReq.write(payload);
    gReq.end();
  });
}

// Anthropic：IG 風格分析 / 約會路線
async function proxyAnalyze(req, res) {
  const key = getAnthropicKey();
  if (!key) return sendJson(res, 500, { error: { message: "伺服器未設定金鑰。請設定 ANTHROPIC_API_KEY 或建立 anthropic_key.txt。" } });
  try {
    const raw = (await readBody(req)).toString("utf8");
    const body = raw ? JSON.parse(raw) : {};
    const { mode, ...payload } = body;
    const data = await callAnthropic(key, mode, payload);
    sendJson(res, 200, data);
  } catch (e) {
    sendJson(res, 502, { error: { message: "分析失敗：" + e.message } });
  }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];
  if (req.method === "POST" && urlPath === "/api/places") return proxyPlaces(req, res);
  if (req.method === "POST" && urlPath === "/api/analyze") return proxyAnalyze(req, res);
  if (req.method !== "GET") { res.writeHead(405); return res.end("Method Not Allowed"); }
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`Serving "${ROOT}" at http://localhost:${PORT}`);
  console.log("Google 金鑰：" + (getGoogleKey() ? "已載入 ✅" : "未設定（找周邊需要 key.txt 或 GOOGLE_PLACES_KEY）"));
  console.log("Anthropic 金鑰：" + (getAnthropicKey() ? "已載入 ✅" : "未設定（IG 分析會改用前端關鍵字推測）"));
});
