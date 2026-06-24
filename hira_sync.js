#!/usr/bin/env node
// [Phase C] HIRA 동(洞) 단위 기본정보를 받아 D1 hira_match_cache에 적재하는 로컬 러너.
// Cloudflare Worker에서는 data.go.kr 도달이 안 되므로(504), KR에서 접근 가능한 이 스크립트로 동기화한다.
// 사용: node hira_sync.js 주엽동 마두동 ...   (인자로 동 이름들)
// 주기 동기화는 GitHub Actions(KR 러너) 등으로 확장 가능.
const https = require("https");
const http = require("http");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const HIRA_KEY = process.env.HIRA_KEY || "d1872140b5c5731a0901e66e2fd1c219318063a5b9735a83e47efae4567352a6";
const dongs = process.argv.slice(2);
if (!dongs.length) { console.error("사용: node hira_sync.js <동이름> [동이름...]"); process.exit(1); }

// node http.get은 data.go.kr에서 간헐 타임아웃(IPv6 등) → curl(IPv4 우선)로 안정적 수신
function fetchXML(url) {
  try { return Promise.resolve(execFileSync("curl", ["-s", "-4", "--max-time", "30", url], { encoding: "utf8", maxBuffer: 1 << 24 })); }
  catch (e) { return Promise.reject(new Error("curl " + e.message)); }
}
const xget = (s, t) => { const m = s.match(new RegExp(`<${t}>(.*?)</${t}>`)); return m ? m[1] : ""; };
const sqlEsc = (s) => s.replace(/'/g, "''");

(async () => {
  const stmts = [];
  for (const dong of dongs) {
    const url = `http://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList?ServiceKey=${HIRA_KEY}&pageNo=1&numOfRows=300&emdongNm=${encodeURIComponent(dong)}`;
    let xml;
    try { xml = await fetchXML(url); } catch (e) { console.error(`${dong}: 실패(${e.message})`); continue; }
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const list = items.map(it => ({
      ykiho: xget(it, "ykiho"), name: xget(it, "yadmNm"), addr: xget(it, "addr"),
      x: parseFloat(xget(it, "XPos")), y: parseFloat(xget(it, "YPos")),
      dr: parseInt(xget(it, "drTotCnt") || "0", 10), estb: xget(it, "estbDd"), cl: xget(it, "clCdNm"),
    }));
    if (!list.length) { console.error(`${dong}: 0건(스킵)`); continue; }
    const key = "hira_dong::" + dong;
    const json = sqlEsc(JSON.stringify(list));
    stmts.push(`INSERT OR REPLACE INTO hira_match_cache (name,data,ts) VALUES ('${sqlEsc(key)}', '${json}', ${Date.now()});`);
    console.log(`${dong}: ${list.length}건 준비`);
  }
  if (!stmts.length) { console.error("적재할 데이터 없음"); process.exit(1); }
  const sqlFile = path.join("/tmp", "hira_sync_" + Date.now() + ".sql");
  fs.writeFileSync(sqlFile, stmts.join("\n"));
  console.log(`D1 적재 중... (${stmts.length}개 동)`);
  try {
    const out = execFileSync("npx", ["--yes", "wrangler", "d1", "execute", "kjeb-db", "--remote", "--file=" + sqlFile], { encoding: "utf8" });
    console.log(out.split("\n").filter(l => /rows_written|success|Error/i.test(l)).join("\n") || "완료");
  } catch (e) { console.error("D1 적재 실패:", e.message); process.exit(1); }
  fs.unlinkSync(sqlFile);
})();
