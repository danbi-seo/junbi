"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 상대가 일정을 고치면 화면을 새로 읽는다.
 *
 * 구독 대상은 couple_signals다. events가 아니다.
 *   - events는 읽기 권한이 없어 Realtime이 전달하지 못한다
 *   - Realtime 페이로드에는 마스킹이 적용되지 않으므로, 내용이 실려 오면
 *     그걸 그대로 쓰고 싶은 유혹이 생긴다
 *
 * 신호 테이블에는 "바뀌었다"는 사실과 시각뿐이라 샐 것이 없다.
 * 실제 데이터는 서버 컴포넌트가 events_visible에서 다시 읽는다.
 */
export function Live() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("couple-signals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "couple_signals" },
        () => router.refresh(), // 페이로드를 쓰지 않는다
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
