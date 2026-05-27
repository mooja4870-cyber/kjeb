// server.js — 네이버 API 중계 서버
// 실행: node server.js

const http = require("http");
const https = require("https");
const url = require("url");
const fs = require("fs");
const path = require("path");
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'hira_data.db');
const db = new sqlite3.Database(dbPath);

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

  // HIRA API Proxy helper
  const fetchAPI = (urlStr, timeoutMs = 1500) => {
    const client = urlStr.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
      const req = client.get(urlStr, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  };


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
      apiRes.on("end", async () => {
        try {
          const naverData = JSON.parse(data);
          if (naverData.items) {
            const promises = naverData.items.map(item => {
              return new Promise((resolve) => {
                const cleanName = item.title.replace(/<[^>]+>/g, '').split(' ')[0];
                db.get(`SELECT * FROM hospitals WHERE yadmNm LIKE ?`, [`%${cleanName}%`], (err, row) => {
                  if (!err && row) {
                    item.hiraData = { doctorCnt: row.drTotCnt };
                  } else {
                    item.hiraData = { doctorCnt: 1 };
                  }
                  resolve();
                });
              });
            });
            await Promise.all(promises);
          }
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(naverData));
        } catch (e) {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(data);
        }
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
    filePath = path.join(__dirname, "index.html");
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
    res.writeHead(200, { 
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    });
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


