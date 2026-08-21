import { createClient } from "@/lib/supabase/client";

/**
 * 웹 푸시 구독 — docs/13-notifications.md
 *
 * FCM SDK가 아니라 VAPID 기반 표준 Web Push다.
 * 서버 코드 한 벌로 갤럭시·아이폰·PC가 전부 처리된다.
 * Firebase 프로젝트도 APNs 키도 필요 없다.
 */

export type PushState =
  | "unsupported" // 브라우저가 지원하지 않음
  | "needs-install" // 아이폰은 홈 화면에 추가해야만 됨
  | "denied" // OS 레벨에서 거절. 앱에서 다시 못 물어봄
  | "default" // 아직 안 물어봄
  | "granted"; // 허용됨

export function pushState(): PushState {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // 아이폰은 홈 화면에 추가해야 PushManager가 생긴다
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return isIOS ? "needs-install" : "unsupported";
  }
  return Notification.permission as PushState;
}

function urlB64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  // SharedArrayBuffer가 아닌 ArrayBuffer임을 타입으로 못박아야
  // applicationServerKey에 넘길 수 있다
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function encodeKey(key: ArrayBuffer | null): string {
  return btoa(String.fromCharCode(...new Uint8Array(key!)));
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  await createClient().from("push_subscriptions").upsert({
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? encodeKey(sub.getKey("p256dh")),
    auth: json.keys?.auth ?? encodeKey(sub.getKey("auth")),
    user_agent: navigator.userAgent,
  });
}

/**
 * 구독한다. 반드시 사용자 제스처(버튼 클릭) 안에서 불러야 한다.
 * 페이지 로드 시 자동 호출하면 아이폰에서 무시되고 인상도 나쁘다.
 */
export async function subscribePush(): Promise<PushState> {
  if (pushState() !== "default" && pushState() !== "granted") return pushState();

  const reg = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission as PushState;

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      // 모든 푸시가 알림을 띄워야 한다. 안 띄우면 브라우저가 권한을 회수한다.
      // 즉 무음 백그라운드 동기화 용도로 쓸 수 없다.
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      ),
    }));

  await save(sub);
  return "granted";
}

/**
 * 앱에 들어올 때마다 확인한다.
 *
 * 구독은 조용히 끊긴다. 아이폰은 오래 안 쓰면 권한을 회수한다.
 * 사용자는 이유를 모른 채 "알림이 안 와요"가 된다.
 */
export async function ensurePush(): Promise<PushState> {
  const state = pushState();
  if (state !== "granted") return state;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  if (!sub) {
    // 권한은 남아 있는데 구독이 사라진 경우. 조용히 다시 구독한다.
    return subscribePush();
  }

  // endpoint가 바뀌었을 수 있으므로 항상 저장해 둔다
  await save(sub);
  return "granted";
}

export async function unsubscribePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  await createClient()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
