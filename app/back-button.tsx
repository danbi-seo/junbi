"use client";

import { useRouter } from "next/navigation";

/**
 * 뒤로 가기.
 *
 * '취소'가 아니라 뒤로여야 하는 이유: 달력에서 일정을 눌러 들어왔으면
 * 돌아갈 곳은 홈이 아니라 보고 있던 그 날짜다. 홈으로 보내면 스크롤도
 * 고른 날짜도 잃는다.
 *
 * 다만 알림이나 .ics 링크를 눌러 앱 밖에서 바로 들어온 경우에는 돌아갈 데가
 * 없다. 그때는 fallback으로 보낸다.
 */
export function BackButton({
  fallback = "/",
  label = "뒤로",
}: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      // 손가락으로 누르는 것은 44px 이상 → docs/09-ui-spec.md
      className="-ml-2 grid size-11 shrink-0 place-items-center rounded-lg text-2xl leading-none text-ash hover:bg-slot-a-bg"
    >
      ‹
    </button>
  );
}
