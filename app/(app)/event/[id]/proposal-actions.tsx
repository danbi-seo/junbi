"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerProposal } from "@/app/actions/availability";

/**
 * 제안 수락 · 거절 — docs/17-availability.md
 *
 * 제안 상태 일정은 점선 + 반투명으로 보이고, 확정되면 실선이 된다.
 * 일정 마스킹에서 쓴 실선/점선 규칙이 여기서도 같은 뜻이다.
 */
export function ProposalActions({
  eventId,
  mine,
  partnerLabel,
}: {
  eventId: string;
  /** 내가 제안한 것인가 */
  mine: boolean;
  partnerLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function answer(accept: boolean) {
    setError(null);
    start(async () => {
      const res = await answerProposal(eventId, accept);
      if (!res.ok) {
        setError(res.message ?? "처리하지 못했어요");
        return;
      }
      router.refresh();
    });
  }

  if (mine) {
    return (
      <div className="rounded-xl border border-dashed border-slot-a bg-slot-a-bg/40 p-4 text-sm leading-6">
        <p>제안해 둔 시간이에요.</p>
        <p className="text-ash">
          {partnerLabel}님이 수락하면 확정돼요. 시간이 지나면 자동으로 취소됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-slot-a bg-slot-a-bg/40 p-4">
      <p className="text-sm leading-6">
        {partnerLabel}님이 이 시간을 제안했어요.
      </p>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => answer(true)}
          disabled={pending}
          className="flex-1 rounded-lg bg-slot-a px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "처리 중…" : "수락"}
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          disabled={pending}
          className="rounded-lg border border-line px-4 py-2.5 text-sm"
        >
          다른 시간에
        </button>
      </div>
    </div>
  );
}
