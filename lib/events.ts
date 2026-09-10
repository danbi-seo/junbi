/**
 * 일정을 화면에서 어떻게 다룰지 — 이 파일 한 곳에서만 정한다.
 *
 * 렌더링 코드 어디에서도 visibility를 직접 보지 마세요.
 * 한 군데로 모아두면 규칙이 어긋나지 않는다 → docs/07-api.md
 */

export type EventScope = "shared" | "personal";
export type EventVisibility = "full" | "busy" | "private";
export type EventStatus = "confirmed" | "proposed" | "declined";

/** events_visible 뷰가 돌려주는 모양. 원본 events가 아니다. */
export type VisibleEvent = {
  id: string;
  couple_id: string;
  owner_id: string;
  scope: EventScope;
  visibility: EventVisibility;
  status: EventStatus;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  blocks_time: boolean;
  /** 소유자에게만 값이 온다. 상대에게는 null — '안 알리기로 했다'가 드러나면 안 된다 */
  silent: boolean | null;
  /** 마스킹된 일정에서는 null이다 */
  title: string | null;
  memo: string | null;
  emoji: string | null;
  place_id: string | null;
  is_masked: boolean;
};

export type Kind = "shared" | "mine" | "partner" | "partner_busy";

export function kindOf(e: VisibleEvent, me: string): Kind {
  if (e.scope === "shared") return "shared";
  if (e.owner_id === me) return "mine";
  return e.is_masked ? "partner_busy" : "partner";
}

export type EventStyle = {
  /** 이음새 뷰에서 어느 쪽에 놓는가 */
  lane: "full" | "a" | "b";
  /** 실선 = 확정·본인이 쓴 것, 점선 = 추정·가려진 것 */
  border: "solid" | "dashed";
  /** Tailwind 클래스. 색·형태를 함께 바꾼다 */
  className: string;
};

/**
 * 색 하나로 구분하지 않는다. 위치·형태·이모지를 함께 쓴다.
 * 색을 못 보거나 흑백으로 캡처해도 구분돼야 한다 → docs/09-ui-spec.md
 */
export const STYLE: Record<Kind, EventStyle> = {
  shared: {
    lane: "full",
    border: "solid",
    className: "border-l-4 border-slot-a bg-shared-bg",
  },
  mine: {
    lane: "a",
    border: "solid",
    className: "border-l-4 border-slot-a bg-card",
  },
  partner: {
    lane: "b",
    border: "solid",
    className: "border-l-4 border-slot-b bg-card",
  },
  partner_busy: {
    lane: "b",
    border: "dashed",
    className: "border-l-4 border-dashed border-slot-b/40 bg-card",
  },
};

/**
 * 가려진 일정의 문구.
 * '비공개 일정'이나 자물쇠를 쓰지 않는다. 숨기는 행위를 강조하면
 * 관계에 좋지 않다 → docs/09-ui-spec.md
 */
export const MASKED_TITLE = "일정 있음";

export function titleOf(e: VisibleEvent): string {
  return e.title ?? MASKED_TITLE;
}

/** 마스킹된 일정에는 이모지를 붙이지 않는다. 🔒도 붙이지 않는다. */
export function emojiOf(e: VisibleEvent, kind: Kind): string | null {
  if (kind === "partner_busy") return null;
  if (kind === "shared") return e.emoji ?? "💜";
  return e.emoji;
}

export function timeLabel(e: VisibleEvent, timeZone = "Asia/Seoul"): string {
  if (e.all_day) return "종일";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(e.starts_at));
}

/**
 * 일정 폼의 날짜·시각이 온전한지 본다.
 *
 * 서버 액션이 아니라 여기에 두는 이유: 이 검사가 틀리면 저장이 통째로
 * 막히는데, 그런 실수를 잡아 줄 곳이 없었다. 실제로 정규식에서 역슬래시가
 * 빠져 `\d`가 `d`가 된 적이 있다 — 문법은 멀쩡해서 빌드도 lint도 안 잡았고,
 * 모든 날짜가 형식 오류로 걸렸다.
 *
 * 프레임워크에 기대지 않는 순수 함수라 검증 스크립트가 그대로 부를 수 있다.
 * → scripts/verify-inputs.mts
 */
export const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_FORMAT = /^\d{2}:\d{2}/;

export type WhenInput = {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
};

/**
 * 비었거나 형식이 어긋나면 까닭을 돌려준다. 온전하면 null.
 *
 * 빈 시각을 09:00 같은 값으로 몰래 채우지 않는다. 엉뚱한 시간이 저장되는 건
 * 저장이 안 되는 것보다 나쁘다. 물어본다.
 */
export function badWhen(i: WhenInput): "NO_DATE" | "NO_TIME" | null {
  if (!DATE_FORMAT.test(i.date) || !DATE_FORMAT.test(i.endDate)) return "NO_DATE";
  if (!i.allDay && (!TIME_FORMAT.test(i.startTime) || !TIME_FORMAT.test(i.endTime)))
    return "NO_TIME";
  return null;
}
