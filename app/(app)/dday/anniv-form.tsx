"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAnniversary,
  deleteAnniversary,
  setStartedOn,
} from "@/app/actions/anniversaries";
import { lunarLabel } from "@/lib/anniversary";

const EMOJI = ["🎂", "💜", "✈️", "🎉", "🎁", "🌸", "🍰", "⭐"];

export function StartedOnForm({ value }: { value: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">언제부터 만났어요?</h2>
      <p className="mt-2 text-sm leading-6 text-ash">
        100일, 200일 같은 기념일을 자동으로 세어드려요.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await setStartedOn(date);
            if (!res.ok) setError(res.message);
            else router.refresh();
          });
        }}
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
        />
        <button
          type="submit"
          disabled={pending || !date}
          className="rounded-lg bg-slot-a px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "저장 중…" : value ? "바꾸기" : "저장"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

export function AnnivForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState("🎂");
  const [baseDate, setBaseDate] = useState("");
  const [isLunar, setIsLunar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 음력을 켜면 올해 양력 날짜를 바로 보여준다. 확인이 된다.
  const preview =
    isLunar && /^\d{4}-\d{2}-\d{2}$/.test(baseDate) ? lunarLabel(baseDate) : null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line bg-card px-4 py-3 text-sm"
      >
        ＋ 기념일 추가
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const form = new FormData(e.currentTarget);
        form.set("emoji", emoji);
        start(async () => {
          const res = await addAnniversary(form);
          if (!res.ok) {
            setError(res.message);
            return;
          }
          setOpen(false);
          setBaseDate("");
          router.refresh();
        });
      }}
      className="flex flex-col gap-4 rounded-xl border border-line bg-card p-5"
    >
      <div className="flex flex-wrap gap-2">
        {EMOJI.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setEmoji(c)}
            className={`grid size-9 place-items-center rounded-lg border text-lg ${
              emoji === c ? "border-slot-a bg-slot-a-bg" : "border-line"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <input
        name="title"
        placeholder="이름 (예: 엄마 생일)"
        maxLength={40}
        required
        className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          name="base_date"
          value={baseDate}
          onChange={(e) => setBaseDate(e.target.value)}
          required
          className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_lunar"
            checked={isLunar}
            onChange={(e) => setIsLunar(e.target.checked)}
            className="size-4"
          />
          음력
        </label>
      </div>

      {/* 한국에서 생일이 음력인 경우가 흔하다. 변환 결과를 즉시 보여준다. */}
      {preview && (
        <p className="text-xs leading-5 text-ash">
          입력하신 날짜는 {preview}이에요. 매년 그 음력 날짜에 맞춰 알려드려요.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="repeat" value="yearly" defaultChecked className="size-4" />
          매년
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="repeat" value="once" className="size-4" />
          한 번만
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pinned" className="size-4" />
          📌 위에 고정
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          {pending ? "저장 중…" : "저장"}
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

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("이 기념일을 지울까요?")) return;
        start(async () => {
          await deleteAnniversary(id);
          router.refresh();
        });
      }}
      className="text-xs text-ash underline underline-offset-4"
    >
      지우기
    </button>
  );
}
