// functions/api/revgeo.js → GET /api/revgeo?lat=&lng=
// 좌표 → 지역명 역지오코딩 (Nominatim/OSM, 키 불필요) — 서버 최후 폴백
import { CORS, json } from "./_shared.js";

export const onRequestOptions = () => new Response(null, { status: 200, headers: CORS });

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get("lat"));
  const lng = parseFloat(url.searchParams.get("lng"));
  if (isNaN(lat) || isNaN(lng)) return json({ error: "lat/lng required" }, 400);

  const u = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ko&zoom=18`;
  try {
    const r = await fetch(u, { headers: { "User-Agent": "kjeb-hospital-finder/1.0 (good-clinic-finder)" } });
    const a = ((await r.json()).address) || {};
    const province = a.province || a.state || "";
    const city = a.city || a.county || a.town || "";
    const gu = a.borough || a.city_district || a.district || "";
    const dong = a.suburb || a.quarter || a.neighbourhood || a.village || "";
    const dongClean = dong.replace(/\d+동$/, m => m.replace(/\d+/, "")).replace(/\s/g, "");
    const parts = [city, gu, dongClean].filter(Boolean);
    const name = dongClean || gu || city || "내 위치";
    return json({ ok: true, name, full: parts.join(" "), province, city, gu, dong: dongClean });
  } catch (e) {
    return json({ error: "geocode failed" }, 400);
  }
}
