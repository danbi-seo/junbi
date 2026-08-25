"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MyHealth } from "@/lib/health";

export type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; message: string };

const fail = (message = "저장하지 못했어요") => ({ ok: false as const, message });

/**
 * 공개 설정.
 *
 * 끄면 조용히 사라진다. 상대에게 알림을 보내지 않는다.
 * 켠 이력·끈 이력도 저장하지 않는다 → docs/19-health.md
 */
export async function setHealthSharing(patch: {
  module?: boolean;
  cycle?: boolean;
  condition?: boolean;
  avoid?: boolean;
  consent?: boolean;
}): Promise<Result<MyHealth>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_health_sharing", {
    p_module: patch.module ?? null,
    p_cycle: patch.cycle ?? null,
    p_condition: patch.condition ?? null,
    p_avoid: patch.avoid ?? null,
    p_consent: patch.consent ?? null,
  });

  if (error) return fail();
  revalidatePath("/health");
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true, data: data as MyHealth };
}

/** 큰 버튼 하나. 시작·종료가 다 된다. */
export async function logPeriodStart(date?: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_period_start", { p_date: date ?? null });
  if (error) {
    return fail(
      error.message.includes("MODULE_OFF")
        ? "주기 기록이 꺼져 있어요"
        : error.message.includes("FUTURE_DATE")
          ? "앞으로의 날짜는 기록할 수 없어요"
          : "기록하지 못했어요",
    );
  }
  revalidatePath("/health");
  return { ok: true };
}

export async function logPeriodEnd(date?: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_period_end", { p_date: date ?? null });
  if (error) return fail("기록하지 못했어요");
  revalidatePath("/health");
  return { ok: true };
}

/** 날짜를 잘못 눌렀을 때. 고치기 어려우면 그냥 앱을 안 쓴다. */
export async function updatePeriod(
  id: string,
  patch: { from?: string; to?: string | null },
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cycles")
    .update({
      ...(patch.from ? { period_start: patch.from } : {}),
      ...("to" in patch ? { period_end: patch.to } : {}),
    })
    .eq("id", id);
  if (error) return fail("고치지 못했어요");
  revalidatePath("/health");
  return { ok: true };
}

export async function deletePeriod(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("cycles").delete().eq("id", id);
  if (error) return fail("지우지 못했어요");
  revalidatePath("/health");
  return { ok: true };
}

/** 7일 질문에 답했다. 다시 묻지 않는다. */
export async function ackOngoing(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ack_ongoing", { p_id: id });
  if (error) return fail();
  revalidatePath("/health");
  return { ok: true };
}

/** 하루 한 줄. 컨디션과 주기 항목이 같은 화면에 있다. */
export async function saveCondition(input: {
  energy?: number | null;
  painAreas?: string[];
  memo?: string | null;
  flow?: number | null;
  pain?: number | null;
  symptoms?: string[];
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_condition", {
    p_energy: input.energy ?? null,
    p_pain_areas: input.painAreas ?? null,
    p_memo: input.memo ?? null,
    p_flow: input.flow ?? null,
    p_pain: input.pain ?? null,
    p_symptoms: input.symptoms ?? null,
  });
  if (error) return fail();
  revalidatePath("/health");
  revalidatePath("/");
  return { ok: true };
}

/**
 * 내보내기.
 *
 * 파기 전에 가져갈 수 있어야 한다. 주기 기록은 다른 앱으로 옮기고 싶어
 * 할 수 있으니 CSV도 함께 준다 → docs/19-health.md J
 */
export async function exportHealth(): Promise<
  Result<{ json: string; csv: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_my_health");
  if (error || !data) return fail("내보내지 못했어요");

  type Row = {
    periodStart: string;
    periodEnd: string | null;
    flow: number | null;
    pain: number | null;
    symptoms: string[] | null;
    memo: string | null;
  };
  const d = data as { cycles: Row[] };

  const esc = (v: unknown) =>
    v == null ? "" : `"${String(v).replace(/"/g, '""')}"`;
  const csv = [
    "start,end,flow,pain,symptoms,memo",
    ...d.cycles.map((c) =>
      [c.periodStart, c.periodEnd, c.flow, c.pain, c.symptoms?.join(" "), c.memo]
        .map(esc)
        .join(","),
    ),
  ].join("\n");

  return { ok: true, data: { json: JSON.stringify(data, null, 2), csv } };
}
