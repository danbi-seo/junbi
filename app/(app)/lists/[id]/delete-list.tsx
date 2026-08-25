"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteChecklist } from "@/app/actions/checklists";

/**
 * 목록 삭제.
 *
 * 항목까지 함께 사라진다. 되돌릴 수 없으니 몇 개가 지워지는지 먼저 알려준다.
 * '모든 데이터가 삭제됩니다'보다 '항목 7개'가 훨씬 정확한 판단을 만든다
 * → docs/08-auth-pairing.md
 */
export function DeleteList({
  checklistId,
  title,
  itemCount,
}: {
  checklistId: string;
  title: string;
  itemCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-xs text-ash underline underline-offset-4"
      >
        목록 지우기
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-card p-4 text-sm leading-6">
      <p>
        <span className="text-ink">{title}</span> 목록을 지울까요?
      </p>
      <p className="mt-1 text-ash">
        {itemCount > 0
          ? `항목 ${itemCount}개가 함께 사라져요. 되돌릴 수 없어요.`
          : "되돌릴 수 없어요."}
      </p>

      {error && <p className="mt-2 text-danger">{error}</p>}

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteChecklist(checklistId);
              if (!res.ok) {
                setError(res.message ?? "지우지 못했어요");
                return;
              }
              router.push("/lists");
              router.refresh();
            })
          }
          className="rounded-lg border border-danger px-4 py-2 text-danger disabled:opacity-40"
        >
          {pending ? "지우는 중…" : "지우기"}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="rounded-lg border border-line px-4 py-2"
        >
          취소
        </button>
      </div>
    </div>
  );
}
