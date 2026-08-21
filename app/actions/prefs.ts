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
