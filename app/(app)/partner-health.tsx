"use client";

import { useEffect, useState } from "react";
import { todayIn } from "@/lib/time";
import {
  CYCLE_COPY,
  buildPartnerMarks,
  energyOf,
  isoDay,
  type DayMark,
  type PartnerHealth,
} from "@/lib/health";

/**
 * 상대 컨디션 — 한 번 눌러야 보인다.
 *
 * 메인 화면은 늘 켜져 있는 화면이다. 카페 테이블 위에 올려두고, 옆자리에서
 * 보이고, 누가 사진을 찍어도 들어간다. 거기에 생리 여부가 그냥 떠 있으면
 * 공유를 켠 사람이 감수하는 위험이 '상대에게 보여주기'를 넘어선다.
 *
 * 공유를 켰다는 건 "너에게 보여줄게"지 "네 화면에 항상 띄워 둬"가 아니다.
 * 그래서 칩 하나로 접어 두고, 누르면 그때 펼친다.
 *
 * 칩은 볼 게 있을 때만 뜬다. 공유가 꺼져 있는 것과 기록이 없는 것이
 * 구별되면 안 되므로, 둘 다 칩이 아예 없는 상태로 같다 → docs/19-health.md F
 *
 * 여기 그리는 값은 전부 partner_health()가 계산해 내보낸 파생값이다.
 * 며칠째인지, 생리량, 통증, 증상, 메모, 예측 근거, 지연 여부는 오지 않는다.
 */
export function PartnerHealthChip({
  health,
  partnerLabel,
  timeZone,
}: {
  health: PartnerHealth | null;
  partnerLabel: string;
  timeZone: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const hasCondition = Boolean(health?.condition?.energy);
  const hasCycle = Boolean(health?.periods?.length || health?.fertileFrom);
  if (!health?.shared || (!hasCondition && !hasCycle)) return null;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-line bg-card px-3 text-sm"
      >
        컨디션
        <span className="text-xs text-ash">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <button
          type="button"
          aria-label="닫기"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}

      {open && (
        <div className="absolute top-full left-0 z-30 mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-line bg-card p-4 shadow-lg">
          <Panel health={health} partnerLabel={partnerLabel} timeZone={timeZone} />
        </div>
      )}
    </span>
  );
}

function Panel({
  health,
  partnerLabel,
  timeZone,
}: {
  health: PartnerHealth;
  partnerLabel: string;
  timeZone: string;
}) {
  const [offset, setOffset] = useState(0);
  // 서버가 사용자 시간대로 계산한 오늘. new Date()로 만들면 UTC 기준이라
  // 한국 시간 밤 9시가 넘으면 하루 어긋난다.
  const today = todayIn(timeZone);

  const marks = buildPartnerMarks(
    health.periods,
    health.fertileFrom,
    health.fertileTo,
    today,
  );

  // 달도 today에서 뽑는다. new Date()로 잡으면 월말 밤에 지난달이 열린다.
  const month = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, 1),
  );
  const first = month.getUTCDay();
  const days = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();

  const energy = energyOf(health.condition?.energy);
  const areas = health.condition?.painAreas ?? [];
  const hasCycle = Boolean(health.periods?.length || health.fertileFrom);

  return (
    <>
      {health.periodActive && <p className="text-sm">🩸 생리 중</p>}

      {energy && (
        <p className="mt-1 text-sm">
          {energy.emoji} {energy.label}
          {areas.length ? ` · ${areas.join(" · ")}` : ""}
        </p>
      )}

      {hasCycle && (
        <>
          <div className="mt-4 mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setOffset((o) => o - 1)}
              aria-label="이전 달"
              className="px-2 py-1 text-ash"
            >
              ‹
            </button>
            <span className="text-sm">
              {month.getUTCFullYear()}년 {month.getUTCMonth() + 1}월
            </span>
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label="다음 달"
              className="px-2 py-1 text-ash"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-ash">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const iso = isoDay(
                new Date(
                  Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i + 1),
                ),
              );
              const mark = marks.get(iso) ?? null;
              return (
                <div
                  key={iso}
                  className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm ${
                    mark ? MARK_STYLE[mark] : ""
                  } ${iso === today ? "outline-1 outline-offset-1 outline-ink" : ""}`}
                >
                  <span>{i + 1}</span>
                  {/* 색으로만 구분하지 않는다 → 설계 원칙 4 */}
                  <span className="text-[9px] leading-none">
                    {mark ? MARK_GLYPH[mark] : " "}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-col gap-1.5 text-xs text-ash">
            <span className="flex items-center gap-1.5">
              <span className={`inline-block size-3 rounded ${MARK_STYLE.recorded}`} />
              {CYCLE_COPY.cycle}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`inline-block size-3 rounded ${MARK_STYLE.fertile}`} />
              {CYCLE_COPY.fertile}
            </span>
          </div>

          {/* 상대 화면의 달력에도 disclaimer를 붙인다 → docs/19-health.md E */}
          <p className="mt-2 text-xs leading-5 text-ash">{CYCLE_COPY.disclaimer}</p>
        </>
      )}

      <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ash">
        {partnerLabel}님이 켠 것만 보여요. 언제든 꺼질 수 있고, 꺼져도 알림은
        가지 않아요.
      </p>
    </>
  );
}

// 본인 화면과 같은 규칙. 다만 '생리 예상'은 상대에게 오지 않는다.
const MARK_STYLE: Record<Exclude<DayMark, null>, string> = {
  recorded: "bg-slot-a text-white",
  predicted: "bg-slot-a/35",
  fertile: "bg-fertile-bg text-fertile ring-1 ring-inset ring-fertile/40",
};
const MARK_GLYPH: Record<Exclude<DayMark, null>, string> = {
  recorded: "●",
  predicted: "░",
  fertile: "▒",
};
