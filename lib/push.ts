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
  | "granted" // 허용됨
  | "save-failed" // 권한은 받았는데 서버에 저장을 못 함
  | "no-worker" // 서비스 워커가 준비되지 않음
  | "timeout"; // 어느 단계에서 응답이 없음

/** 어디까지 갔는지. 멈추면 화면에 그대로 보여준다. */
export type PushStep = "permission" | "worker" | "subscribe" | "save" | "done";

export const STEP_LABEL: Record<PushStep, string> = {
  permission: "권한 확인",
  worker: "서비스 워커 준비",
  subscribe: "푸시 서비스 등록",
  save: "서버에 저장",
  done: "완료",
};

/** 어떤 단계도 영원히 기다리지 않게 한다. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([
    p,
    new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms)),
  ]);
}

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

async function save(sub: PushSubscription): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const json = sub.toJSON();
  // user_id를 반드시 넣는다. NOT NULL이고 기본값이 없어서
  // 빠뜨리면 저장이 조용히 실패한다 (RLS의 with check도 통과 못 한다).
  const { error } = await supabase.from("push_subscriptions").upsert({
    endpoint: sub.endpoint,
    user_id: user.id,
    p256dh: json.keys?.p256dh ?? encodeKey(sub.getKey("p256dh")),
    auth: json.keys?.auth ?? encodeKey(sub.getKey("auth")),
    user_agent: navigator.userAgent,
    failed_at: null,
  });

  return !error;
}

/**
 * 서비스 워커가 준비될 때까지 기다린다.
 *
 * navigator.serviceWorker.ready는 등록된 워커가 없으면 영원히 기다린다.
 * 개발 서버에서는 자동 등록을 하지 않으므로 여기서 직접 등록한다.
 * 그래도 안 되면 시간을 끊는다 — 버튼이 '켜는 중…'에 멈춰 있으면
 * 사용자는 원인을 알 수 없다.
 */
async function readyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (!existing) await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
  ]);
}

/**
 * 구독한다. 반드시 사용자 제스처(버튼 클릭) 안에서 불러야 한다.
 * 페이지 로드 시 자동 호출하면 아이폰에서 무시되고 인상도 나쁘다.
 */
export async function subscribePush(
  onStep?: (step: PushStep) => void,
): Promise<PushState> {
  if (pushState() !== "default" && pushState() !== "granted") return pushState();

  // 권한을 먼저 묻는다. 사용자 제스처 안에서 호출해야 하는데,
  // 앞에서 오래 기다리면 제스처가 끊긴 것으로 보는 브라우저가 있다.
  onStep?.("permission");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission as PushState;

  onStep?.("worker");
  const reg = await readyServiceWorker();
  if (!reg) return "no-worker";

  onStep?.("subscribe");
  const existing = await withTimeout(reg.pushManager.getSubscription(), 10000);
  if (existing === "timeout") return "timeout";

  let sub = existing;
  if (!sub) {
    const created = await withTimeout(
      reg.pushManager.subscribe({
        // 모든 푸시가 알림을 띄워야 한다. 안 띄우면 브라우저가 권한을 회수한다.
        // 즉 무음 백그라운드 동기화 용도로 쓸 수 없다.
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      }),
      20000,
    ).catch(() => "timeout" as const);
    if (created === "timeout") return "timeout";
    sub = created;
  }

  onStep?.("save");
  // 저장이 실패하면 알림이 안 온다. 조용히 넘기면 원인을 아무도 모른다.
  const saved = await withTimeout(save(sub), 15000);
  if (saved === "timeout") return "timeout";

  onStep?.("done");
  return saved ? "granted" : "save-failed";
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

  const reg = await readyServiceWorker();
  if (!reg) return "no-worker";
  const sub = await reg.pushManager.getSubscription();

  if (!sub) {
    // 권한은 남아 있는데 구독이 사라진 경우. 조용히 다시 구독한다.
    return subscribePush();
  }

  // endpoint가 바뀌었을 수 있으므로 항상 저장해 둔다
  return (await save(sub)) ? "granted" : "save-failed";
}

export async function unsubscribePush(): Promise<void> {
  const reg = await readyServiceWorker();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  await createClient()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
