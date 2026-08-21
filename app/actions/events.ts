"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { wallToInstant } from "@/lib/time";
import type { EventScope, EventVisibility } from "@/lib/events";

/**
 * 일정 생성 · 수정 · 삭제.
 *
 * 권한은 여기서 확인하지 않는다. RLS가 이미 막고 있다.
 *   - couple_id가 내 커플이 아니면 0 rows
 *   - 상대의 개인 일정을 수정하려 하면 0 rows
 *   - 구글에서 가져온 일정(read_only)은 수정 불가
 * 화면에서 한 번 더 막는 건 사용자 편의고, 실제 방어선은 DB다.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  NOT_PAIRED: "먼저 상대와 연결해 주세요",
  NO_TITLE: "제목을 입력해 주세요",
  BAD_RANGE: "끝나는 시각이 시작보다 빨라요",
};

function fail(code: string): ActionResult {
  // DB 오류 원문을 화면에 띄우지 않는다. 스키마 구조가 노출된다 → docs/07-api.md
  return { ok: false, message: MESSAGES[code] ?? "저장하지 못했어요. 다시 시도해 주세요" };
}

type Input = {
  scope: EventScope;
  visibility: EventVisibility;
  title: string;
  emoji: string | null;
  memo: string | null;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  silent: boolean;
};

function parse(form: FormData): Input {
  const scope = (form.get("scope") as EventScope) ?? "personal";
  const allDay = form.get("all_day") === "on";
  const date = String(form.get("date") ?? "");
  return {
    scope,
    // 함께 일정은 항상 전체 공개다. DB에도 제약이 걸려 있다(shared_is_always_full).
    // 함께 만든 일정을 한쪽이 가릴 수 있으면 '함께'의 의미가 사라진다.
    visibility:
      scope === "shared"
        ? "full"
        : ((form.get("visibility") as EventVisibility) ?? "busy"),
    title: String(form.get("title") ?? "").trim(),
    emoji: (String(form.get("emoji") ?? "").trim() || null) as string | null,
    memo: (String(form.get("memo") ?? "").trim() || null) as string | null,
    date,
    endDate: String(form.get("end_date") || date),
    startTime: String(form.get("start_time") ?? "09:00"),
    endTime: String(form.get("end_time") ?? "10:00"),
    allDay,
    // '이 일정은 알리지 않기'는 함께 일정에만 노출한다.
    // 개인 일정은 공개 수준에 따라 알림이 이미 결정되므로 스위치가 중복이다.
    silent: scope === "shared" && form.get("silent") === "on",
  };
}

function toRange(i: Input, timeZone: string) {
  if (i.allDay) {
    // 종일은 시각이 아니라 날짜의 의미다. 그 시간대의 00:00으로 잡는다.
    const from = wallToInstant(i.date, "00:00", timeZone);
    const to = wallToInstant(i.endDate, "00:00", timeZone);
    // 하루짜리면 끝을 다음 날 00:00으로. 그래야 하루를 온전히 덮는다.
    const end = to.getTime() <= from.getTime() ? new Date(from.getTime() + 86400000) : new Date(to.getTime() + 86400000);
    return { starts_at: from.toISOString(), ends_at: end.toISOString() };
  }
  return {
    starts_at: wallToInstant(i.date, i.startTime, timeZone).toISOString(),
    ends_at: wallToInstant(i.endDate, i.endTime, timeZone).toISOString(),
  };
}

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("profiles")
    .select("couple_id,timezone")
    .eq("id", user.id)
    .maybeSingle<{ couple_id: string | null; timezone: string }>();

  if (!me?.couple_id) return null;
  return { supabase, userId: user.id, coupleId: me.couple_id, timeZone: me.timezone };
}

export async function createEvent(form: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return fail("NOT_PAIRED");

  const i = parse(form);
  if (!i.title) return fail("NO_TITLE");

  const range = toRange(i, ctx.timeZone);
  if (new Date(range.ends_at) < new Date(range.starts_at)) return fail("BAD_RANGE");

  const { error } = await ctx.supabase.from("events").insert({
    couple_id: ctx.coupleId,
    owner_id: ctx.userId,
    scope: i.scope,
    visibility: i.visibility,
    title: i.title,
    emoji: i.emoji,
    memo: i.memo,
    all_day: i.allDay,
    silent: i.silent,
    ...range,
  });

  if (error) return fail(error.code ?? "");

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateEvent(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return fail("NOT_PAIRED");

  const i = parse(form);
  if (!i.title) return fail("NO_TITLE");

  const range = toRange(i, ctx.timeZone);
  if (new Date(range.ends_at) < new Date(range.starts_at)) return fail("BAD_RANGE");

  const { error } = await ctx.supabase
    .from("events")
    .update({
      scope: i.scope,
      visibility: i.visibility,
      title: i.title,
      emoji: i.emoji,
      memo: i.memo,
      all_day: i.allDay,
      silent: i.silent,
      ...range,
    })
    .eq("id", id);

  if (error) return fail(error.code ?? "");

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * 소프트 삭제만 쓴다.
 * .ics의 ETag가 max(updated_at)에 걸려 있어서, 행이 사라지면 최대값이
 * 과거로 돌아가 캘린더 앱이 갱신을 건너뛴다 → docs/12-ics-feed.md
 */
export async function deleteEvent(id: string): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return fail("NOT_PAIRED");

  const { error } = await ctx.supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return fail(error.code ?? "");

  revalidatePath("/", "layout");
  return { ok: true };
}
