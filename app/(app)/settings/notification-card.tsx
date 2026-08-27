"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setNotificationToggles,
  setQuietHours,
  type Toggle,
} from "@/app/actions/prefs";

/**
 * 알림 설정 — docs/13-notifications.md
 *
 * 축이 둘이다.
 *   받을 알림   내가 어떤 알림을 받을지
 *   보낼 알림   내 행동이 상대에게 알림으로 갈지
 *
 * 두 번째가 왜 필요한가. 지출을 여러 건 넣을 때, 상태를 자주 바꿀 때,
 * 개인 일정을 몰아서 정리할 때 — 내 쪽에서 상대를 안 귀찮게 하고 싶은 경우가
 * 실제로 많다. 상대가 알아서 끄기를 기대할 수는 없다.
 *
 * 둘 다 켜져야 간다. 한쪽만 꺼도 안 간다.
 *
 * 끌 수 없는 알림은 스위치를 만들지 않고 '항상'이라고 적는다.
 * 제안을 보내놓고 알림이 안 가면 제안 자체가 무의미하고,
 * 연결 해제를 조용히 하면 상대가 영문을 모른 채 남는다.
 */

export type Prefs = Record<Toggle, boolean> & {
  quiet_from: string;
  quiet_to: string;
};

/** 등록·수정은 한 줄로 묶는다. 따로 두면 고르는 사람이 없다. */
type Row =
  | { kind: "toggle"; label: string; keys: Toggle[]; hint?: string }
  | { kind: "always"; label: string };

const RECV: Row[] = [
  {
    kind: "toggle",
    label: "함께 일정 등록·수정",
    keys: ["recv_event_created", "recv_event_updated"],
  },
  { kind: "always", label: "일정 제안" },
  { kind: "toggle", label: "지출 등록", keys: ["recv_expense_added"] },
  { kind: "toggle", label: "정산", keys: ["recv_settlement"] },
  {
    kind: "toggle",
    label: "상태 변경",
    keys: ["recv_status_changed"],
    hint: "켜면 하루에 여러 번 올 수 있어요",
  },
  { kind: "toggle", label: "체크리스트 완료", keys: ["recv_checklist_done"] },
  { kind: "toggle", label: "컨디션 기록", keys: ["recv_condition"] },
  {
    kind: "toggle",
    label: "기념일",
    keys: ["recv_anniversary"],
    hint: "캘린더 구독을 걸어 두면 그쪽이 먼저 알려줘요",
  },
];

const SEND: Row[] = [
  {
    kind: "toggle",
    label: "함께 일정 등록·수정",
    keys: ["send_event_created", "send_event_updated"],
  },
  { kind: "always", label: "일정 제안" },
  { kind: "toggle", label: "지출 등록", keys: ["send_expense_added"] },
  { kind: "toggle", label: "정산", keys: ["send_settlement"] },
  { kind: "toggle", label: "상태 변경", keys: ["send_status_changed"] },
  { kind: "toggle", label: "체크리스트 완료", keys: ["send_checklist_done"] },
  {
    kind: "toggle",
    label: "컨디션 기록",
    keys: ["send_condition"],
    hint: "건강 정보라 기본은 꺼져 있어요",
  },
];

const HOURS = Array.from({ length: 24 }, (_, i) =>
  `${String(i).padStart(2, "0")}:00`,
);

export function NotificationCard({
  initial,
  partnerLabel,
}: {
  initial: Prefs;
  partnerLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<"recv" | "send">("recv");
  const [p, setP] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function toggle(keys: Toggle[]) {
    // 묶인 줄은 첫 키를 기준으로 뒤집고 나머지를 맞춘다
    const next = !p[keys[0]];
    const patch = Object.fromEntries(keys.map((k) => [k, next])) as Partial<
      Record<Toggle, boolean>
    >;
    setP((v) => ({ ...v, ...patch }));
    start(async () => {
      setError(null);
      const res = await setNotificationToggles(patch);
      if (!res.ok) {
        // 화면만 바뀌고 저장이 안 되면 껐다고 믿게 된다. 되돌린다.
        setP((v) => ({
          ...v,
          ...Object.fromEntries(keys.map((k) => [k, !next])),
        }));
        setError("저장하지 못했어요");
        return;
      }
      router.refresh();
    });
  }

  function quiet(from: string, to: string) {
    const before = { from: p.quiet_from, to: p.quiet_to };
    setP((v) => ({ ...v, quiet_from: from, quiet_to: to }));
    start(async () => {
      setError(null);
      const res = await setQuietHours(from, to);
      if (!res.ok) {
        setP((v) => ({ ...v, quiet_from: before.from, quiet_to: before.to }));
        setError("시작과 끝이 같으면 하루 종일이 돼요");
        return;
      }
      router.refresh();
    });
  }

  const rows = tab === "recv" ? RECV : SEND;

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">알림</h2>

      <div className="mt-4 flex gap-2 text-sm">
        {(
          [
            ["recv", "받을 알림"],
            ["send", "보낼 알림"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg border px-3 py-1.5 ${
              tab === k ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "send" && (
        <p className="mt-3 text-xs leading-5 text-ash">
          내가 하는 일을 {partnerLabel}님에게 알릴지 정해요. {partnerLabel}님은
          이 설정을 볼 수 없고, 바꿔도 알림이 가지 않아요.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {rows.map((row) =>
          row.kind === "always" ? (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span>{row.label}</span>
              <span className="shrink-0 text-xs text-ash">항상</span>
            </div>
          ) : (
            <div key={row.label}>
              <Switch
                label={row.label}
                on={p[row.keys[0]]}
                disabled={pending}
                onToggle={() => toggle(row.keys)}
              />
              {row.hint && (
                <p className="mt-1 text-xs leading-5 text-ash">{row.hint}</p>
              )}
            </div>
          ),
        )}
      </div>

      {/* 조용한 시간은 받는 쪽에만 있다. 보내는 쪽에는 의미가 없다. */}
      {tab === "recv" && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-sm">조용한 시간</p>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Select
              value={p.quiet_from}
              disabled={pending}
              onChange={(v) => quiet(v, p.quiet_to)}
              label="시작"
            />
            <span className="text-ash">–</span>
            <Select
              value={p.quiet_to}
              disabled={pending}
              onChange={(v) => quiet(p.quiet_from, v)}
              label="끝"
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-ash">
            이 시간에 생긴 알림은 사라지지 않고 미뤄져요. 끝나는 시각에 한꺼번에
            와요.
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <p className="mt-4 text-xs leading-5 text-ash">
        일정 제안과 연결 해제는 끌 수 없어요. 제안해 놓고 알림이 안 가면 제안한
        의미가 없으니까요.
      </p>
      <p className="mt-2 text-xs leading-5 text-ash">
        주기 관련 알림은 아예 보내지 않아요. 잠금화면에 뜨는 것 자체가 부담이
        되니까요.
      </p>
    </section>
  );
}

function Switch({
  label,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-4 text-left text-sm disabled:opacity-40"
    >
      <span>{label}</span>
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 ${
          on ? "justify-end bg-slot-a" : "justify-start bg-line"
        }`}
      >
        <span className="size-5 rounded-full bg-card" />
      </span>
    </button>
  );
}

function Select({
  value,
  label,
  disabled,
  onChange,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value.slice(0, 5)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="tnum rounded-lg border border-line bg-paper px-3 py-2 disabled:opacity-40"
    >
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </select>
  );
}
