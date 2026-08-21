import Link from "next/link";
import {
  kindOf,
  titleOf,
  emojiOf,
  type Kind,
  type VisibleEvent,
} from "@/lib/events";

/**
 * 이음새 뷰 — 하루를 두 사람의 영역으로 나누고 사이에 가는 세로선을 둔다.
 *
 * 규칙 하나:
 *   함께인 것은 이음새를 가로지른다. 각자의 것은 자기 쪽에 머문다.
 *
 * 색·위치·형태·이모지 네 겹으로 구분한다. 색을 못 보거나 흑백으로 캡처해도
 * 구분돼야 한다 → docs/09-ui-spec.md
 */

const PX_PER_HOUR = 56;
const GUTTER = 40; // 시각 눈금 폭

type Placed = {
  event: VisibleEvent;
  kind: Kind;
  top: number;
  height: number;
  /** 같은 레인에서 겹칠 때 몇 번째 칸인가 */
  column: number;
  columns: number;
};

function minutesIn(iso: string, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  const [h, m] = p.split(":").map(Number);
  return h * 60 + m;
}

/** 같은 레인 안에서 겹치는 것들에 칸 번호를 매긴다. */
function pack(items: Placed[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.top - b.top);
  const groups: Placed[][] = [];
  let current: Placed[] = [];
  let groupEnd = -1;

  for (const it of sorted) {
    if (current.length && it.top >= groupEnd) {
      groups.push(current);
      current = [];
      groupEnd = -1;
    }
    current.push(it);
    groupEnd = Math.max(groupEnd, it.top + it.height);
  }
  if (current.length) groups.push(current);

  for (const g of groups) {
    g.forEach((it, i) => {
      it.column = i;
      it.columns = g.length;
    });
  }
  return sorted;
}

