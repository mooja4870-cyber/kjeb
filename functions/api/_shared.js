// functions/api/_shared.js — Cloudflare Pages Functions 공용 유틸 (server.js 로직 이식)

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function json(obj, status = 200) {
  return new Response(typeof obj === "string" ? obj : JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

export function naverHeaders(env) {
  return {
    "X-Naver-Client-Id": env.NAVER_CLIENT_ID,
    "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET,
  };
}

export function stripTag(s) { return (s || "").replace(/<[^>]*>/g, ""); }

// '과잉진료 없어요' 같은 긍정 부정문이 부정으로 오집계되지 않도록 제거
export function neutralizePos(text) {
  return text
    .replace(/과잉\s*진료\s*(가|는|도|를|없)?\s*없/g, " ")
    .replace(/바가지\s*(가|는|도)?\s*없/g, " ")
    .replace(/덤터기\s*(가|는|도)?\s*없/g, " ")
    .replace(/강요\s*(가|는|도|하지)?\s*(없|않)/g, " ");
}

export const POS_KW = ["착한","양심","과잉진료 없","과잉진료없","과잉 없","바가지 없","덤터기 없","강요 없","강요 안","강요하지 않","친절","꼼꼼","세심","자연치아","보존치료","살려주","안 아프게","안아프게","정직","믿고","믿을 만","재방문","단골","추천","만족","최고","좋았","좋아요","good"];
export const NEG_KW = ["과잉진료","과잉 진료","바가지","덤터기","강요","불친절","사기","돈만","불필요한 치료","과다청구","불만","최악","후회","다신 안","두 번 다시","비추","호구","뜯","폭리"];
export const AD_KW = ["체험단","협찬","소정의 원고료","원고료","유료광고","제공받아","제공 받아","제공받았","무상으로 제공","대가성","경제적 대가","서포터즈","앰배서더","앰버서더","기자단","파트너스","쿠팡","애드","광고 포함","유료 광고"];
