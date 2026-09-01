"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPetName } from "@/app/actions/pairing";
import { hon } from "@/lib/naming";

/**
 * 애칭 정하기 — docs/08-auth-pairing.md 4단계
 *
 * 연결되자마자 묻는다. 가장 재밌어하는 순간이다.
 *
 * **각자 따로 정한다.** 내 화면의 상대는 '주뇨', 상대 화면의 나는 '곰돌이'.
 * 서로 달라도 되고, 상대는 내가 뭐라고 부르는지 모른다.
 *
 * 미리보기 한 줄이 중요하다. 실제 알림이 어떻게 나올지 보여주면
 * 이상한 애칭을 덜 고른다.
 */
export function WelcomeFlow({
  partnerName,
  partnerEmoji,
  current,
}: {
  partnerName: string;
  partnerEmoji: string;
  current: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current);

  // 실명은 여기서만 나온다. 저장하고 나면 어디에도 안 보인다.
  const suggestions = ["자기", "여보", partnerName, partnerEmoji];

  const finish = (name: string) =>
    start(async () => {
      if (name) await setPetName(name);
      router.replace("/");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl">연결됐어요 💜</h1>
      <p className="text-sm leading-6 text-ash">
        {partnerName}님을 뭐라고 부를까요?
        <br />내 화면에서만 쓰는 이름이라 상대는 몰라요.
      </p>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={12}
        placeholder="애칭"
        className="w-full rounded-lg border border-line bg-card px-4 py-3 outline-none focus:border-slot-a focus:ring-2 focus:ring-slot-a/20"
      />

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setValue(s)}
            className={`rounded-2xl border px-3 py-1.5 text-sm ${
              value === s ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* 실제 알림이 어떻게 나올지 보여준다 */}
      <p className="rounded-lg bg-paper px-4 py-3 text-sm">
        → {hon(value || partnerName)}이 일정을 추가했어요
      </p>

      <p className="text-xs leading-5 text-ash">
        애칭 뒤에 항상 &lsquo;님&rsquo;이 붙어서 이모지나 영문도 어색하지 않아요.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={() => finish(value.trim())}
        className="w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
      >
        {pending ? "저장 중…" : "저장"}
      </button>

      {/* 전부 건너뛸 수 있어야 한다 */}
      <button
        type="button"
        disabled={pending}
        onClick={() => finish("")}
        className="text-sm text-ash underline underline-offset-4"
      >
        나중에
      </button>
    </div>
  );
}
