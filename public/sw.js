/**
 * 서비스 워커 — docs/05-setup.md
 *
 * next-pwa 같은 래퍼를 쓰지 않고 직접 쓴다.
 * 3단계에서 푸시 처리를 넣어야 하는데, 래퍼가 생성한 파일은 수정이 번거롭다.
 *
 * ⚠ 캐시 정책이 이 앱에서는 보안 문제다.
 *   설계서 예시는 API가 아닌 GET을 전부 캐시하지만, 그러면 상대 일정이 담긴
 *   HTML이 기기에 남는다. 마스킹된 응답과 안 된 응답이 섞일 수도 있다.
 *   그래서 여기서는 정적 자산만 캐시하고 화면(HTML)과 API는 캐시하지 않는다.
 *   오프라인일 때는 안내 화면만 보여준다.
 */

const CACHE = "junbi-v2";
const OFFLINE = "/offline.html";

const SHELL = [OFFLINE, "/icons/192.png", "/mark-tight.png", "/mark-dark-tight.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

/** 오래 남아도 되는 것들. 내용이 바뀌면 파일 이름이 바뀐다. */
function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API는 캐시하지 않는다. 마스킹된 데이터와 안 된 데이터가 섞이면 위험하고,
  // 상대 일정이 오래된 채로 보인다.
  if (url.pathname.startsWith("/api/")) return;

  // 화면 이동 — 항상 네트워크. 실패하면 안내 화면.
  // 화면에는 상대 일정이 들어 있어 캐시에 남기지 않는다.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }

  // 정적 자산 — 캐시 우선. 없으면 받아서 저장.
  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
});

/**
 * 푸시 수신 — docs/13-notifications.md
 *
 * ⚠ 모든 push 이벤트가 알림을 띄워야 한다.
 *   안 띄우면 브라우저가 푸시 권한을 회수한다.
 *   즉 무음 백그라운드 동기화 용도로 쓸 수 없다.
 */
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: "JUNBI", body: "새 소식이 있어요" };
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(d.title ?? "JUNBI", {
        body: d.body ?? "",
        icon: "/icons/192.png",
        badge: "/icons/badge.png",
        // 같은 tag는 덮어쓴다. 상태 알림이 열 개 쌓이는 걸 막는다.
        tag: d.tag ?? undefined,
        renotify: d.renotify ?? false,
        // 안드로이드에서 상단바에 고정된다. 아이폰은 무시한다.
        requireInteraction: d.pinned ?? false,
        data: { url: d.url ?? "/" },
      });

      if (typeof d.badgeCount === "number" && self.navigator.setAppBadge) {
        await self.navigator.setAppBadge(d.badgeCount);
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // 이미 열린 창이 있으면 거기서 이동한다. 새 창을 계속 띄우지 않는다.
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        return open.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
