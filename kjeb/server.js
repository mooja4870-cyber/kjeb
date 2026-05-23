// server.js — 네이버 API 중계 서버
// 실행: node server.js
// 설치 필요 없음 (Node.js 내장 모듈만 사용)

const http = require("http");
const https = require("https");
const url = require("url");

const PORT = 3333;
const NAVER_CLIENT_ID = "PqOwK5a2oVVs6zmEOjWm";
const NAVER_CLIENT_SECRET = "SjK8rv8Nd7";

const server = http.createServer((req, res) => {
  // CORS 허용
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);

  // /search?query=고양시+치과&display=20
  if (parsed.pathname === "/search") {
    const query = parsed.query.query || "";
    const display = parsed.query.display || "20";
    const sort = parsed.query.sort || "comment";

    const apiUrl = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}`;

    const options = {
      headers: {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
      },
    };

    https.get(apiUrl, options, (apiRes) => {
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

  // 기본 페이지 — safe-hospital-finder.html 서빙
  if (parsed.pathname === "/" || parsed.pathname === "/index.html") {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(__dirname, "safe-hospital-finder.html");
    
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end("File not found. safe-hospital-finder.html을 같은 폴더에 넣어주세요.");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
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
