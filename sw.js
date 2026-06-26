// sw.js — 자가 제거(kill-switch)
// 과거 서비스워커가 옛 화면(강제 다크 등)을 캐시로 계속 보여주는 문제를 근본 제거한다.
// 기존에 SW가 설치된 기기는 다음 접속 시 이 스크립트로 갱신 → 모든 캐시 삭제 + 자기 자신 등록 해제.
// fetch 핸들러가 없으므로 SW가 어떤 요청도 가로채지 않는다(항상 네트워크 직행).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    const cs = await self.clients.matchAll();
    cs.forEach((c) => { try { c.navigate(c.url); } catch (_) {} });
  })());
});
