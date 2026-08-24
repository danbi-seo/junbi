"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createChecklist } from "@/app/actions/checklists";
import { KIND_LABEL, type ChecklistKind } from "@/lib/checklist";

const KINDS: ChecklistKind[] = ["grocery", "date_prep", "todo", "free"];

export function NewListForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ChecklistKind>("grocery");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line bg-card px-4 py-3 text-sm"
      >
        ＋ 목록 만들기
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const form = new FormData(e.currentTarget);
        form.set("kind", kind);
        start(async () => {
          const res = await createChecklist(form);
          if (!res.ok) {
            setError(res.message);
            return;
          }
          setOpen(false);
          router.push(`/lists/${res.id}`);
          router.refresh();
        });
      }}
      className="flex flex-col gap-4 rounded-xl border border-line bg-card p-5"
    >
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-lg border px-3 py-2 text-sm ${
              kind === k ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
            }`}
          >
            {KIND_LABEL[k].emoji} {KIND_LABEL[k].label}
          </button>
        ))}
      </div>

      <input
        name="title"
        placeholder="이름 (예: 이번 주 장보기)"
        maxLength={60}
        required
        defaultValue={KIND_LABEL[kind].label}
        key={kind}
        className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
      />

      {/* 템플릿 — 처음부터 만들게 하면 안 쓴다 */}
      {kind === "date_prep" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="template" defaultChecked className="size-4" />
          기본 준비물 넣기 (지갑 · 보조배터리 · 우산 · 예매 확인 · 상비약)
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="travel" className="size-4" />
        여행 준비물 넣기 (여권 · 충전기 · 세면도구 · 상비약 · 예약 확인)
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          {pending ? "만드는 중…" : "만들기"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line px-4 py-3 text-sm"
        >
          취소
        </button>
      </div>
    </form>
  );
}
