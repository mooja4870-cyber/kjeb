// functions/api/correction.js → POST /api/correction
// [Phase A] 병원 정보 정정·이의제기 접수 (병원 관계자) — D1 data_corrections에 저장
import { CORS, json, stripTag } from "./_shared.js";

export const onRequestOptions = () => new Response(null, { status: 200, headers: CORS });

export async function onRequestPost(context) {
  const { request, env } = context;
  let d;
  try { d = await request.json(); } catch { d = {}; }

  const name = stripTag(d.name || "").trim().slice(0, 80);
  const region = stripTag(d.region || "").trim().slice(0, 80);
  const kind = stripTag(d.kind || "").trim().slice(0, 30);
  const message = stripTag(d.message || "").trim().slice(0, 600);
  const contact = stripTag(d.contact || "").trim().slice(0, 80);
  const ip = (request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for") || "").split(",")[0].trim();

  if (!name || !message) return json({ error: "병원명과 정정 내용은 필수입니다." }, 400);
  if (!env.DB) return json({ error: "접수에 실패했습니다." }, 400);

  try {
    const cnt = await env.DB.prepare(`SELECT COUNT(*) AS c FROM data_corrections WHERE ip=? AND ts > ?`)
      .bind(ip, Date.now() - 60000).first();
    if (cnt && cnt.c >= 3) return json({ error: "잠시 후 다시 시도해주세요." }, 400);

    const res = await env.DB.prepare(
      `INSERT INTO data_corrections (name,region,kind,message,contact,status,ip,ts) VALUES (?,?,?,?,?, 'open', ?,?)`
    ).bind(name, region, kind, message, contact, ip, Date.now()).run();
    return json({ ok: true, id: res.meta.last_row_id });
  } catch (e) {
    return json({ error: "접수에 실패했습니다." }, 400);
  }
}
