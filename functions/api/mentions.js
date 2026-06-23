// functions/api/mentions.js → GET /api/mentions?name=...
// 네이버 블로그+카페+지식인 실제 글 기반 후기 집계 (D1 mention_cache 24h)
import { CORS, json, naverHeaders, stripTag, neutralizePos, POS_KW, NEG_KW, AD_KW } from "./_shared.js";

const MENTION_TTL = 1000 * 60 * 60 * 24; // 24시간

export const onRequestOptions = () => new Response(null, { status: 200, headers: CORS });

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const name = stripTag(url.searchParams.get("name") || "").trim();
  if (!name) return json({ error: "name required" }, 400);

  // 캐시 조회
  if (env.DB) {
    try {
      const row = await env.DB.prepare(`SELECT data, ts FROM mention_cache WHERE name = ?`).bind(name).first();
      if (row && (Date.now() - row.ts) < MENTION_TTL) return json(row.data);
    } catch {}
  }

  const naverSearch = async (type) => {
    const u = `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(name)}&display=30&sort=sim`;
    // 일시 실패(타임아웃/빈응답) 대비 1회 재시도
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(u, { headers: naverHeaders(env) });
        if (!r.ok) throw new Error("naver " + r.status);
        const d = await r.json();
        return d.items || [];
      } catch {
        if (attempt === 0) await new Promise(s => setTimeout(s, 400));
      }
    }
    return [];
  };

  const [blog, cafe, kin] = await Promise.all([
    naverSearch("blog"), naverSearch("cafearticle"), naverSearch("kin"),
  ]);

  const all = [
    ...blog.map(i => ({ ...i, src: "블로그" })),
    ...cafe.map(i => ({ ...i, src: "카페" })),
    ...kin.map(i => ({ ...i, src: "지식인" })),
  ];

  let pos = 0, neg = 0, matched = 0, adCount = 0;
  const samples = [], adSamples = [];
  all.forEach(it => {
    const title = stripTag(it.title);
    const desc = stripTag(it.description);
    const text = title + " " + desc;
    if (!text.includes(name)) return; // 이름 미포함 글 제외
    matched++;
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
    if (hasPos && !hasNeg) { pos++; samples.push({ t: title, l: it.link, src: it.src, s: "pos" }); }
    else if (hasNeg && !hasPos) { neg++; samples.push({ t: title, l: it.link, src: it.src, s: "neg" }); }
    else if (hasPos && hasNeg) { pos++; samples.push({ t: title, l: it.link, src: it.src, s: "mixed" }); }
  });

  const result = JSON.stringify({ name, scanned: all.length, matched, pos, neg, adCount, samples: samples.slice(0, 6), adSamples: adSamples.slice(0, 4) });
  // 네이버가 실제로 응답했을 때(scanned>0)만 캐싱 — 일시 실패(0건)를 24h 캐시에 박제하지 않음
  if (env.DB && all.length > 0) {
    try { await env.DB.prepare(`INSERT OR REPLACE INTO mention_cache (name, data, ts) VALUES (?, ?, ?)`).bind(name, result, Date.now()).run(); } catch {}
  }
  return json(result);
}
