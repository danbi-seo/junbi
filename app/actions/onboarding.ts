"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * 홈 화면 설치를 확인했다고 기록한다.
 *
 * "다 했어요" 버튼 대신 코드로 확인한다. 자가 신고는 틀린다
 * → docs/21-onboarding.md
 */
export async function markInstalled(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 세션이 끊겼으면 조용히 넘기지 않고 로그인으로 보낸다.
  if (!user) redirect("/login");

  await supabase
    .from("onboarding_progress")
    .upsert(
      { user_id: user.id, installed_at: new Date().toISOString() },
      { onConflict: "user_id", ignoreDuplicates: false },
    );
}
