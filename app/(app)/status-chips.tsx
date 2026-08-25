"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setStatus, clearStatus } from "@/app/actions/presence";
import {
  PRESETS,
  TTL_OPTIONS,
  untilLabel,
  type CurrentStatus,
  type StatusKind,
} from "@/lib/presence";

/**
 * 상태 칩 — docs/09-ui-spec.md
 *
 *   실선 + 흰 배경   본인이 쓴 상태
 *   점선 + 투명      루틴에서 추정한 상태
 *
 * 상대 칩을 탭하면 아무 반응이 없어야 한다.
 * 뭔가 뜨면 캐묻는 느낌이 된다.
 */

function Chip({ s, timeZone }: { s: CurrentStatus; timeZone: string }) {
  return (
    <span
      className={`inline-flex h-8 items-center gap-1.5 rounded-2xl px-3 text-sm ${
        s.is_auto
          ? "border border-dashed border-slot-b/50 text-ash"
          : "border border-line bg-card"
      }`}
      title={s.is_auto ? "루틴에서 추정한 상태예요" : undefined}
    >
      <span>{s.emoji}</span>
      {s.label && <span>{s.label}</span>}
      {s.is_auto && (
        <span className="text-xs text-ash">
          {untilLabel(s.until, timeZone)}까지
        </span>
      )}
    </span>
  );
}

/** 상대 상태 — 읽기만 한다 */
export function PartnerStatus({
  statuses,
  timeZone,
}: {
  statuses: CurrentStatus[];
  timeZone: string;
}) {
  // 비어 있으면 아무 문구도 쓰지 않는다.
  // '상태 없음'이나 '오프라인'을 쓰면 접속 여부를 노출하는 감각이 생긴다.
  if (!statuses.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {statuses.map((s) => (
        <Chip key={s.kind} s={s} timeZone={timeZone} />
      ))}
    </div>
  );
}

/** 내 상태 — 탭하면 편집 */
export function MyStatus({
  statuses,
  timeZone,
}: {
  statuses: CurrentStatus[];
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Exclude<StatusKind, "free">>("activity");
  const [hours, setHours] = useState(4);

  // Esc로 닫힌다. 열어 놓고 나갈 길이 하나뿐이면 갇힌 느낌이 든다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function apply(emoji: string, label: string) {
    start(async () => {
      await setStatus(kind, emoji, label, hours);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="relative flex flex-col items-end gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex flex-wrap items-center justify-end gap-1.5"
      >
        {statuses.length ? (
          statuses.map((s) => <Chip key={s.kind} s={s} timeZone={timeZone} />)
        ) : (
          <span className="rounded-2xl border border-dashed border-line px-3 py-1.5 text-sm text-ash">
            상태 남기기
          </span>
        )}
        <span className="text-xs text-ash">▾</span>
      </button>

      {/*
       * 바깥을 눌러도 닫힌다. 아래 화면을 가리지 않게 투명하게 둔다.
       * 하단 탭이 z-10이라 그 위에 온다.
       */}
      {open && (
        <button
          type="button"
          aria-label="닫기"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}

      {open && (
        // 흐름에서 띄운다. 안에 두면 열 때마다 아래 내용이 통째로 밀려 내려간다.
        // 오른쪽 정렬 기준이라 right-0, 좁은 화면에서는 여백만큼 줄인다.
        <div className="absolute top-full right-0 z-30 mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-line bg-card p-4 shadow-lg">
          <div className="flex gap-2 text-sm">
            {(["activity", "condition"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-lg border px-3 py-1.5 ${
                  kind === k ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
                }`}
              >
                {k === "activity" ? "활동" : "컨디션"}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS[kind].map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={pending}
                onClick={() => apply(p.emoji, p.label)}
                className="rounded-2xl border border-line px-3 py-1.5 text-sm disabled:opacity-40"
              >
                {p.emoji} {p.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs">
            <span className="text-ash">얼마나</span>
            {TTL_OPTIONS.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setHours(t.hours)}
                className={`rounded-lg border px-2 py-1 ${
                  hours === t.hours
                    ? "border-slot-a bg-slot-a-bg"
                    : "border-line text-ash"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {statuses.some((s) => !s.is_auto) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
              {statuses
                .filter((s) => !s.is_auto)
                .map((s) => (
                  <button
                    key={s.kind}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await clearStatus(s.kind);
                        router.refresh();
                      })
                    }
                    className="text-xs text-ash underline underline-offset-4"
                  >
                    {s.emoji} 지우기
                  </button>
                ))}
            </div>
          )}

          <p className="mt-3 text-xs leading-5 text-ash">
            점선은 루틴에서 추정한 상태예요.{" "}
            <Link href="/routines" className="underline underline-offset-4">
              루틴 설정
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
