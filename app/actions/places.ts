"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isKoreaCoord, type PlaceCategory } from "@/lib/places";

export type Result = { ok: true } | { ok: false; message: string };
const fail = (message = "저장하지 못했어요") => ({ ok: false as const, message });

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 세션이 끊긴 것과 짝이 없는 것은 사용자가 할 일이 다르다.
  // 둘 다 null로 뭉개면 "먼저 상대와 연결해 주세요"가 뜬다 — 틀린 안내다.
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("couple_id,member_slot")
    .eq("id", user.id)
    .maybeSingle<{ couple_id: string | null; member_slot: "a" | "b" | null }>();

  if (!me?.couple_id) return null;
  return { supabase, userId: user.id, coupleId: me.couple_id, slot: me.member_slot };
}

export async function addPlace(form: FormData): Promise<Result> {
  const ctx = await context();
  if (!ctx) return fail("먼저 상대와 연결해 주세요");

  const name = String(form.get("name") ?? "").trim();
  if (!name) return fail("이름을 입력해 주세요");

  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  const hasCoord = isKoreaCoord(lat, lng);

  const { error } = await ctx.supabase.from("places").insert({
    couple_id: ctx.coupleId,
    added_by: ctx.userId,
    name,
    category: (String(form.get("category") ?? "other") as PlaceCategory) ?? "other",
    address: String(form.get("address") ?? "").trim() || null,
    // 좌표가 없으면 목록에만 뜬다. 지도에는 안 찍힌다.
    // 엉뚱한 좌표를 넣느니 비워두는 게 낫다.
    lat: hasCoord ? lat : null,
    lng: hasCoord ? lng : null,
    source_url: String(form.get("source_url") ?? "").trim() || null,
    memo: String(form.get("memo") ?? "").trim() || null,
  });

  if (error) return fail();
  revalidatePath("/places");
  return { ok: true };
}

export async function deletePlace(id: string): Promise<Result> {
  const ctx = await context();
  if (!ctx) return fail();
  const { error } = await ctx.supabase.from("places").delete().eq("id", id);
  if (error) return fail("지우지 못했어요");
  revalidatePath("/places");
  return { ok: true };
}

/** 다녀왔음 표시. 되돌릴 수도 있다. */
export async function markVisited(id: string, visited: boolean): Promise<Result> {
  const ctx = await context();
  if (!ctx) return fail();
  const { error } = await ctx.supabase
    .from("places")
    .update({ visited_at: visited ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return fail();
  revalidatePath("/places");
  return { ok: true };
}

/**
 * 별점 — 두 사람이 각자 매긴다.
 *
 * 슬롯(a/b) 기준이라 성별과 무관하다.
 * 서로 다른 점수가 나오는 게 재밌어서 나눠 뒀다.
 */
export async function ratePlace(
  id: string,
  rating: number | null,
  wantAgain: boolean | null,
): Promise<Result> {
  const ctx = await context();
  if (!ctx) return fail();
  if (!ctx.slot) return fail();

  const column = ctx.slot === "a" ? "rating_a" : "rating_b";
  const patch: Record<string, unknown> = { [column]: rating };
  if (wantAgain !== null) patch.want_again = wantAgain;

  const { error } = await ctx.supabase.from("places").update(patch).eq("id", id);
  if (error) return fail();
  revalidatePath("/places");
  return { ok: true };
}
