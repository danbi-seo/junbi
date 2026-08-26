"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { unsubscribePush } from "@/lib/push";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // 이 기기의 푸시 구독을 먼저 지운다.
        //
        // 안 지우면 로그아웃한 뒤에도 이 기기 잠금화면에 상대 알림이 계속 뜬다.
        // 빌린 기기나 공용 PC에서 로그아웃하는 이유가 바로 그것인데,
        // 정작 알림은 그대로 간다 → docs/04-checklist.md D
        //
        // 로그아웃 뒤에는 RLS 때문에 지울 수 없으므로 순서가 중요하다.
        // 실패해도 로그아웃은 진행한다 — 못 나가는 게 더 나쁘다.
        try {
          await unsubscribePush();
        } catch {
          // 브라우저가 푸시를 지원하지 않거나 워커가 없는 경우
        }

        // ics_token은 지우지 않는다. 로그아웃은 기기에서 나가는 것이고,
        // 캘린더 구독은 계정에 붙은 것이다. 무효화는 연결 해제·탈퇴에서 한다.
        await createClient().auth.signOut();
        router.refresh();
        router.push("/login");
      }}
      className="text-sm text-ash underline underline-offset-4 disabled:opacity-40"
    >
      {busy ? "나가는 중…" : "로그아웃"}
    </button>
  );
}
