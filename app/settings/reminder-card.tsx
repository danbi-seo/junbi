"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUpcomingMinutes } from "@/app/actions/prefs";

const OPTIONS = [
  { value: 5, label: "5분 전" },
  { value: 10, label: "10분 전" },
  { value: 30, label: "30분 전" },
  { value: 60, label: "1시간 전" },
  { value: 120, label: "2시간 전" },
  { value: 0, label: "안 받기" },
];

export function ReminderCard({ initial }: { initial: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);

  function pick(v: number) {
    setValue(v);
    setSaved(false);
    start(async () => {
      const res = await setUpcomingMinutes(v);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">일정 알림</h2>
      <p className="mt-2 text-sm leading-6 text-ash">
        일정 시작 전에 알려드려요. 이 알림은 우리 앱이 아니라 휴대폰 캘린더가
        울립니다.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            disabled={pending}
            className={`rounded-lg border px-3 py-2 text-sm ${
              value === o.value
                ? "border-slot-a bg-slot-a-bg"
                : "border-line text-ash"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {saved && (
        <p className="mt-3 text-xs leading-5 text-ok">
          저장했어요. 캘린더 앱이 다음에 읽어갈 때 반영됩니다 — 아래로 당겨
          새로고침하면 즉시 받아가요.
        </p>
      )}

      <p className="mt-3 text-xs leading-5 text-ash">
        상대가 &lsquo;시간만&rsquo;으로 둔 일정에는 알림이 가지 않아요. 달력에서
        제목을 가려도 알림이 시각을 알려주면 가린 의미가 사라지니까요.
      </p>
    </section>
  );
}
