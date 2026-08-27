"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 일정 임박 알림을 몇 분 전에 받을지.
 *
 * 이 값은 .ics의 VALARM으로 나간다. 즉 알림을 울리는 건 우리 서버가 아니라
 * 아이폰·구글 캘린더다. 웹 푸시보다 훨씬 안정적이라 일정 알림은 이쪽에 맡긴다
 * → docs/13-notifications.md
 *
 * 바꾸면 .ics 내용이 바뀌지만 ETag는 events.updated_at 기준이라 안 바뀐다.
 * 캘린더 앱이 다음 폴링에서 304를 받아 옛 알림을 그대로 쓴다.
 * 그래서 여기서 소유 일정의 updated_at을 건드려 ETag를 밀어준다.
 */
export async function setUpcomingMinutes(
  minutes: number,
): Promise<{ ok: boolean }> {
  const allowed = [0, 5, 10, 30, 60, 120];
  if (!allowed.includes(minutes)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("notification_prefs")
    .update({
      upcoming_min: minutes || 60,
      recv_event_upcoming: minutes > 0,
    })
    .eq("user_id", user.id);

  if (error) return { ok: false };

  // ETag를 밀어 캘린더 앱이 새 알림을 받아가게 한다.
  // 내가 만든 일정 하나만 건드려도 최대 updated_at이 올라간다.
  await supabase
    .from("events")
    .update({ updated_at: new Date().toISOString() })
    .eq("owner_id", user.id)
    .is("deleted_at", null);

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * 알림 스위치 하나를 바꾼다.
 *
 * 화이트리스트로 막는다. 컬럼 이름을 그대로 받으면 어떤 컬럼이든 쓸 수 있다.
 * notification_prefs에는 조용한 시간과 임박 알림 설정도 같이 들어 있다.
 *
 * 바꿔도 상대에게 알림이 가지 않는다. 발신 설정을 끄는 행위가 알려지면
 * 그게 추궁 대상이 되고, 스위치는 있으나 마나가 된다 → docs/13-notifications.md
 */
const TOGGLES = [
  "recv_event_created",
  "recv_event_updated",
  "recv_expense_added",
  "recv_settlement",
  "recv_status_changed",
  "recv_checklist_done",
  "recv_condition",
  "recv_anniversary",
  "send_event_created",
  "send_event_updated",
  "send_expense_added",
  "send_settlement",
  "send_status_changed",
  "send_checklist_done",
  "send_condition",
] as const;

export type Toggle = (typeof TOGGLES)[number];

export async function setNotificationToggles(
  patch: Partial<Record<Toggle, boolean>>,
): Promise<{ ok: boolean }> {
  const entries = Object.entries(patch).filter(([k]) =>
    (TOGGLES as readonly string[]).includes(k),
  );
  if (!entries.length) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("notification_prefs")
    .update(Object.fromEntries(entries))
    .eq("user_id", user.id);

  if (error) return { ok: false };
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * 조용한 시간.
 *
 * 이 시간대에 걸린 알림은 버리지 않고 미룬다. 끝나는 시각에 몰아서 나간다
 * → next_sendable_time()
 *
 * from == to면 하루 종일이 되므로 막는다. 알림이 영영 안 나간다.
 */
export async function setQuietHours(
  from: string,
  to: string,
): Promise<{ ok: boolean }> {
  const ok = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (!ok(from) || !ok(to) || from === to) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("notification_prefs")
    .update({ quiet_from: from, quiet_to: to })
    .eq("user_id", user.id);

  if (error) return { ok: false };
  revalidatePath("/settings");
  return { ok: true };
}
