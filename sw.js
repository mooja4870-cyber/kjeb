// sw.js — 착한병원 찾기 서비스워커 (앱 셸 캐시 + 설치 가능 조건 충족)
const CACHE = "kjeb-v1";
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
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 동적 API는 항상 네트워크(캐시 금지)
  if (/\/(search|mentions|recommend|recommendations|revgeo)\b/.test(url.pathname)) return;
  // 정적 자원은 캐시 우선, 없으면 네트워크
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
