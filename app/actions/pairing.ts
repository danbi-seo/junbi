"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; message: string };

const fail = (message: string) => ({ ok: false as const, message });

/** 코드가 만료·사용됨 같은 상태는 사용자 잘못이 아니다. 그렇게 안 읽히게 쓴다. */
function invitedMessage(raw: string): string {
  if (raw.includes("NOT_FOUND")) return "그런 코드가 없어요. 다시 확인해 주세요.";
  if (raw.includes("USED")) return "이미 사용된 코드예요.";
  if (raw.includes("EXPIRED")) return "코드가 만료됐어요. 새 코드를 요청해 주세요.";
  if (raw.includes("OWN_CODE")) return "내가 만든 코드는 쓸 수 없어요.";
  if (raw.includes("ALREADY_PAIRED")) return "이미 연결된 상대가 있어요.";
  if (raw.includes("COUPLE_FULL")) return "이 커플은 이미 두 명이에요.";
  if (raw.includes("NO_PROFILE")) return "먼저 내 정보를 입력해 주세요.";
  return "연결되지 않았어요. 코드를 다시 확인해 주세요.";
}

export async function createMyProfile(form: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_my_profile", {
    p_name: String(form.get("name") ?? "").trim(),
    p_birth: String(form.get("birth") ?? ""),
    p_lunar: form.get("lunar") === "on",
    p_emoji: String(form.get("emoji") ?? "🐰"),
    p_display: String(form.get("display") ?? "").trim() || null,
    // 시간대를 물어보지 않는다. 브라우저가 아는 걸 또 묻지 않는다.
    p_timezone: String(form.get("timezone") ?? "Asia/Seoul"),
  });

  if (error) {
    return fail(
      error.message.includes("NAME_REQUIRED")
        ? "이름을 입력해 주세요"
        : error.message.includes("BAD_BIRTH")
          ? "생년월일을 확인해 주세요"
          : "저장하지 못했어요",
    );
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function createInvite(): Promise<
  Result<{ code: string; expiresAt: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invite");
  if (error) return fail(invitedMessage(error.message));
  revalidatePath("/pair");
  return { ok: true, data: data as { code: string; expiresAt: string } };
}

export type InvitePreview = {
  name: string;
  birthDate: string;
  birthIsLunar: boolean;
  emoji: string;
};

/** 확인 전에는 아무것도 연결되지 않는다. 이름·생일만 보고 판단한다. */
export async function previewInvite(
  code: string,
): Promise<Result<InvitePreview>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_invite", { p_code: code });
  if (error) return fail(invitedMessage(error.message));
  return { ok: true, data: data as InvitePreview };
}

export async function acceptInvite(code: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_code: code });
  if (error) return fail(invitedMessage(error.message));
  revalidatePath("/", "layout");
  return { ok: true };
}

export type PendingState = {
  mySlot: "a" | "b";
  waiting: boolean;
  partner: InvitePreview | null;
} | null;

export async function pendingPartner(): Promise<PendingState> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("pending_partner");
  return (data as PendingState) ?? null;
}

/** 초대한 쪽만 확정할 수 있다. 수락한 쪽이 스스로 확정하면 확인이 무의미해진다. */
export async function confirmPair(startedOn: string | null): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_pair", {
    p_started_on: startedOn || null,
  });
  if (error) {
    return fail(
      error.message.includes("NO_PARTNER_YET")
        ? "아직 상대가 확인하지 않았어요"
        : error.message.includes("NOT_INVITER")
          ? "초대한 쪽이 확정해요"
          : "연결하지 못했어요",
    );
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cancelPair(): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_pair");
  if (error) return fail("취소하지 못했어요");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 각자 따로 정한다. 내 화면의 상대 이름이지 상대의 이름이 아니다. */
export async function setPetName(name: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_pet_name", { p_name: name });
  if (error) return fail("저장하지 못했어요");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setStartedOn(date: string | null): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_started_on", { p_date: date || null });
  if (error) {
    return fail(
      error.message.includes("FUTURE_DATE")
        ? "앞으로의 날짜는 넣을 수 없어요"
        : "저장하지 못했어요",
    );
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
