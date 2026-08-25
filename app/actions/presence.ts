"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { StatusKind } from "@/lib/presence";

export type Result = { ok: true } | { ok: false; message: string };

const fail = (message = "저장하지 못했어요") => ({ ok: false as const, message });

export async function setStatus(
  kind: StatusKind,
  emoji: string,
  text: string | null,
  hours: number,
): Promise<Result> {
  const supabase = await createClient();
  // 알림 판정(발신·수신 설정, 조용한 시간)은 DB 함수가 한다.
  const { error } = await supabase.rpc("set_status", {
    p_kind: kind,
    p_emoji: emoji,
    p_text: text,
    // 반올림하지 않는다. '30분'(0.5)이 1시간으로 저장되던 원인이었다.
    p_hours: Math.max(0.5, hours),
  });
  if (error) return fail();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function clearStatus(kind: StatusKind): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_status", { p_kind: kind });
  if (error) return fail("지우지 못했어요");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * 루틴 추가.
 *
 * 루틴은 본인이 선언한 스케줄이다. 추적하지 않고, 언제든 끌 수 있고,
 * 틀릴 수 있다는 게 화면에 드러난다(점선). 자동 위치 감지와 다른 점이다.
 */
export async function addRoutine(form: FormData): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail();

  const label = String(form.get("label") ?? "").trim();
  const emoji = String(form.get("emoji") ?? "").trim();
  const days = form.getAll("days").map(Number).filter((n) => n >= 0 && n <= 6);
  const starts_at = String(form.get("starts_at") ?? "");
  const ends_at = String(form.get("ends_at") ?? "");

  if (!label) return fail("이름을 입력해 주세요");
  if (!days.length) return fail("요일을 골라 주세요");
  if (!starts_at || !ends_at) return fail("시간을 골라 주세요");

  const { error } = await supabase.from("routines").insert({
    user_id: user.id,
    label,
    emoji: emoji || "💼",
    days,
    starts_at,
    // ends < starts면 자정을 넘긴다. 그대로 저장하고 계산에서 처리한다.
    ends_at,
  });

  if (error) return fail();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function toggleRoutine(id: string, enabled: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("routines").update({ enabled }).eq("id", id);
  if (error) return fail();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteRoutine(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("routines").delete().eq("id", id);
  if (error) return fail("지우지 못했어요");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 오늘만 끄기 / 되돌리기. 다음 날 자동으로 풀린다. */
export async function skipToday(id: string, skip: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    skip ? "skip_routine_today" : "unskip_routine_today",
    { p_routine: id },
  );
  if (error) return fail();
  revalidatePath("/", "layout");
  return { ok: true };
}
