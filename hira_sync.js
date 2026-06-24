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
// 병원평가정보서비스(적정성평가)는 별도 승인 키 사용
const ASM_KEY = process.env.HIRA_ASM_KEY || "8dbbe3e9f0e296a2ebfba5741fe1fb2dda15af916f7214d62e494cffcff987ef";
// 과잉진료 직결 약제 적정성 항목 (코드→쉬운 라벨). 1등급=적정(과잉처방 적음) ~ 5등급=하위
const ASM_ITEMS = { "07": "감기 항생제 처방", "08": "주사제 처방", "09": "처방 약품 가짓수", "23": "기관지염 항생제 처방" };
let args = process.argv.slice(2);
const NONPAY = args[0] === "--nonpay";
const ASM = args[0] === "--asm";
if (NONPAY || ASM) args = args.slice(1);
const dongs = args;
if (!dongs.length) { console.error("사용: node hira_sync.js [--nonpay|--asm] <동이름> [동이름...]"); process.exit(1); }

// node http.get은 data.go.kr에서 간헐 타임아웃(IPv6 등) → curl(IPv4 우선)로 안정적 수신
function fetchXML(url) {
  try { return Promise.resolve(execFileSync("curl", ["-s", "-4", "--max-time", "30", url], { encoding: "utf8", maxBuffer: 1 << 24 })); }
  catch (e) { return Promise.reject(new Error("curl " + e.message)); }
}
const xget = (s, t) => { const m = s.match(new RegExp(`<${t}>(.*?)</${t}>`)); return m ? m[1] : ""; };
const sqlEsc = (s) => s.replace(/'/g, "''");

function pushD1(stmts, label) {
  if (!stmts.length) { console.error("적재할 데이터 없음"); process.exit(1); }
  const sqlFile = path.join("/tmp", "hira_sync_" + Date.now() + ".sql");
  fs.writeFileSync(sqlFile, stmts.join("\n"));
  console.log(`D1 적재 중... (${label})`);
  try {
    const out = execFileSync("npx", ["--yes", "wrangler", "d1", "execute", "kjeb-db", "--remote", "--file=" + sqlFile], { encoding: "utf8" });
    console.log(out.split("\n").filter(l => /rows_written|success|Error/i.test(l)).join("\n") || "완료");
  } catch (e) { console.error("D1 적재 실패:", e.message); process.exit(1); }
  fs.unlinkSync(sqlFile);
}

// 치료성 비급여만 추출 (행정수수료·예방접종·교육상담 제외), 가격 높은 순 상위 N
function nonpayItems(ykiho) {
  const EY = encodeURIComponent(ykiho);
  const url = `http://apis.data.go.kr/B551182/nonPaymentDamtInfoService/getNonPaymentItemHospDtlList?serviceKey=${HIRA_KEY}&pageNo=1&numOfRows=100&ykiho=${EY}`;
  let xml; try { xml = execFileSync("curl", ["-s", "-4", "--max-time", "30", url], { encoding: "utf8", maxBuffer: 1 << 24 }); } catch { return []; }
  const out = [];
  for (const it of (xml.match(/<item>[\s\S]*?<\/item>/g) || [])) {
    const n = xget(it, "npayKorNm"); const p = parseInt(xget(it, "curAmt") || "0", 10);
    if (!n || !p) continue;
    if (/^(제증명|예방접종|교육상담)/.test(n)) continue; // 행정·예방접종 제외
    out.push({ n, p });
  }
  out.sort((a, b) => b.p - a.p);
  return out.slice(0, 8);
}

// 적정성평가 등급 조회 (과잉진료 직결 약제 항목만 추출). 새 승인 키 사용.
function asmGrades(ykiho) {
  const EY = encodeURIComponent(ykiho);
  const url = `http://apis.data.go.kr/B551182/hospAsmInfoService1/getHospAsmInfo1?serviceKey=${ASM_KEY}&pageNo=1&numOfRows=3&ykiho=${EY}`;
  let xml; try { xml = execFileSync("curl", ["-s", "-4", "--max-time", "30", url], { encoding: "utf8", maxBuffer: 1 << 24 }); } catch { return null; }
  const out = {};
  for (const code of Object.keys(ASM_ITEMS)) {
    const m = xml.match(new RegExp(`<asmGrd${code}>(.*?)</asmGrd${code}>`));
    const v = m ? m[1].trim() : "";
    if (v && v !== "등급제외" && /^[1-5]$/.test(v)) out[code] = parseInt(v, 10);
  }
  return Object.keys(out).length ? out : null;
}

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

    if (ASM) {
      let cnt = 0;
      for (const h of list) {
        const g = asmGrades(h.ykiho);
        if (!g) continue;
        stmts.push(`INSERT OR REPLACE INTO hira_asm (ykiho,data,ts) VALUES ('${sqlEsc(h.ykiho)}', '${sqlEsc(JSON.stringify(g))}', ${Date.now()});`);
        cnt++;
      }
      console.log(`${dong}: ${list.length}곳 중 적정성평가 ${cnt}곳 준비`);
    } else if (NONPAY) {
      let cnt = 0;
      for (const h of list) {
        const np = nonpayItems(h.ykiho);
        if (!np.length) continue;
        stmts.push(`INSERT OR REPLACE INTO hira_nonpay (ykiho,data,ts) VALUES ('${sqlEsc(h.ykiho)}', '${sqlEsc(JSON.stringify(np))}', ${Date.now()});`);
        cnt++;
      }
      console.log(`${dong}: ${list.length}곳 중 비급여 ${cnt}곳 준비`);
    } else {
      const key = "hira_dong::" + dong;
      stmts.push(`INSERT OR REPLACE INTO hira_match_cache (name,data,ts) VALUES ('${sqlEsc(key)}', '${sqlEsc(JSON.stringify(list))}', ${Date.now()});`);
      console.log(`${dong}: ${list.length}건 준비`);
    }
  }
  pushD1(stmts, ASM ? "적정성평가" : NONPAY ? "비급여" : dongs.length + "개 동");
})();
