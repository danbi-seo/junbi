/**
 * 상태 · 루틴 — docs/15-presence.md
 *
 * 관통하는 원칙:
 *   자동(루틴)은 점선, 수동은 실선.
 *
 * 루틴으로 뜨는 건 실제가 아니라 설정 기반 추정이다. 휴가·반차·외근이면 틀린다.
 * 상대가 "회사에 있겠구나"와 "회사에 있다고 했구나"를 구분할 수 있어야 한다.
 * 이걸 섞으면 앱이 거짓말을 하게 된다.
 */

export type StatusKind = "activity" | "condition" | "free";

export type CurrentStatus = {
  kind: StatusKind;
  emoji: string;
  label: string | null;
  is_auto: boolean;
  until: string;
};

export type Routine = {
  id: string;
  label: string;
  emoji: string;
  days: number[];
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  priority: number;
};

/** 일정에서 쓴 실선/점선 규칙이 여기서도 같은 뜻이다. 점선은 확실하지 않다. */
export const CHIP_STYLE = {
  manual: "border border-solid bg-card",
  auto: "border border-dashed bg-transparent",
} as const;

export const DAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 수동 상태 프리셋.
 *
 * '🩸 생리 중'을 넣지 않는다. 상태는 잠금화면 알림과 안드로이드 고정 알림으로도
 * 나간다. 주기 공유는 별도 스위치로 통제되는데 상태 프리셋으로 우회되면
 * 통제가 무너진다 → docs/19-health.md
 */
export const PRESETS: Record<
  Exclude<StatusKind, "free">,
  Array<{ emoji: string; label: string }>
> = {
  activity: [
    { emoji: "💼", label: "일하는 중" },
    { emoji: "🚇", label: "이동 중" },
    { emoji: "🏃", label: "운동 중" },
    { emoji: "🍽", label: "밥 먹는 중" },
    { emoji: "🏢", label: "야근 중" },
    { emoji: "🏠", label: "집 도착" },
    { emoji: "☕", label: "쉬는 중" },
    { emoji: "📚", label: "공부 중" },
  ],
  condition: [
    { emoji: "🤒", label: "감기몸살" },
    { emoji: "😣", label: "배 아픔" },
    { emoji: "🛌", label: "쉬는 중" },
    { emoji: "😵", label: "피곤함" },
  ],
};

/** 30분 · 2시간 · 4시간(기본) · 오늘 하루 */
export const TTL_OPTIONS = [
  { hours: 0.5, label: "30분" },
  { hours: 2, label: "2시간" },
  { hours: 4, label: "4시간" },
  { hours: 12, label: "오늘 하루" },
];

/**
 * '18:30에 끝나요' — 자동 상태일 때만 보여준다.
 * 언제 연락해도 되는지 알려주는 실질적인 정보다.
 */
export function untilLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function routineDays(days: number[]): string {
  if (days.length === 7) return "매일";
  const weekdays = [1, 2, 3, 4, 5];
  if (days.length === 5 && weekdays.every((d) => days.includes(d))) return "평일";
  if (days.length === 2 && days.includes(0) && days.includes(6)) return "주말";
  return [...days].sort().map((d) => DAY_LABEL[d]).join("");
}

/** '09:30' 형태로. DB는 '09:30:00'을 준다. */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}
