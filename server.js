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

// 실제 후기 집계 캐시 테이블 (네이버 블로그/카페/지식인 결과 재사용 → API 호출 절약)
db.run(`CREATE TABLE IF NOT EXISTS mention_cache (name TEXT PRIMARY KEY, data TEXT, ts INTEGER)`);
const MENTION_TTL = 1000 * 60 * 60 * 24; // 24시간

// 사용자 제보(착한병원 등록) 테이블 — 데이터 축적용
db.run(`CREATE TABLE IF NOT EXISTS user_recos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, region TEXT, specialty TEXT,
  reasons TEXT, comment TEXT, ip TEXT, ts INTEGER
)`);

// [Phase A] 병원 정보 정정·이의제기 창구 (병원 측 신고) — 내부 관리용
db.run(`CREATE TABLE IF NOT EXISTS data_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, region TEXT, kind TEXT, message TEXT, contact TEXT,
  status TEXT DEFAULT 'open', ip TEXT, ts INTEGER
)`);

// [Phase A] 추천 판정 감사 로그 골격 (어떤 데이터·시점·산식으로 판정했는지 기록 — Phase C/D에서 객관지표 채움)
db.run(`CREATE TABLE IF NOT EXISTS reco_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, formula_ver TEXT, source TEXT, evidence TEXT, decision TEXT, as_of INTEGER, ts INTEGER
)`);

// 추천 산식 버전 (근거 제시·감사용). 변경 시 갱신.
const FORMULA_VER = "reviewer-v2";

// 실제 후기 감성 키워드 (사람들이 실제로 남기는 표현 기반)
const POS_KW = ["착한","양심","과잉진료 없","과잉진료없","과잉 없","바가지 없","덤터기 없","강요 없","강요 안","강요하지 않","친절","꼼꼼","세심","자연치아","보존치료","살려주","안 아프게","안아프게","정직","믿고","믿을 만","재방문","단골","추천","만족","최고","좋았","좋아요","good"];
const OVERTREAT_POS = ["착한","양심","과잉진료 없","과잉진료없","과잉 없","바가지 없","덤터기 없","강요 없","강요 안","강요하지 않","자연치아","보존치료","살려주","정직"];
const NEG_KW = ["과잉진료","과잉 진료","바가지","덤터기","강요","불친절","사기","돈만","불필요한 치료","과다청구","불만","최악","후회","다신 안","두 번 다시","비추","호구","뜯","폭리"];
// 광고/협찬 식별 (집계에서 제외) — 체험단·협찬·원고료 등
const AD_KW = ["체험단","협찬","소정의 원고료","원고료","유료광고","제공받아","제공 받아","제공받았","무상으로 제공","대가성","경제적 대가","서포터즈","앰배서더","앰버서더","기자단","파트너스","쿠팡","애드","광고 포함","유료 광고"];

function stripTag(s) { return (s || "").replace(/<[^>]*>/g, ""); }
// '과잉진료 없어요' 같은 긍정 부정문이 부정으로 오집계되지 않도록 제거
function neutralizePos(text) {
  return text
    .replace(/과잉\s*진료\s*(가|는|도|를|없)?\s*없/g, " ")
    .replace(/바가지\s*(가|는|도)?\s*없/g, " ")
    .replace(/덤터기\s*(가|는|도)?\s*없/g, " ")
    .replace(/강요\s*(가|는|도|하지)?\s*(없|않)/g, " ");
}

