"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SplitType } from "@/lib/expenses";

export type Result = { ok: true } | { ok: false; message: string };
const fail = (message = "저장하지 못했어요") => ({ ok: false as const, message });

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
  return { supabase, userId: user.id, coupleId: me.couple_id };
}

export async function addExpense(form: FormData): Promise<Result> {
  const ctx = await context();
  if (!ctx) return fail("먼저 상대와 연결해 주세요");

  // 원 단위 정수만 받는다. 쉼표와 공백은 걷어낸다.
  const amount = Number(String(form.get("amount") ?? "").replace(/[^\d]/g, ""));
  if (!Number.isInteger(amount) || amount <= 0) {
    return fail("금액을 입력해 주세요");
  }

  const split = (String(form.get("split") ?? "half") as SplitType) ?? "half";
  const ratio = Number(form.get("payer_ratio")) || 50;

  const { error } = await ctx.supabase.from("expenses").insert({
    couple_id: ctx.coupleId,
    // 누가 냈는지는 고를 수 있다. 상대가 낸 것도 내가 기록할 수 있어야 한다.
    payer_id: String(form.get("payer_id") ?? "") || ctx.userId,
    amount,
    split,
    payer_ratio: split === "custom" ? Math.min(100, Math.max(0, ratio)) : 50,
    category: String(form.get("category") ?? "") || null,
    memo: String(form.get("memo") ?? "").trim() || null,
    event_id: String(form.get("event_id") ?? "") || null,
    // 지출 시트에도 '이 건만 알리지 않기'를 둔다.
    // 금액은 앱에서 볼 수 있으니 알림을 안 보내도 정보가 사라지지 않는다.
    silent: form.get("silent") === "on",
  });

  if (error) return fail();
  revalidatePath("/expenses");
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<Result> {
  const ctx = await context();
  if (!ctx) return fail();
  const { error } = await ctx.supabase.from("expenses").delete().eq("id", id);
  if (error) return fail("지우지 못했어요");
  revalidatePath("/expenses");
  return { ok: true };
}

/**
 * 정산 완료로 표시.
 *
 * 실제 송금은 앱 밖에서 한다. 여기서는 "주고받았다"를 기록만 한다.
 * 한쪽이 누르면 즉시 반영된다 — 승인 대기를 만들면 새로운 마찰이 생긴다.
 */
export async function settleUp(memo: string | null): Promise<Result> {
  const ctx = await context();
  if (!ctx) return fail();

  const { error } = await ctx.supabase.rpc("settle_up", { p_memo: memo });
  if (error) {
    return fail(
      error.message.includes("NOTHING_TO_SETTLE")
        ? "정산할 금액이 없어요"
        : "정산하지 못했어요",
    );
  }

  revalidatePath("/expenses");
  return { ok: true };
}

/** 잘못 눌렀을 때 되돌린다. 이력에서 지운다. */
export async function undoSettlement(id: string): Promise<Result> {
  const ctx = await context();
  if (!ctx) return fail();
  const { error } = await ctx.supabase.rpc("undo_settlement", { p_id: id });
  if (error) return fail("되돌리지 못했어요");
  revalidatePath("/expenses");
  return { ok: true };
}
