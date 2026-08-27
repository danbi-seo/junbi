"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; message: string };

const fail = (message = "처리하지 못했어요") => ({ ok: false as const, message });

export type DissolveSummary = {
  sharedEvents: number;
  places: number;
  expenses: number;
  checklists: number;
  anniversaries: number;
  cycles: number;
  conditions: number;
  myEvents: number;
};

/**
 * 해제 확인 화면에 띄울 숫자.
 *
 * '모든 데이터가 삭제됩니다'보다 '함께 일정 142개'가 훨씬 정확한 판단을
 * 만든다 → docs/08-auth-pairing.md 5
 */
export async function dissolveSummary(): Promise<DissolveSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("dissolve_summary");
  return (data as DissolveSummary) ?? null;
}

/**
 * 연결 해제.
 *
 * 상대 동의를 요구하지 않는다. 승인 대기를 만들면 그 사이 상대는 계속
 * 내 일정과 상태를 본다. 헤어지는 상황에서 이건 안전 문제다.
 */
export async function dissolveCouple(purgeNow: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dissolve_couple", {
    p_purge_now: purgeNow,
  });
  if (error) {
    return fail(
      error.message.includes("NOT_PAIRED")
        ? "연결된 상대가 없어요"
        : "해제하지 못했어요",
    );
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 끊는 건 혼자, 잇는 건 둘이. 방향이 다르다. */
export async function requestRestore(): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_restore");
  if (error) {
    return fail(
      error.message.includes("EXPIRED")
        ? "유예 기간이 지나 되돌릴 수 없어요"
        : error.message.includes("NO_PREVIOUS")
          ? "되돌릴 연결이 없어요"
          : "요청하지 못했어요",
    );
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function acceptRestore(): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_restore");
  if (error) {
    return fail(
      error.message.includes("NEED_PARTNER")
        ? "상대가 수락해야 다시 연결돼요"
        : error.message.includes("EXPIRED")
          ? "유예 기간이 지나 되돌릴 수 없어요"
          : error.message.includes("NO_REQUEST")
            ? "아직 요청이 없어요"
            : "연결하지 못했어요",
    );
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 해제 전에 내 것만 받아 간다. 건강 기록은 exportHealth()가 따로 있다. */
export async function exportCoupleData(): Promise<Result<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_my_couple_data");
  if (error || !data) return fail("내보내지 못했어요");
  return { ok: true, data: JSON.stringify(data, null, 2) };
}
