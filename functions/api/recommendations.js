// functions/api/recommendations.js → GET /api/recommendations?region=...
// 착한병원 제보 목록 (병원명별 집계) — 클라이언트 warmUp() 핑에도 사용
import { CORS, json, stripTag } from "./_shared.js";

export const onRequestOptions = () => new Response(null, { status: 200, headers: CORS });

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const region = stripTag(url.searchParams.get("region") || "").trim();

  if (!env.DB) return json({ items: [] });

  let sql = `SELECT name, region, specialty, reasons, comment, ts FROM user_recos`;
  const params = [];
  if (region) { sql += ` WHERE region LIKE ?`; params.push(`%${region}%`); }
  sql += ` ORDER BY ts DESC LIMIT 500`;

  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    const map = {};
    (results || []).forEach(r => {
      const key = r.name;
      if (!map[key]) map[key] = { name: r.name, region: r.region, specialty: r.specialty, count: 0, reasons: {}, comments: [] };
      map[key].count++;
      let rs = []; try { rs = JSON.parse(r.reasons || "[]"); } catch {}
      rs.forEach(x => { map[key].reasons[x] = (map[key].reasons[x] || 0) + 1; });
      if (r.comment) map[key].comments.push(r.comment);
    });
    return json({ items: Object.values(map) });
  } catch (e) {
    return json({ items: [] });
  }
}
