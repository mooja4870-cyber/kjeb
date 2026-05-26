// server.js — 네이버 API 중계 서버
// 실행: node server.js

const http = require("http");
const https = require("https");
const url = require("url");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const NAVER_CLIENT_ID = "PqOwK5a2oVVs6zmEOjWm";
const NAVER_CLIENT_SECRET = "SjK8rv8Nd7";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  const parsed = url.parse(req.url, true);

  // 네이버 검색 API 프록시
  if (parsed.pathname === "/search") {
    const query = parsed.query.query || "";
    const display = parsed.query.display || "20";
    const sort = parsed.query.sort || "comment";
    const apiUrl = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}`;

    https.get(apiUrl, {
      headers: {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
      },
    }, (apiRes) => {
      let data = "";
      apiRes.on("data", (chunk) => (data += chunk));
      apiRes.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(data);
      });
    }).on("error", (err) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // 정적 파일 서빙 (html, js, css)
  let filePath;
  if (parsed.pathname === "/" || parsed.pathname === "/index.html") {
    filePath = path.join(__dirname, "safe-hospital-finder.html");
  } else {
    // /regions.js 등 정적 파일
    filePath = path.join(__dirname, parsed.pathname);
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("File not found: " + parsed.pathname);
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log("");
  console.log("========================================");
  console.log("  ✅ 안심 병원 찾기 서버 시작!");
  console.log("  🌐 http://localhost:" + PORT);
  console.log("  브라우저에서 위 주소를 열어주세요");
  console.log("========================================");
  console.log("");
});
