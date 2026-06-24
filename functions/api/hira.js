// functions/api/hira.js → GET /api/hira?name=&dong=&lat=&lng=
// [Phase C] 네이버 병원 → 심평원(HIRA) 요양기호(ykiho) 고신뢰 매칭 후 객관 정보 반환.
// 신원 매칭이 불확실하면 matched:false (오귀속 방지 — 방어성 핵심).
import { CORS, json } from "./_shared.js";

const CACHE_TTL = 1000 * 60 * 60 * 24 * 30; // HIRA 기본정보는 변동 느림 → 동 단위 30일 캐시

const xget = (s, t) => { const m = s.match(new RegExp(`<${t}>(.*?)</${t}>`)); return m ? m[1] : ""; };
const norm = (s) => (s || "").replace(/\s+/g, "");

// 캐시 전용: data.go.kr는 CF egress에서 도달 불가(504) → 로컬 러너(hira_sync.js)가 D1에 적재한 것을 읽음
async function fetchDong(dong, env) {
  const key = "hira_dong::" + dong;
  if (!env.DB) return { list: [], asOf: Date.now(), dbg: "no DB" };
  try {
    const row = await env.DB.prepare(`SELECT data, ts FROM hira_match_cache WHERE name=?`).bind(key).first();
    if (row) return { list: JSON.parse(row.data), asOf: row.ts };
  } catch (e) { return { list: [], asOf: Date.now(), dbg: "db err: " + e.message }; }
  return { list: [], asOf: Date.now(), dbg: "동 미동기화(hira_sync 필요)" };
}

export const onRequestOptions = () => new Response(null, { status: 200, headers: CORS });

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "").trim();
  const dong = (url.searchParams.get("dong") || "").trim();
  const lat = parseFloat(url.searchParams.get("lat"));
  const lng = parseFloat(url.searchParams.get("lng"));
  if (!name || !dong) return json({ matched: false, reason: "name/dong 필요" });
  if (!env.HIRA_KEY) return json({ matched: false, reason: "HIRA_KEY 미설정" });

  const { list, asOf, dbg } = await fetchDong(dong, env);
  if (!list.length) return json({ matched: false, reason: "해당 동 HIRA 데이터 없음", dbg });

  const ns = norm(name);
  let best = null;
  for (const c of list) {
    const nc = norm(c.name);
    const nameOk = ns === nc || ns.includes(nc) || nc.includes(ns) || (ns.length >= 5 && ns.slice(0, 5) === nc.slice(0, 5));
    let dist = Infinity;
    if (!isNaN(lat) && !isNaN(lng) && c.x && c.y) dist = Math.hypot(c.x - lng, c.y - lat) * 111000;
    const score = [nameOk ? 1 : 0, -dist];
    if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) best = { score, c, dist, nameOk };
  }
  if (!best || !best.nameOk) return json({ matched: false, reason: "고신뢰 일치 없음" });

  const { c, dist } = best;
  const confidence = dist < 400 ? "높음" : (dist < 3000 || !isFinite(dist) ? "중간" : "낮음");
  if (confidence === "낮음") return json({ matched: false, reason: "일치 신뢰도 낮음" });

  const estbYear = (c.estb || "").slice(0, 4);
  const opYears = estbYear ? (new Date().getFullYear() - parseInt(estbYear, 10)) : null;

  // 비급여 진료비 (요양기호 기준, 사전 동기화된 D1 캐시)
  let nonpay = null, nonpayAsOf = null;
  try {
    const r = await env.DB.prepare(`SELECT data, ts FROM hira_nonpay WHERE ykiho=?`).bind(c.ykiho).first();
    if (r) { nonpay = JSON.parse(r.data); nonpayAsOf = r.ts; }
  } catch {}

  // 적정성평가 등급 (약제 과잉처방 직결 항목)
  let asm = null, asmAsOf = null;
  try {
    const r = await env.DB.prepare(`SELECT data, ts FROM hira_asm WHERE ykiho=?`).bind(c.ykiho).first();
    if (r) { asm = JSON.parse(r.data); asmAsOf = r.ts; }
  } catch {}

  return json({
    matched: true, confidence,
    ykiho: c.ykiho, hiraName: c.name, hiraAddr: c.addr,
    doctorCnt: c.dr, estbYear: estbYear || null, opYears, clNm: c.cl,
    distM: isFinite(dist) ? Math.round(dist) : null,
    nonpay, nonpayAsOf, asm, asmAsOf,
    source: "건강보험심사평가원 병원기본정보(hospInfoServicev2)", asOf,
  });
}
