"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        // 로그아웃 시 push_subscriptions와 ics_token 정리는 3단계·2단계에서 붙인다.
        // → docs/04-checklist.md D
        await createClient().auth.signOut();
        router.refresh();
        router.push("/login");
      }}
      className="text-sm text-ash underline underline-offset-4"
    >
      로그아웃
    </button>
  );
}
