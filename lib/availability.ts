/**
 * 빈 시간 찾기 — docs/17-availability.md
 *
 * 계산은 전부 DB 함수가 한다. 여기서는 프리셋과 표시만 다룬다.
 * 클라이언트에서 계산하면 상대의 비공개 일정 시간이 브라우저로 내려간다.
 */

export type FreeSlot = {
  starts_at: string;
  ends_at: string;
  minutes: number;
  score: number;
  /** 내 비공개 일정과 겹침. 상대 화면에는 이 값이 오지 않는다. */
  my_private_conflict: boolean;
  /** 내 생리 예상 기간과 겹침. 상대 화면에는 항상 false다. */
  my_cycle_window: boolean;
};

export type Preset = {
  key: string;
  label: string;
  /** 며칠 뒤부터 며칠 뒤까지 */
  fromDay: number;
  toDay: number;
  minMinutes: number;
  /** 주말만 볼지 */
  weekendOnly?: boolean;
};

/**
 * 마지막 프리셋은 여행 계획용이다.
 * 실제로 가장 찾기 어려운 조건이라 자동화 가치가 크다.
 */
export const PRESETS: Preset[] = [
  { key: "weekend", label: "가장 가까운 주말", fromDay: 0, toDay: 9, minMinutes: 180, weekendOnly: true },
  { key: "evening", label: "이번 주 평일 저녁", fromDay: 0, toDay: 7, minMinutes: 120 },
  { key: "twoweeks", label: "앞으로 2주", fromDay: 0, toDay: 14, minMinutes: 120 },
  { key: "month", label: "한 달 안에", fromDay: 0, toDay: 30, minMinutes: 180 },
];

export function rangeOf(preset: Preset, timeZone: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  const base = new Date(`${today}T00:00:00+09:00`);
  return {
    from: new Date(Math.max(base.getTime() + preset.fromDay * 86400000, Date.now())).toISOString(),
    to: new Date(base.getTime() + (preset.toDay + 1) * 86400000).toISOString(),
  };
}

export function slotLabel(slot: FreeSlot, timeZone: string): string {
  const day = new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(slot.starts_at));

  const time = (iso: string) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));

  return `${day}  ${time(slot.starts_at)} – ${time(slot.ends_at)}`;
}

/** 그 시간대 기준 요일 (0=일). 주말 판정에 쓴다. */
function dayOfWeek(iso: string, timeZone: string): number {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

/** 주말만 남긴다. 프리셋 '가장 가까운 주말'에서 쓴다. */
export function onlyWeekend(slots: FreeSlot[], timeZone: string): FreeSlot[] {
  return slots.filter((s) => {
    const day = dayOfWeek(s.starts_at, timeZone);
    return day === 0 || day === 6;
  });
}
