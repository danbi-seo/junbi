"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addRoutine,
  toggleRoutine,
  deleteRoutine,
  skipToday,
} from "@/app/actions/presence";
import { DAY_LABEL, routineDays, hhmm, type Routine } from "@/lib/presence";

const EMOJI = ["💼", "😴", "🏋️", "🚇", "📚", "🏠", "🍽", "☕"];
const PRESET_DAYS: Array<{ label: string; days: number[] }> = [
  { label: "평일", days: [1, 2, 3, 4, 5] },
  { label: "주말", days: [0, 6] },
  { label: "매일", days: [0, 1, 2, 3, 4, 5, 6] },
];

export function RoutineList({
  routines,
  skippedToday,
}: {
  routines: Routine[];
  skippedToday: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState("💼");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [error, setError] = useState<string | null>(null);

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {routines.length === 0 ? (
        <p className="text-ash">
          아직 루틴이 없어요. 평소 일정을 넣어두면 상대에게 &lsquo;지금 뭐 하는
          중&rsquo;이 자동으로 보여요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {routines.map((r) => {
            const skipped = skippedToday.includes(r.id);
            return (
              <li
                key={r.id}
                className={`rounded-xl border border-line bg-card p-4 ${
                  r.enabled ? "" : "opacity-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{r.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{r.label}</div>
                    <div className="tnum text-xs text-ash">
                      {routineDays(r.days)} · {hhmm(r.starts_at)} –{" "}
                      {hhmm(r.ends_at)}
                      {/* ends < starts면 자정을 넘긴다 */}
                      {r.ends_at <= r.starts_at && " (다음 날)"}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => toggleRoutine(r.id, !r.enabled))}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      r.enabled
                        ? "border-slot-a bg-slot-a-bg"
                        : "border-line text-ash"
                    }`}
                  >
                    {r.enabled ? "켜짐" : "꺼짐"}
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs">
                  {/* 휴가·반차 때 루틴 전체를 껐다 켜는 건 번거롭고 다시 켜는 걸 잊는다 */}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => skipToday(r.id, !skipped))}
                    className="underline underline-offset-4 text-ash"
                  >
                    {skipped ? "오늘만 끔 · 되돌리기" : "오늘만 끄기"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm("이 루틴을 지울까요?")) return;
                      act(() => deleteRoutine(r.id));
                    }}
                    className="underline underline-offset-4 text-ash"
                  >
                    지우기
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const form = new FormData(e.currentTarget);
            form.set("emoji", emoji);
            form.delete("days");
            for (const d of days) form.append("days", String(d));
            start(async () => {
              const res = await addRoutine(form);
              if (!res.ok) {
                setError(res.message);
                return;
              }
              setOpen(false);
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
            name="label"
            placeholder="이름 (예: 일하는 중)"
            maxLength={12}
            required
            className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
          />

          <div className="flex flex-wrap gap-2">
            {PRESET_DAYS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDays(p.days)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-ash"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            {DAY_LABEL.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setDays((prev) =>
                    prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                  )
                }
                className={`size-9 rounded-lg border text-sm ${
                  days.includes(i)
                    ? "border-slot-a bg-slot-a-bg"
                    : "border-line text-ash"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="time"
              name="starts_at"
              defaultValue="09:30"
              required
              className="tnum rounded-lg border border-line bg-paper px-3 py-2"
            />
            <span className="text-ash">–</span>
            <input
              type="time"
              name="ends_at"
              defaultValue="18:30"
              required
              className="tnum rounded-lg border border-line bg-paper px-3 py-2"
            />
          </div>
          <p className="text-xs leading-5 text-ash">
            끝나는 시각이 시작보다 이르면 자정을 넘긴 것으로 봐요 (예: 23:00 –
            07:00).
          </p>

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
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-line bg-card px-4 py-3 text-sm"
        >
          ＋ 루틴 추가
        </button>
      )}
    </div>
  );
}
