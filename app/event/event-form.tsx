"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvent, updateEvent, deleteEvent } from "@/app/actions/events";
import { CATEGORY_EMOJI, suggestEmoji } from "@/lib/emoji";
import type { EventScope, EventVisibility } from "@/lib/events";

export type FormValues = {
  id?: string;
  scope: EventScope;
  visibility: EventVisibility;
  title: string;
  emoji: string | null;
  memo: string | null;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  silent: boolean;
};

const VISIBILITY: Array<{
  value: EventVisibility;
  label: string;
  hint: string;
}> = [
  { value: "full", label: "전체 공개", hint: "제목·장소까지" },
  { value: "busy", label: "시간만", hint: "바쁘다는 것만" },
  { value: "private", label: "비공개", hint: "달력에 안 보임" },
];

export function EventForm({
  initial,
  partnerLabel,
}: {
  initial: FormValues;
  partnerLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [scope, setScope] = useState<EventScope>(initial.scope);
  const [visibility, setVisibility] = useState<EventVisibility>(
    initial.visibility,
  );
  const [title, setTitle] = useState(initial.title);
  const [emoji, setEmoji] = useState<string | null>(initial.emoji);
  const [emojiTouched, setEmojiTouched] = useState(!!initial.emoji);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [error, setError] = useState<string | null>(null);

  const editing = !!initial.id;

  // 이모지는 추천만 하고 강제하지 않는다. 직접 고르면 그때부터 추천을 멈춘다.
  const shown = emoji ?? (emojiTouched ? null : suggestEmoji(title));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    if (shown) form.set("emoji", shown);

    start(async () => {
      const res = editing
        ? await updateEvent(initial.id!, form)
        : await createEvent(form);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("이 일정을 삭제할까요?")) return;
    start(async () => {
      const res = await deleteEvent(initial.id!);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  const field =
    "rounded-lg border border-line bg-card px-3 py-2 text-ink outline-none " +
    "focus:border-slot-a focus:ring-2 focus:ring-slot-a/20";

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {/* 성격을 제목보다 먼저 묻는다. 이 선택이 나머지를 결정한다. */}
      <fieldset className="grid grid-cols-2 gap-3">
        <ScopeCard
          active={scope === "shared"}
          onClick={() => setScope("shared")}
          emoji="💜"
          label="함께"
          hint="둘 다 편집"
        />
        <ScopeCard
          active={scope === "personal"}
          onClick={() => setScope("personal")}
          emoji="🙋"
          label="내 일정"
          hint="공개 수준 선택"
        />
      </fieldset>
      <input type="hidden" name="scope" value={scope} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setEmojiTouched(true);
            setEmoji(null);
          }}
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-xl"
          aria-label="이모지 지우기"
        >
          {shown ?? "＋"}
        </button>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          maxLength={100}
          required
          className={`${field} flex-1`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_EMOJI.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setEmojiTouched(true);
              setEmoji(c === emoji ? null : c);
            }}
            className={`grid size-9 place-items-center rounded-lg border text-lg ${
              shown === c ? "border-slot-a bg-slot-a-bg" : "border-line bg-card"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" name="date" defaultValue={initial.date} required className={field} />
          {!allDay && (
            <input type="time" name="start_time" defaultValue={initial.startTime} className={`${field} tnum`} />
          )}
          <span className="text-ash">→</span>
          <input type="date" name="end_date" defaultValue={initial.endDate} className={field} />
          {!allDay && (
            <input type="time" name="end_time" defaultValue={initial.endTime} className={`${field} tnum`} />
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="all_day"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="size-4"
          />
          종일
        </label>
      </div>

      <textarea
        name="memo"
        defaultValue={initial.memo ?? ""}
        placeholder="메모"
        maxLength={1000}
        rows={3}
        className={field}
      />

      {/* 개인 일정일 때만 공개 수준을 묻는다 */}
      {scope === "personal" && (
        <fieldset className="rounded-lg border border-line bg-card p-4">
          <legend className="px-1 text-sm text-ash">{partnerLabel}님에게</legend>
          <div className="flex flex-col gap-2">
            {VISIBILITY.map((v) => (
              <label key={v.value} className="flex items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="visibility"
                  value={v.value}
                  checked={visibility === v.value}
                  onChange={() => setVisibility(v.value)}
                  className="size-4"
                />
                <span className="w-20">{v.label}</span>
                <span className="text-ash">{v.hint}</span>
              </label>
            ))}
          </div>
          {visibility === "private" && (
            <p className="mt-3 text-xs leading-5 text-ash">
              빈 시간 찾기에서는 바쁨으로 계산돼요. {partnerLabel}님은 이유를 알 수
              없어요.
            </p>
          )}
        </fieldset>
      )}

      {/* 함께 일정일 때만. 개인 일정은 공개 수준이 이미 알림을 결정한다. */}
      {scope === "shared" && (
        <div className="rounded-lg border border-line bg-card p-4">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="silent" defaultChecked={initial.silent} className="size-4" />
            🔕 이 일정은 알리지 않기
          </label>
          <p className="mt-2 text-xs leading-5 text-ash">
            달력에서도 숨기려면 &lsquo;내 일정 · 비공개&rsquo;로 만드세요.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="flex-1 rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-lg border border-line px-4 py-3 text-danger"
          >
            삭제
          </button>
        )}
      </div>
    </form>
  );
}

function ScopeCard({
  active,
  onClick,
  emoji,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  emoji: string;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border-2 px-4 py-5 text-left ${
        active
          ? "border-slot-a bg-shared-bg"
          : "border-line bg-card text-ash"
      }`}
    >
      <div className="text-xl">{emoji}</div>
      <div className="mt-1 font-medium text-ink">{label}</div>
      <div className="text-xs text-ash">{hint}</div>
    </button>
  );
}
