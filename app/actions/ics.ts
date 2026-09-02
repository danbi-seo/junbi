"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * .ics 토큰 발급.
 *
 * ics_tokens는 정책이 0개라 클라이언트가 직접 못 건드린다.
 * security definer 함수만 열어 뒀다 → supabase/migrations/*_ics_token.sql
 *
 * 재발급하면 이전 주소는 즉시 404가 된다.
 * 주소가 새어나갔을 때 쓸 수 있는 유일한 대응이라 반드시 제공해야 한다.
 */

/**
 * 세션이 끊겼으면 로그인으로 보낸다.
 *
 * DB 함수들이 NOT_SIGNED_IN을 올린다. 그걸 "저장하지 못했어요"로 뭉개면
 * 사용자는 로그인된 화면에서 실패만 보고 뭘 해야 할지 모른다.
 */
function signedOut(message: string): boolean {
  return (
    message.includes("NOT_SIGNED_IN") || message.includes("NOT_AUTHENTICATED")
  );
}

export async function issueIcsToken(): Promise<
  { ok: true; token: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_ics_token");

  if (error && signedOut(error.message)) redirect("/login");
  if (error || typeof data !== "string") {
    return { ok: false, message: "주소를 만들지 못했어요. 다시 시도해 주세요" };
  }

  revalidatePath("/settings");
  return { ok: true, token: data };
}