export function SeamView({
  events,
  me,
  myEmoji,
  partnerEmoji,
  partnerLabel,
  timeZone,
  date,
}: {
  events: VisibleEvent[];
  me: string;
  myEmoji: string;
  partnerEmoji: string;
  partnerLabel: string;
  timeZone: string;
  date: string;
}) {
  const timed = events.filter((e) => !e.all_day);
  const allDay = events.filter((e) => e.all_day);

  // 일정이 있는 구간만 보여준다. 없으면 08–23시.
  const starts = timed.map((e) => Math.floor(minutesIn(e.starts_at, timeZone) / 60));
  const ends = timed.map((e) => Math.ceil(minutesIn(e.ends_at, timeZone) / 60));
  const fromHour = Math.max(0, Math.min(8, ...(starts.length ? starts : [8])));
  const toHour = Math.min(24, Math.max(23, ...(ends.length ? ends : [23])));
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const height = hours.length * PX_PER_HOUR;

  const place = (e: VisibleEvent): Placed => {
    const s = minutesIn(e.starts_at, timeZone);
    // 자정을 넘기면 그날 끝까지로 자른다
    const rawEnd = minutesIn(e.ends_at, timeZone);
    const end = rawEnd <= s ? toHour * 60 : rawEnd;
    return {
      event: e,
      kind: kindOf(e, me),
      top: ((s - fromHour * 60) / 60) * PX_PER_HOUR,
      // 30분보다 짧아도 제목 한 줄은 보여야 한다
      height: Math.max(28, ((end - s) / 60) * PX_PER_HOUR),
      column: 0,
      columns: 1,
    };
  };

  const all = timed.map(place);
  const shared = pack(all.filter((p) => p.kind === "shared"));
  const mine = pack(all.filter((p) => p.kind === "mine"));
  const theirs = pack(all.filter((p) => p.kind !== "shared" && p.kind !== "mine"));

  return (
    <div>
      {allDay.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {allDay.map((e) => {
            const kind = kindOf(e, me);
            return (
              <li key={e.id}>
                <Card
                  event={e}
                  kind={kind}
                  partnerLabel={partnerLabel}
                  compact
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-2 border-b border-line pb-2 text-sm" style={{ paddingLeft: GUTTER }}>
        <span>
          {myEmoji} 나
        </span>
        <span className="pl-3">
          {partnerEmoji} {partnerLabel}
        </span>
      </div>

      <div className="relative overflow-hidden" style={{ height }}>
        {/* 시각 눈금 */}
        {hours.map((h, i) => (
          <div
            key={h}
            className="absolute inset-x-0 border-t border-line/60"
            style={{ top: i * PX_PER_HOUR }}
          >
            <span className="tnum absolute -top-2 left-0 bg-paper pr-1 text-xs text-ash">
              {String(h).padStart(2, "0")}
            </span>
          </div>
        ))}

        {/* 이음새. 이 선을 가로지르는 것만 '함께'다. */}
        <div
          className="absolute top-0 bottom-0 w-px bg-line"
          style={{ left: `calc(${GUTTER}px + (100% - ${GUTTER}px) / 2)` }}
        />

        <Lane items={mine} side="left" partnerLabel={partnerLabel} />
        <Lane items={theirs} side="right" partnerLabel={partnerLabel} />
        <Lane items={shared} side="full" partnerLabel={partnerLabel} />
      </div>

      {timed.length === 0 && allDay.length === 0 && (
        <p className="py-10 text-center text-ash">비어 있는 하루</p>
      )}

      <div className="mt-4">
        <Link
          href={`/new?date=${date}`}
          className="inline-block rounded-lg bg-slot-a px-4 py-2 text-sm font-medium text-white"
        >
          ＋ 일정
        </Link>
      </div>
    </div>
  );
}

function Lane({
  items,
  side,
  partnerLabel,
}: {
  items: Placed[];
  side: "left" | "right" | "full";
  partnerLabel: string;
}) {
  return (
    <>
      {items.map((p) => {
        const width = 100 / p.columns;
        const offset = width * p.column;
        const style: React.CSSProperties =
          side === "full"
            ? {
                top: p.top,
                height: p.height,
                left: `calc(${GUTTER}px + (100% - ${GUTTER}px) * ${offset / 100} + 2px)`,
                width: `calc((100% - ${GUTTER}px) * ${width / 100} - 4px)`,
              }
            : {
                top: p.top,
                height: p.height,
                left:
                  side === "left"
                    ? `calc(${GUTTER}px + (100% - ${GUTTER}px) / 2 * ${offset / 100} + 2px)`
                    : `calc(${GUTTER}px + (100% - ${GUTTER}px) / 2 + (100% - ${GUTTER}px) / 2 * ${offset / 100} + 4px)`,
                width: `calc((100% - ${GUTTER}px) / 2 * ${width / 100} - 6px)`,
              };

        return (
          <div key={p.event.id} className="absolute" style={style}>
            <Card event={p.event} kind={p.kind} partnerLabel={partnerLabel} />
          </div>
        );
      })}
    </>
  );
}

const CARD: Record<Kind, string> = {
  shared: "border border-slot-a/40 bg-shared-bg",
  mine: "border-l-4 border-slot-a bg-card",
  partner: "border-l-4 border-slot-b bg-card",
  // 점선 + 사선 패턴. 형태만으로도 '가려진 것'이 드러나야 한다.
  partner_busy:
    "border border-dashed border-slot-b/50 bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,var(--slot-b-bg)_5px,var(--slot-b-bg)_10px)]",
};

function Card({
  event,
  kind,
  partnerLabel,
  compact,
}: {
  event: VisibleEvent;
  kind: Kind;
  partnerLabel: string;
  compact?: boolean;
}) {
  const emoji = emojiOf(event, kind);
  const body = (
    <div
      className={`h-full overflow-hidden rounded-md px-2 py-1 text-xs leading-4 ${CARD[kind]} ${
        compact ? "" : "min-h-0"
      }`}
    >
      <div className="truncate">
        {emoji && <span className="mr-1">{emoji}</span>}
        {titleOf(event)}
      </div>
      {compact && (
        <div className="text-[10px] text-ash">
          종일 · {kind === "shared" ? "함께" : kind === "mine" ? "나" : partnerLabel}
        </div>
      )}
    </div>
  );

  if (kind === "partner_busy") return body;
  return (
    <Link href={`/event/${event.id}`} className="block h-full">
      {body}
    </Link>
  );
}
