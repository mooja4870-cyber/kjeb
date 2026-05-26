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
  const fetchAPI = (urlStr) => {
    const client = urlStr.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
      client.get(urlStr, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  };

  // HIRA API Proxy Endpoint
  if (parsed.pathname === "/api/hira") {
    const name = parsed.query.name || "";
    const addr = parsed.query.addr || "";
    
    const HIRA_KEY = "d1872140b5c5731a0901e66e2fd1c219318063a5b9735a83e47efae4567352a6";
    const serviceKey = encodeURIComponent(HIRA_KEY);

    const handleHira = async () => {
      try {
        // 1. 병원 기본정보 (getHospBasisList) - 의사 수, 요양기호 획득
        const basisUrl = `http://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList?ServiceKey=${serviceKey}&pageNo=1&numOfRows=20&yadmNm=${encodeURIComponent(name)}`;
        const basisXml = await fetchAPI(basisUrl);
        
        const items = basisXml.split('<item>').slice(1).map(i => i.split('</item>')[0]);
        let target = null;

        for (let item of items) {
           const ykiho = (item.match(/<ykiho>(.*?)<\/ykiho>/) || [])[1];
           const itemAddr = (item.match(/<addr>(.*?)<\/addr>/) || [])[1] || "";
           const drTotCnt = parseInt((item.match(/<drTotCnt>(.*?)<\/drTotCnt>/) || [])[1] || "1", 10);
           
           // 주소가 어느정도 일치하거나 첫번째 아이템 사용
           if (ykiho) {
             target = { ykiho, addr: itemAddr, drTotCnt };
             break; // 단순 매칭으로 첫번째 선택 (실무에서는 주소 유사도 비교 필요)
           }
        }

        if (!target) {
           res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
           res.end(JSON.stringify({error: "Hosp not found in HIRA"}));
           return;
        }

        // 2. 병원 평가정보 (getHospEvalInfoList) - 항생제 등급 등
        const evalUrl = `http://apis.data.go.kr/B551182/hospEvalInfoService/getHospBasisList?ServiceKey=${serviceKey}&pageNo=1&numOfRows=20&ykiho=${target.ykiho}`;
        const evalXml = await fetchAPI(evalUrl);
        
        let antiGrade = null; // 항생제 등급
        const evalItems = evalXml.split('<item>').slice(1).map(i => i.split('</item>')[0]);
        for (let e of evalItems) {
            const asmNm = (e.match(/<asmNm>(.*?)<\/asmNm>/) || [])[1] || "";
            const asmGrdNm = (e.match(/<asmGrdNm>(.*?)<\/asmGrdNm>/) || [])[1] || "";
            if (asmNm.includes("항생제") && asmGrdNm) {
                antiGrade = asmGrdNm;
            }
        }

        // 실제 데이터를 바탕으로 HIRA 지표(hc) 변환
        // 비용(pp): 비급여정보 미연동 시 임의 70, 연동 시 계산
        // 대기만족도(ad): 의사 수가 많을수록 대기 시간 관리가 잘된다고 가정 (의사 1명 50%, 3명이상 80%)
        // 치료만족도(de): 항생제 1등급이면 95%, 2등급 80%, 등급 없으면 60%
        // 설명친절도(ps): 의사 수 기반 60~85%
        
        let deScore = 65;
        if (antiGrade === "1등급") deScore = 95;
        else if (antiGrade === "2등급") deScore = 85;
        else if (antiGrade === "3등급") deScore = 70;
        else if (antiGrade === "4등급") deScore = 55;
        else if (antiGrade === "5등급") deScore = 40;

        let adScore = Math.min(90, 45 + (target.drTotCnt * 10));
        let psScore = Math.min(85, 50 + (target.drTotCnt * 5));
        let ppScore = 75; // 비급여 데이터 부재 시 기본값

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          ykiho: target.ykiho,
          doctorCnt: target.drTotCnt,
          antiGrade: antiGrade || "정보없음",
          hc: {
            pp: ppScore,
            ad: adScore,
            de: deScore,
            ps: psScore
          }
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({error: err.message}));
      }
    };

    handleHira();
    return;
  }

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
                  if (err || !row) {
                    item.hiraData = null;
                  } else {
                    let adScore = Math.min(90, 45 + (row.drTotCnt * 10));
                    let psScore = Math.min(85, 50 + (row.drTotCnt * 5));
                    // 평가 정보가 배치에 없으므로 기본값 또는 의사 수 비례
                    item.hiraData = {
                      doctorCnt: row.drTotCnt,
                      hc: { pp: 75, ad: adScore, de: 65, ps: psScore }
                    };
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
