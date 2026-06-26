// sw.js — 착한병원 찾기 서비스워커
// v4: 강제 다크 수정본이 확실히 반영되도록 HTML/CSS/JS를 '네트워크 우선'으로,
//     활성화 시 모든 옛 캐시를 삭제한다. (옛 화면 잔존 방지)
const CACHE = "kjeb-v4";
const ASSETS = [
  "/index.html",
  "/index.css",
  "/safe-hospital-finder.html",
  "/regions.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) // 모든 옛 캐시 삭제
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 동적 API는 항상 네트워크(캐시 금지)
  if (/\/(search|mentions|recommend|recommendations|revgeo|hira)\b/.test(url.pathname)) return;
  // HTML·CSS·JS는 네트워크 우선(항상 최신), 실패 시에만 캐시 폴백
  const isShell = req.mode === "navigate" || /\.(html|css|js)$/.test(url.pathname) || url.pathname === "/";
  if (isShell) {
    e.respondWith(
      fetch(req, { cache: "no-store" }).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
  // 이미지 등은 캐시 우선
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
