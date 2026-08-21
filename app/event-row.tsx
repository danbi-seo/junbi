import Link from "next/link";
import {
  kindOf,
  titleOf,
  emojiOf,
  timeLabel,
  STYLE,
  type VisibleEvent,
} from "@/lib/events";

/**
 * 일정 한 줄. 목록 화면들이 공유한다.
 *
 * 여기서도 visibility를 직접 보지 않는다. kindOf()가 판단하고
 * STYLE이 모양을 정한다 → docs/07-api.md
 */
export function EventRow({
  event,
  me,
  partnerLabel,
  timeZone,
}: {
  event: VisibleEvent;
  me: string;
  partnerLabel: string;
  timeZone: string;
}) {
  const kind = kindOf(event, me);
  const style = STYLE[kind];
  const emoji = emojiOf(event, kind);

  const who =
    kind === "shared" ? "함께" : kind === "mine" ? "나" : partnerLabel;

  const row = (
    <div className={`rounded-lg px-4 py-3 ${style.className}`}>
      <div className="flex items-baseline gap-3">
        <span className="tnum shrink-0 text-sm text-ash">
          {timeLabel(event, timeZone)}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {emoji && <span className="mr-1">{emoji}</span>}
          {titleOf(event)}
        </span>
        <span className="shrink-0 text-xs text-ash">{who}</span>
      </div>
    </div>
  );

  // 마스킹된 일정은 열어도 볼 게 없다. 링크를 걸지 않는 게 정직하다.
  if (kind === "partner_busy") return row;

  return (
    <Link href={`/event/${event.id}`} className="block">
      {row}
    </Link>
  );
}
