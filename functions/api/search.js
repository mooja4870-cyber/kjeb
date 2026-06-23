// functions/api/search.js → GET /api/search
// 네이버 지역검색 프록시 + D1 hospitals(의사 수) 보강
import { CORS, json, naverHeaders } from "./_shared.js";

export const onRequestOptions = () => new Response(null, { status: 200, headers: CORS });

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const display = url.searchParams.get("display") || "20";
  const sort = url.searchParams.get("sort") || "random";

  const apiUrl = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}`;

  try {
    const r = await fetch(apiUrl, { headers: naverHeaders(env) });
    const text = await r.text();
    let naverData;
    try { naverData = JSON.parse(text); } catch { return json(text); }

    if (naverData.items && naverData.items.length && env.DB) {
      await Promise.all(naverData.items.map(async (item) => {
        const cleanName = item.title.replace(/<[^>]+>/g, "").split(" ")[0];
        try {
          const row = await env.DB.prepare(
            `SELECT drTotCnt FROM hospitals WHERE yadmNm LIKE ?`
          ).bind(`%${cleanName}%`).first();
          item.hiraData = { doctorCnt: row ? row.drTotCnt : 1 };
        } catch {
          item.hiraData = { doctorCnt: 1 };
        }
      }));
    }
    return json(naverData);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
