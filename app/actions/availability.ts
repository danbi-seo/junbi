"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FreeSlot } from "@/lib/availability";

export type FindResult =
  | { ok: true; slots: FreeSlot[] }
  | { ok: false; message: string };

/**
 * 빈 시간 찾기.
 *
 * 계산은 DB 함수가 한다. 여기서는 넘기고 받기만 한다.
 * 클라이언트에서 계산하면 상대의 비공개 일정 시간이 브라우저로 내려간다
 * → docs/17-availability.md
 */
export async function findFreeSlots(
  from: string,
  to: string,
  minMinutes: number,
): Promise<FindResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_free_slots", {
    p_from: from,
    p_to: to,
    p_min_minutes: minMinutes,
    p_limit: 5, // 10개를 주면 아무것도 고르지 못한다
  });

  if (error) {
    return {
      ok: false,
      message:
        error.message === "NOT_PAIRED"
          ? "먼저 상대와 연결해 주세요"
          : "빈 시간을 찾지 못했어요. 다시 시도해 주세요",
    };
  }

  return { ok: true, slots: (data ?? []) as FreeSlot[] };
}

/**
 * 제안한다. 확정이 아니다.
 *
 * 상대가 그 시간에 다른 계획이 있을 수 있다.
 * 제안 알림은 설정으로 끌 수 없다 — 제안해 놓고 안 알리면 무의미하다.
 */
export async function proposeSlot(
  starts: string,
  ends: string,
  title: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("propose_slot", {
    p_starts: starts,
    p_ends: ends,
    p_title: title,
  });

  if (error || typeof data !== "string") {
    return { ok: false, message: "제안하지 못했어요. 다시 시도해 주세요" };
  }

  revalidatePath("/", "layout");
  return { ok: true, id: data };
}

/** 수락 · 거절. 거절도 지우지 않고 기록으로 남긴다. */
export async function answerProposal(
  eventId: string,
  accept: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("answer_proposal", {
    p_event: eventId,
    p_accept: accept,
  });

  if (error) return { ok: false, message: "처리하지 못했어요" };

  revalidatePath("/", "layout");
  return { ok: true };
}
