"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { findFreeSlots, proposeSlot } from "@/app/actions/availability";
import {
  PRESETS,
  rangeOf,
  onlyWeekend,
  slotLabel,
  durationLabel,
  type FreeSlot,
  type Preset,
} from "@/lib/availability";

/**
 * 빈 시간 찾기 — docs/17-availability.md
 *
 * 상위 5개만 보여준다. 10개를 주면 아무것도 고르지 못한다.
 *
 * '비공개 일정과 겹쳐요' 경고는 그 일정 소유자에게만 온다.
 * 상대 화면에는 그냥 순위가 조금 낮은 후보로 보인다.
 */
export function FreeView({
  timeZone,
  partnerLabel,
}: {
  timeZone: string;
  partnerLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [slots, setSlots] = useState<FreeSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [proposed, setProposed] = useState<string | null>(null);

  function search(p: Preset) {
    setPreset(p);
    setError(null);
    setSlots(null);
    setProposed(null);
    const { from, to } = rangeOf(p, timeZone);

    start(async () => {
      const res = await findFreeSlots(from, to, p.minMinutes);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setSlots(p.weekendOnly ? onlyWeekend(res.slots, timeZone) : res.slots);
    });
  }

  function propose(slot: FreeSlot) {
    start(async () => {
      const res = await proposeSlot(
        slot.starts_at,
        slot.ends_at,
        title.trim() || "만나기",
      );
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setProposed(slot.starts_at);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => search(p)}
            disabled={pending}
            className={`rounded-lg border px-3 py-2 text-sm ${
              preset.key === p.key && slots
                ? "border-slot-a bg-slot-a-bg"
                : "border-line text-ash"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="text-xs leading-5 text-ash">
        최소 {durationLabel(preset.minMinutes)} 이상, 두 사람 모두 비어 있는
        시간만 찾아요.
      </p>

      {pending && <p className="text-sm text-ash">찾는 중…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {slots && slots.length === 0 && (
        <div className="rounded-xl border border-line bg-card p-5 text-sm leading-6">
          {/* 빈 화면은 사과하지 않고 다음 행동을 가리킨다 → docs/09-ui-spec.md */}
          <p>이 기간에 둘 다 비는 시간이 없어요.</p>
          <p className="mt-1 text-ash">조건을 넓혀 볼까요?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.filter((p) => p.key !== preset.key).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => search(p)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {slots && slots.length > 0 && (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="무엇을 할까요? (예: 저녁 먹기)"
            maxLength={100}
            className="rounded-lg border border-line bg-card px-3 py-2 outline-none focus:border-slot-a"
          />

          <ul className="flex flex-col gap-2">
            {slots.map((s) => (
              <li
                key={s.starts_at}
                className="rounded-xl border border-line bg-card p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="tnum">✨ {slotLabel(s, timeZone)}</span>
                  <span className="shrink-0 text-xs text-ash">
                    {durationLabel(s.minutes)}
                  </span>
                </div>

                {/* 이 경고는 소유자 화면에만 나온다.
                    상대에게는 순위가 조금 낮은 후보로 보일 뿐이다. */}
                {s.my_private_conflict && (
                  <p className="mt-2 text-xs leading-5 text-ash">
                    ⚠️ 내 비공개 일정과 겹쳐요. {partnerLabel}님은 이유를 알 수
                    없어요.
                  </p>
                )}

                {proposed === s.starts_at ? (
                  <p className="mt-3 text-xs text-ok">
                    제안했어요. {partnerLabel}님이 수락하면 확정돼요.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => propose(s)}
                    disabled={pending}
                    className="mt-3 rounded-lg bg-slot-a px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    이 시간으로 제안
                  </button>
                )}
              </li>
            ))}
          </ul>

          <p className="text-xs leading-5 text-ash">
            제안은 확정이 아니에요. {partnerLabel}님이 수락해야 일정이 됩니다.
          </p>
        </>
      )}
    </div>
  );
}
