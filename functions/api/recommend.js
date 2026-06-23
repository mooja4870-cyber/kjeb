// functions/api/recommend.js → POST /api/recommend
// 착한병원 제보 등록 (D1 user_recos) — 도배/중복 방지 포함
import { CORS, json, stripTag } from "./_shared.js";

export const onRequestOptions = () => new Response(null, { status: 200, headers: CORS });

export async function onRequestPost(context) {
  const { request, env } = context;
  let d;
  try { d = await request.json(); } catch { d = {}; }

  const name = stripTag(d.name || "").trim().slice(0, 60);
  const region = stripTag(d.region || "").trim().slice(0, 80);
  const specialty = stripTag(d.specialty || "").trim().slice(0, 30);
  const reasons = Array.isArray(d.reasons)
    ? d.reasons.map(r => stripTag(String(r)).trim()).filter(Boolean).slice(0, 12) : [];
  const comment = stripTag(d.comment || "").trim().slice(0, 300);
  const ip = (request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for") || "").split(",")[0].trim();

  if (!name || !region || reasons.length === 0)
    return json({ error: "병원명·지역·추천이유는 필수입니다." }, 400);
  if (!env.DB) return json({ error: "저장에 실패했습니다." }, 400);

  try {
    // 도배 방지: 동일 IP 60초 내 3건 초과 차단
    const cnt = await env.DB.prepare(`SELECT COUNT(*) AS c FROM user_recos WHERE ip=? AND ts > ?`)
      .bind(ip, Date.now() - 60000).first();
    if (cnt && cnt.c >= 3) return json({ error: "잠시 후 다시 시도해주세요. (도배 방지)" }, 400);

    // 동일 IP가 같은 병원 중복 제보 차단
    const dup = await env.DB.prepare(`SELECT id FROM user_recos WHERE ip=? AND name=?`)
      .bind(ip, name).first();
    if (dup) return json({ error: "이미 이 병원을 제보하셨습니다. 감사합니다!" }, 400);

    const res = await env.DB.prepare(
      `INSERT INTO user_recos (name,region,specialty,reasons,comment,ip,ts) VALUES (?,?,?,?,?,?,?)`
    ).bind(name, region, specialty, JSON.stringify(reasons), comment, ip, Date.now()).run();

    return json({ ok: true, id: res.meta.last_row_id });
  } catch (e) {
    return json({ error: "저장에 실패했습니다." }, 400);
  }
}
