import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// web-push는 VAPID JWT 서명(ES256)과 페이로드 암호화(aes128gcm)에
// Node crypto를 쓴다. Edge 런타임에서는 동작하지 않는다 → docs/05-setup.md
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Queued = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  tag: string | null;
  pinned: boolean;
};

type Sub = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * 예약된 알림을 실제로 보낸다.
 *
 * pg_cron이 5분마다 호출한다. 1분마다는 과하다 — 두 사람 쓰는 앱에서
 * 알림 지연은 체감이 안 되고 호출 횟수는 5분의 1이 된다 → docs/05-setup.md
 *
 * ⚠ CRON_SECRET으로 보호한다. 열려 있으면 누구나 알림을 보낼 수 있다.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const admin = createAdminClient();

  const { data: queue } = await admin
    .from("notification_queue")
    .select("id,user_id,kind,title,body,url,tag,pinned")
    .is("sent_at", null)
    .lte("send_at", new Date().toISOString())
    .order("send_at")
    .limit(50)
    .returns<Queued[]>();

  if (!queue?.length) return Response.json({ sent: 0, failed: 0 });

  let sent = 0;
  let failed = 0;
  const done: string[] = [];

  for (const item of queue) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", item.user_id)
      .returns<Sub[]>();

    // 구독이 없어도 큐에서는 내린다. 안 그러면 영원히 쌓인다.
    if (!subs?.length) {
      done.push(item.id);
      continue;
    }

    const payload = JSON.stringify({
      title: item.title,
      body: item.body,
      url: item.url ?? "/",
      tag: item.tag ?? undefined,
      pinned: item.pinned,
    });

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        // 404·410은 기기가 사라진 것이다. 즉시 지운다.
        // 안 지우면 죽은 구독에 계속 보낸다.
        if (status === 404 || status === 410) {
          await admin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", s.endpoint);
        } else {
          await admin
            .from("push_subscriptions")
            .update({ failed_at: new Date().toISOString() })
            .eq("endpoint", s.endpoint);
        }
      }
    }

    done.push(item.id);
  }

  if (done.length) {
    await admin
      .from("notification_queue")
      .update({ sent_at: new Date().toISOString() })
      .in("id", done);
  }

  return Response.json({ sent, failed, processed: done.length });
}
