import Link from "next/link";
import { WEEKDAY, monthGridRange } from "@/lib/time";
import { kindOf, type VisibleEvent } from "@/lib/events";

/**
 * 메인 화면의 달력.
 *
 * 기본은 주 단위 한 줄이다. '월'을 누르면 그 자리에서 6줄 격자로 펼쳐진다.
 * 전화 화면에 상대 카드 + 월 격자 + 오늘 목록을 다 넣으면 아무것도 안 보인다
 * → docs/09-ui-spec.md
 *
 * 날짜를 탭하면 아래 목록이 그날로 바뀌고, 같은 날짜를 한 번 더 탭하면
 * 이음새 뷰로 들어간다. 상태를 URL에 두므로 클라이언트 코드가 필요 없다.
 */
export function Calendar({
  events,
  selected,
  today,
  view,
  me,
  timeZone,
}: {
  events: VisibleEvent[];
  selected: string;
  today: string;
  view: "week" | "month";
  me: string;
  timeZone: string;
}) {
  const year = Number(selected.slice(0, 4));
  const month = Number(selected.slice(5, 7));
  const { days } = monthGridRange(year, month, timeZone);

  // 주 뷰는 선택된 날이 든 줄 하나만 보여준다.
  const idx = days.indexOf(selected);
  const weekStart = idx >= 0 ? Math.floor(idx / 7) * 7 : 0;
  const cells = view === "week" ? days.slice(weekStart, weekStart + 7) : days;

  const marks = markersByDay(events, me, timeZone);

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-xl">{month}월</h2>
        <div className="flex items-center gap-2 text-sm">
          <Toggle active={view === "week"} href={`/?d=${selected}&v=week`}>
            주
          </Toggle>
          <Toggle active={view === "month"} href={`/?d=${selected}&v=month`}>
            월
          </Toggle>
          {/* ＋는 달력 줄 오른쪽에 둔다. 하단 플로팅 버튼은 맨 아래 줄을 가린다. */}
          <Link
            href={`/new?date=${selected}`}
            className="ml-1 rounded-lg bg-slot-a px-3 py-1.5 font-medium text-white"
          >
            ＋
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-ash">
        {WEEKDAY.map((w) => (
          <div key={w} className="pb-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const m = marks.get(d);
          const isSelected = d === selected;
          const inMonth = Number(d.slice(5, 7)) === month;
          // 같은 날을 다시 누르면 이음새 뷰로
          const href = isSelected ? `/day/${d}` : `/?d=${d}&v=${view}`;

          return (
            <Link
              key={d}
              href={href}
              className={`flex flex-col items-center gap-1 rounded-lg py-1.5 ${
                isSelected ? "bg-slot-a-bg" : ""
              } ${inMonth ? "" : "opacity-35"}`}
            >
              <span
                className={`tnum text-sm ${
                  // 오늘은 채운 원이 아니라 밑줄. 채운 원은 일정 점과 헷갈린다.
                  d === today ? "underline decoration-2 underline-offset-4" : ""
                }`}
              >
                {Number(d.slice(8, 10))}
              </span>

              <span className="flex h-3 flex-col items-center justify-start gap-0.5">
                {m?.shared && (
                  <span className="block h-1 w-4 rounded-full bg-gradient-to-r from-slot-a to-slot-b" />
                )}
                {(m?.mine || m?.theirs) && (
                  <span className="flex gap-0.5">
                    {m.mine && <span className="block size-1.5 rounded-full bg-slot-a" />}
                    {m.theirs && <span className="block size-1.5 rounded-full bg-slot-b" />}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Toggle({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-lg border px-2.5 py-1 ${
        active ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
      }`}
    >
      {children}
    </Link>
  );
}

type Mark = { shared: boolean; mine: boolean; theirs: boolean };

/** 날짜별 점 표기. 하루를 걸치는 일정은 걸친 날 전부에 찍힌다. */
export function markersByDay(
  events: VisibleEvent[],
  me: string,
  timeZone: string,
): Map<string, Mark> {
  const out = new Map<string, Mark>();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone });

  for (const e of events) {
    const kind = kindOf(e, me);
    const start = new Date(e.starts_at);
    // 종일 일정의 끝은 다음 날 00:00이므로 1분 빼서 마지막 날을 잡는다
    const end = new Date(new Date(e.ends_at).getTime() - 60000);

    for (
      let t = start, guard = 0;
      t <= end && guard < 400;
      t = new Date(t.getTime() + 86400000), guard++
    ) {
      const key = fmt.format(t);
      const m = out.get(key) ?? { shared: false, mine: false, theirs: false };
      if (kind === "shared") m.shared = true;
      else if (kind === "mine") m.mine = true;
      else m.theirs = true;
      out.set(key, m);
    }
  }
  return out;
}
