"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Result = { ok: true } | { ok: false; message: string };

/**
 * 기념일 추가 · 삭제, 사귄 날 설정.
 *
 * 권한은 RLS가 막는다. couple_id가 내 커플이 아니면 0 rows다.
 *
 * 음력은 base_date에 양력으로 저장하고 is_lunar만 켠다.
 * 조회할 때 lib/anniversary.ts가 그 해 양력으로 변환한다.
 * 음력 날짜를 그대로 저장하면 "이 값이 음력인지 양력인지"를 매번 따져야 한다.
 */

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .maybeSingle<{ couple_id: string | null }>();

  if (!me?.couple_id) return null;
  return { supabase, coupleId: me.couple_id };
}

export async function addAnniversary(form: FormData): Promise<Result> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "먼저 상대와 연결해 주세요" };

  const title = String(form.get("title") ?? "").trim();
  const base_date = String(form.get("base_date") ?? "");
  if (!title) return { ok: false, message: "이름을 입력해 주세요" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base_date))
    return { ok: false, message: "날짜를 골라 주세요" };

  const { error } = await ctx.supabase.from("anniversaries").insert({
    couple_id: ctx.coupleId,
    title,
    base_date,
    emoji: String(form.get("emoji") ?? "").trim() || null,
    repeat: form.get("repeat") === "once" ? "once" : "yearly",
    is_lunar: form.get("is_lunar") === "on",
    pinned: form.get("pinned") === "on",
  });

  if (error) return { ok: false, message: "저장하지 못했어요. 다시 시도해 주세요" };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAnniversary(id: string): Promise<Result> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "먼저 상대와 연결해 주세요" };

  const { error } = await ctx.supabase.from("anniversaries").delete().eq("id", id);
  if (error) return { ok: false, message: "지우지 못했어요" };

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * 사귄 날. 이게 없으면 100일·주년이 아예 계산되지 않는다.
 * 페어링 직후 한 번 묻고, 건너뛰면 기념일 화면에서 설정한다.
 */
export async function setStartedOn(date: string): Promise<Result> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "먼저 상대와 연결해 주세요" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { ok: false, message: "날짜를 골라 주세요" };

  const { error } = await ctx.supabase
    .from("couples")
    .update({ started_on: date })
    .eq("id", ctx.coupleId);

  if (error) return { ok: false, message: "저장하지 못했어요" };

  revalidatePath("/", "layout");
  return { ok: true };
}
