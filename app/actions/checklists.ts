"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATES, TRAVEL_TEMPLATE, type ChecklistKind } from "@/lib/checklist";

export type Result<T = void> =
  | ({ ok: true } & (T extends void ? object : { value: T }))
  | { ok: false; message: string };

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

export async function createChecklist(
  form: FormData,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const ctx = await context();
  if (!ctx) return fail("먼저 상대와 연결해 주세요");

  const title = String(form.get("title") ?? "").trim();
  const kind = (String(form.get("kind") ?? "free") as ChecklistKind) ?? "free";
  const useTemplate = form.get("template") === "on";
  const travel = form.get("travel") === "on";

  if (!title) return fail("이름을 입력해 주세요");

  const { data, error } = await ctx.supabase
    .from("checklists")
    .insert({
      couple_id: ctx.coupleId,
      created_by: ctx.userId,
      kind,
      title,
      event_id: (String(form.get("event_id") ?? "") || null) as string | null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) return fail();

  // 템플릿 — 처음부터 만들게 하면 안 쓴다
  const preset = travel ? TRAVEL_TEMPLATE : useTemplate ? TEMPLATES[kind] : [];
  if (preset.length) {
    await ctx.supabase.from("checklist_items").insert(
      preset.map((text, i) => ({
        checklist_id: data.id,
        text,
        position: i,
      })),
    );
  }

  revalidatePath("/lists");
  return { ok: true, id: data.id };
}

export async function deleteChecklist(id: string) {
  const ctx = await context();
  if (!ctx) return fail();
  const { error } = await ctx.supabase.from("checklists").delete().eq("id", id);
  if (error) return fail("지우지 못했어요");
  revalidatePath("/lists");
  return { ok: true as const };
}

export async function addItem(checklistId: string, text: string, qty: string | null) {
  const ctx = await context();
  if (!ctx) return fail();
  if (!text.trim()) return fail("내용을 입력해 주세요");

  // 맨 아래에 붙인다
  const { data: last } = await ctx.supabase
    .from("checklist_items")
    .select("position")
    .eq("checklist_id", checklistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();

  const { error } = await ctx.supabase.from("checklist_items").insert({
    checklist_id: checklistId,
    text: text.trim(),
    qty: qty?.trim() || null,
    position: (last?.position ?? -1) + 1,
  });

  if (error) return fail();
  revalidatePath(`/lists/${checklistId}`);
  return { ok: true as const };
}

/**
 * 체크 · 해제.
 *
 * 화면은 낙관적으로 먼저 바꾸고 실패하면 되돌린다.
 * 체크박스가 서버 응답을 기다리면 마트에서 못 쓴다 → docs/07-api.md
 *
 * 두 사람이 같은 항목을 동시에 체크하면 나중 것이 이긴다. 결과가 같으니 문제없다.
 */
export async function toggleItem(id: string, checked: boolean) {
  const ctx = await context();
  if (!ctx) return fail();

  const { error } = await ctx.supabase
    .from("checklist_items")
    .update(
      checked
        ? { checked_at: new Date().toISOString(), checked_by: ctx.userId }
        : { checked_at: null, checked_by: null },
    )
    .eq("id", id);

  if (error) return fail();
  return { ok: true as const };
}

export async function deleteItem(id: string) {
  const ctx = await context();
  if (!ctx) return fail();
  const { error } = await ctx.supabase.from("checklist_items").delete().eq("id", id);
  if (error) return fail();
  return { ok: true as const };
}

/** 담당자 지정 — 이름 대신 이모지만 보여준다. 이름을 쓰면 줄이 길어진다. */
export async function assignItem(id: string, userId: string | null) {
  const ctx = await context();
  if (!ctx) return fail();
  const { error } = await ctx.supabase
    .from("checklist_items")
    .update({ assignee_id: userId })
    .eq("id", id);
  if (error) return fail();
  return { ok: true as const };
}

/** 완료한 것만 한 번에 치우기 */
export async function clearDone(checklistId: string) {
  const ctx = await context();
  if (!ctx) return fail();
  const { error } = await ctx.supabase
    .from("checklist_items")
    .delete()
    .eq("checklist_id", checklistId)
    .not("checked_at", "is", null);
  if (error) return fail();
  revalidatePath(`/lists/${checklistId}`);
  return { ok: true as const };
}
