// functions/api/admin.js → POST /api/admin
// [관리자] 사용자 제보 검증·승인. 비밀번호는 서버 시크릿(ADMIN_PASSWORD)으로만 검증(클라이언트/저장소 비노출).
// body: { password, action: "list"|"approve"|"reject", id? }
import { CORS, json } from "./_shared.js";

export const onRequestOptions = () => new Response(null, { status: 200, headers: CORS });

export async function onRequestPost(context) {
  const { request, env } = context;
  let d;
  try { d = await request.json(); } catch { d = {}; }

  // 비밀번호 검증 (서버 시크릿)
  if (!env.ADMIN_PASSWORD || d.password !== env.ADMIN_PASSWORD) {
    return json({ error: "인증 실패" }, 401);
  }
  if (!env.DB) return json({ error: "DB 없음" }, 500);

  const action = d.action || "list";
  try {
    if (action === "list") {
      // 미승인(pending) 제보
      const { results } = await env.DB.prepare(
        `SELECT id, name, region, specialty, reasons, comment, ts, ip FROM user_recos WHERE status IS NULL OR status='pending' ORDER BY ts DESC LIMIT 500`
      ).all();
      // 자가홍보/도배 단서: IP별 총 제보 수 + 같은 병원명 제보 수
      const ipCnt = {}, nameCnt = {};
      try {
        const a = await env.DB.prepare(`SELECT ip, COUNT(*) c FROM user_recos GROUP BY ip`).all();
        (a.results || []).forEach(r => { ipCnt[r.ip] = r.c; });
        const b = await env.DB.prepare(`SELECT name, COUNT(DISTINCT ip) c FROM user_recos GROUP BY name`).all();
        (b.results || []).forEach(r => { nameCnt[r.name] = r.c; });
      } catch {}
      const items = (results || []).map(r => {
        let reasons = []; try { reasons = JSON.parse(r.reasons || "[]"); } catch {}
        const ip = r.ip || "";
        return { id: r.id, name: r.name, region: r.region, specialty: r.specialty, reasons, comment: r.comment, ts: r.ts,
          ip, ipReports: ipCnt[ip] || 1, distinctReporters: nameCnt[r.name] || 1 };
      });
      const appr = await env.DB.prepare(`SELECT COUNT(*) AS c FROM user_recos WHERE status='approved'`).first();
      return json({ ok: true, pending: items, approvedCount: appr ? appr.c : 0 });
    }
    if (action === "approve") {
      if (!d.id) return json({ error: "id 필요" }, 400);
      await env.DB.prepare(`UPDATE user_recos SET status='approved' WHERE id=?`).bind(d.id).run();
      return json({ ok: true });
    }
    if (action === "reject") {
      if (!d.id) return json({ error: "id 필요" }, 400);
      await env.DB.prepare(`DELETE FROM user_recos WHERE id=?`).bind(d.id).run();
      return json({ ok: true });
    }
    return json({ error: "알 수 없는 action" }, 400);
  } catch (e) {
    return json({ error: "처리 실패: " + e.message }, 500);
  }
}