// Render 등 클라우드는 PORT 환경변수를 주입함. 없으면 로컬 기본값 4156.
const PORT = process.env.PORT || 4156;
// 검색/후기/역지오코딩은 운영(Cloudflare/D1)으로 프록시 → 로컬·CF가 동일한 캐시·데이터 사용(병원 수 일치).
// 단, 착한병원 제보(/recommend·/recommendations)는 프록시 제외 → 로컬 서버 내부 DB(user_recos)에 저장·관리.
// 완전 로컬(오프라인) 처리를 원하면 DATA_PROXY=off 로 실행.
const DATA_PROXY = process.env.DATA_PROXY === "off" ? null : (process.env.DATA_PROXY || "https://kjeb.pages.dev/api");
const PROXY_PATHS = ["/search", "/mentions", "/revgeo", "/hira"];
// 시크릿은 환경변수 우선(배포 시 Render에 등록). 미설정 시 로컬 개발용 폴백.
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "PqOwK5a2oVVs6zmEOjWm";
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "SjK8rv8Nd7";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  const parsed = url.parse(req.url, true);

  // [데이터 프록시] /search·/mentions 등은 운영(CF/D1)으로 넘겨 로컬·CF 결과 일치 보장
  if (DATA_PROXY && PROXY_PATHS.includes(parsed.pathname)) {
    const target = DATA_PROXY + parsed.pathname + (parsed.search || "");
    const opts = {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(),
      },
    };
    const preq = https.request(target, opts, (pres) => {
      res.writeHead(pres.statusCode || 200, {
        "Content-Type": pres.headers["content-type"] || "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      pres.pipe(res);
    });
    preq.on("error", (e) => { res.writeHead(502, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "proxy: " + e.message })); });
    if (req.method === "POST") req.pipe(preq); else preq.end();
    return;
  }

  // 착한병원 제보 등록 (POST)
  if (req.method === "POST" && parsed.pathname === "/recommend") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on("end", () => {
      const sendJson = obj => { res.writeHead(obj.error ? 400 : 200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
      let d; try { d = JSON.parse(body); } catch { d = {}; }
      const name = stripTag(d.name || "").trim().slice(0, 60);
      const region = stripTag(d.region || "").trim().slice(0, 80);
      const specialty = stripTag(d.specialty || "").trim().slice(0, 30);
      const reasons = Array.isArray(d.reasons) ? d.reasons.map(r => stripTag(String(r)).trim()).filter(Boolean).slice(0, 12) : [];
      const comment = stripTag(d.comment || "").trim().slice(0, 300);
      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
      if (!name || !region || reasons.length === 0) return sendJson({ error: "병원명·지역·추천이유는 필수입니다." });
      // 도배 방지: 동일 IP 60초 내 3건 초과 차단
      db.get(`SELECT COUNT(*) AS c FROM user_recos WHERE ip=? AND ts > ?`, [ip, Date.now() - 60000], (e1, row) => {
        if (!e1 && row && row.c >= 3) return sendJson({ error: "잠시 후 다시 시도해주세요. (도배 방지)" });
        // 동일 IP가 같은 병원 중복 제보 차단
        db.get(`SELECT id FROM user_recos WHERE ip=? AND name=?`, [ip, name], (e2, dup) => {
          if (!e2 && dup) return sendJson({ error: "이미 이 병원을 제보하셨습니다. 감사합니다!" });
          db.run(`INSERT INTO user_recos (name,region,specialty,reasons,comment,ip,ts) VALUES (?,?,?,?,?,?,?)`,
            [name, region, specialty, JSON.stringify(reasons), comment, ip, Date.now()], function (e3) {
              if (e3) return sendJson({ error: "저장에 실패했습니다." });
              sendJson({ ok: true, id: this.lastID });
            });
        });
      });
    });
    return;
  }

  // 착한병원 제보 목록 조회 (병원명별 집계)
  if (parsed.pathname === "/recommendations") {
    const region = stripTag(parsed.query.region || "").trim();
    const sendJson = obj => { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
    let sql = `SELECT name, region, specialty, reasons, comment, ts FROM user_recos WHERE status='approved'`;
    const params = [];
    if (region) { sql += ` AND region LIKE ?`; params.push(`%${region}%`); }
    sql += ` ORDER BY ts DESC LIMIT 500`;
    db.all(sql, params, (err, rows) => {
      if (err || !rows) return sendJson({ items: [] });
      const map = {};
      rows.forEach(r => {
        const key = r.name;
        if (!map[key]) map[key] = { name: r.name, region: r.region, specialty: r.specialty, count: 0, reasons: {}, comments: [] };
        map[key].count++;
        let rs = []; try { rs = JSON.parse(r.reasons || "[]"); } catch {}
        rs.forEach(x => { map[key].reasons[x] = (map[key].reasons[x] || 0) + 1; });
        if (r.comment) map[key].comments.push(r.comment);
      });
      sendJson({ items: Object.values(map) });
    });
    return;
  }

  // [Phase A] 병원 정보 정정·이의제기 접수 (POST) — 내부 DB에 저장
  if (req.method === "POST" && parsed.pathname === "/correction") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on("end", () => {
      const sendJson = obj => { res.writeHead(obj.error ? 400 : 200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
      let d; try { d = JSON.parse(body); } catch { d = {}; }
      const name = stripTag(d.name || "").trim().slice(0, 80);
      const region = stripTag(d.region || "").trim().slice(0, 80);
      const kind = stripTag(d.kind || "").trim().slice(0, 30);
      const message = stripTag(d.message || "").trim().slice(0, 600);
      const contact = stripTag(d.contact || "").trim().slice(0, 80);
      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
      if (!name || !message) return sendJson({ error: "병원명과 정정 내용은 필수입니다." });
      db.get(`SELECT COUNT(*) AS c FROM data_corrections WHERE ip=? AND ts > ?`, [ip, Date.now() - 60000], (e1, row) => {
        if (!e1 && row && row.c >= 3) return sendJson({ error: "잠시 후 다시 시도해주세요." });
        db.run(`INSERT INTO data_corrections (name,region,kind,message,contact,ip,ts) VALUES (?,?,?,?,?,?,?)`,
          [name, region, kind, message, contact, ip, Date.now()], function (e2) {
            if (e2) return sendJson({ error: "접수에 실패했습니다." });
            sendJson({ ok: true, id: this.lastID });
          });
      });
    });
    return;
  }

  // [Phase A] 정정·이의제기 접수 목록 (내부 관리용)
  if (parsed.pathname === "/corrections") {
    const sendJson = obj => { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
    db.all(`SELECT id,name,region,kind,message,contact,status,ts FROM data_corrections ORDER BY ts DESC LIMIT 500`, [], (err, rows) => {
      sendJson({ items: err ? [] : (rows || []), formula_ver: FORMULA_VER });
    });
    return;
  }

  // [관리자] 제보 검증·승인 (비번은 환경변수 ADMIN_PASSWORD로 검증)
  if (req.method === "POST" && parsed.pathname === "/admin") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on("end", () => {
      const sendJson = (obj, code) => { res.writeHead(code || 200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
      let d; try { d = JSON.parse(body); } catch { d = {}; }
      const PW = process.env.ADMIN_PASSWORD || "";
      if (!PW || d.password !== PW) return sendJson({ error: "인증 실패" }, 401);
      const action = d.action || "list";
      if (action === "list") {
        db.all(`SELECT id,name,region,specialty,reasons,comment,ts FROM user_recos WHERE status IS NULL OR status='pending' ORDER BY ts DESC LIMIT 500`, [], (e, rows) => {
          const pending = (rows || []).map(r => { let rs = []; try { rs = JSON.parse(r.reasons || "[]"); } catch {} return { id: r.id, name: r.name, region: r.region, specialty: r.specialty, reasons: rs, comment: r.comment, ts: r.ts }; });
          db.get(`SELECT COUNT(*) AS c FROM user_recos WHERE status='approved'`, [], (e2, row) => sendJson({ ok: true, pending, approvedCount: row ? row.c : 0 }));
        });
      } else if (action === "approve") {
        if (!d.id) return sendJson({ error: "id 필요" }, 400);
        db.run(`UPDATE user_recos SET status='approved' WHERE id=?`, [d.id], e => sendJson(e ? { error: "실패" } : { ok: true }, e ? 500 : 200));
      } else if (action === "reject") {
        if (!d.id) return sendJson({ error: "id 필요" }, 400);
        db.run(`DELETE FROM user_recos WHERE id=?`, [d.id], e => sendJson(e ? { error: "실패" } : { ok: true }, e ? 500 : 200));
      } else sendJson({ error: "알 수 없는 action" }, 400);
    });
    return;
  }

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
    const sort = parsed.query.sort || "random";
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

  // 실제 후기 집계 API (네이버 블로그 + 카페 + 지식인 실제 글 기반)
  if (parsed.pathname === "/mentions") {
    const name = stripTag(parsed.query.name || "").trim();
    if (!name) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "name required" }));
      return;
    }

    const sendJson = obj => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
    };

    db.get(`SELECT data, ts FROM mention_cache WHERE name = ?`, [name], (err, row) => {
      if (!err && row && (Date.now() - row.ts) < MENTION_TTL) {
        sendJson(row.data);
        return;
      }

      const naverSearchOnce = (type) => new Promise(resolve => {
        const u = `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(name)}&display=30&sort=sim`;
        https.get(u, { headers: { "X-Naver-Client-Id": NAVER_CLIENT_ID, "X-Naver-Client-Secret": NAVER_CLIENT_SECRET } }, r => {
          let d = "";
          r.on("data", c => d += c);
          r.on("end", () => { try { resolve(JSON.parse(d).items || null); } catch { resolve(null); } });
        }).on("error", () => resolve(null));
      });
      // 일시 실패/부분 throttle 대비 1회 재시도 (실패 시 null → 재시도, 최종 실패만 [])
      const naverSearch = async (type) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const items = await naverSearchOnce(type);
          if (items) return items;
          if (attempt === 0) await new Promise(s => setTimeout(s, 400));
        }
        return [];
      };

      Promise.all([naverSearch("blog"), naverSearch("cafearticle"), naverSearch("kin")]).then(([blog, cafe, kin]) => {
        const all = [
          ...blog.map(i => ({ ...i, src: "블로그" })),
          ...cafe.map(i => ({ ...i, src: "카페" })),
          ...kin.map(i => ({ ...i, src: "지식인" })),
        ];
        let pos = 0, neg = 0, matched = 0, adCount = 0, ot = 0;
        const samples = [];
        const adSamples = [];
        all.forEach(it => {
          const title = stripTag(it.title);
          const desc = stripTag(it.description);
          const text = title + " " + desc;
          // 해당 병원을 실제로 언급한 글만 집계 (정직성: 이름 미포함 글 제외)
          if (!text.includes(name)) return;
          matched++;
          // 광고/협찬 문구 또는 정형화된 체험단 템플릿 제목 → 광고 의심 (집계 제외, 별도 표기)
          const isAdText = AD_KW.some(k => text.includes(k));
          const isTemplated = title.includes("에서 경험한") || /에서의\s.{0,12}(경험|치료\s*후기)/.test(title);
          if (isAdText || isTemplated) {
            adCount++;
            adSamples.push({ t: title, l: it.link, src: it.src, s: "ad", reason: isAdText ? "광고/협찬 문구" : "정형 패턴(체험단 의심)" });
            return;
          }
          const hasPos = POS_KW.some(k => text.includes(k));
          const negText = neutralizePos(text);
          const hasNeg = NEG_KW.some(k => negText.includes(k));
          const isOt = hasPos && OVERTREAT_POS.some(k => text.includes(k));
          if (hasPos && !hasNeg) { pos++; if (isOt) ot++; samples.push({ t: title, l: it.link, src: it.src, s: "pos" }); }
          else if (hasNeg && !hasPos) { neg++; samples.push({ t: title, l: it.link, src: it.src, s: "neg" }); }
          else if (hasPos && hasNeg) { pos++; if (isOt) ot++; samples.push({ t: title, l: it.link, src: it.src, s: "mixed" }); }
        });
        const result = JSON.stringify({ name, scanned: all.length, matched, pos, neg, ot, adCount, samples: samples.slice(0, 6), adSamples: adSamples.slice(0, 4) });
        // 네이버가 실제로 응답했을 때(scanned>0)만 캐싱 — 일시 실패(0건)를 24h 캐시에 박제하지 않음
        if (all.length > 0) db.run(`INSERT OR REPLACE INTO mention_cache (name, data, ts) VALUES (?, ?, ?)`, [name, result, Date.now()]);
        sendJson(result);
      });
    });
    return;
  }

  // 좌표 → 지역명 역지오코딩 (Nominatim/OSM, 키 불필요)
  if (parsed.pathname === "/revgeo") {
    const lat = parseFloat(parsed.query.lat), lng = parseFloat(parsed.query.lng);
    const sendJson = obj => { res.writeHead(obj.error ? 400 : 200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
    if (isNaN(lat) || isNaN(lng)) return sendJson({ error: "lat/lng required" });
    const u = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ko&zoom=18`;
    https.get(u, { headers: { "User-Agent": "kjeb-hospital-finder/1.0 (good-clinic-finder)" } }, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => {
        try {
          const a = (JSON.parse(d).address) || {};
          const province = a.province || a.state || "";                       // 경기도/서울특별시
          const city = a.city || a.county || a.town || "";                    // 고양시
          const gu = a.borough || a.city_district || a.district || "";        // 일산서구
          const dong = a.suburb || a.quarter || a.neighbourhood || a.village || ""; // 주엽2동
          // 검색용: 광역도 제외, 시·구·동만 (동 끝 숫자 제거: 주엽2동 → 주엽동)
          const dongClean = dong.replace(/\d+동$/, m => m.replace(/\d+/, "")).replace(/\s/g, "");
          const parts = [city, gu, dongClean].filter(Boolean);
          const name = dongClean || gu || city || "내 위치";
          sendJson({ ok: true, name, full: parts.join(" "), province, city, gu, dong: dongClean });
        } catch (e) {
          sendJson({ error: "geocode failed" });
        }
      });
    }).on("error", () => sendJson({ error: "geocode failed" }));
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


