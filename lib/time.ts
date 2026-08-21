/**
 * 시간대 변환 — 이 파일 한 곳에서만 한다.
 *
 * 저장은 timestamptz(UTC 기준 시각), 표시는 profiles.timezone 기준이다.
 * 화면마다 따로 계산하면 한 시간씩 어긋나는 화면이 반드시 생긴다.
 *
 * 종일 일정만 예외다. all_day는 시각이 아니라 '날짜'의 의미이므로
 * 그 시간대의 00:00으로 저장하고 표시할 때 변환을 건너뛴다.
 * 이 처리를 안 하면 시차가 있을 때 생일이 하루 밀린다 → docs/07-api.md
 */

/** 그 시점에 해당 시간대가 UTC보다 몇 분 앞서는가. 서머타임도 반영된다. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const v = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<
    string,
    string
  >;
  // 24시로 표기되는 자정을 0으로 되돌린다 (일부 런타임이 '24'를 준다)
  const hour = Number(v.hour) % 24;
  const asUTC = Date.UTC(
    Number(v.year),
    Number(v.month) - 1,
    Number(v.day),
    hour,
    Number(v.minute),
    Number(v.second),
  );
  return (asUTC - at.getTime()) / 60000;
}

/**
 * 사용자가 입력한 벽시계 시각("2026-08-21", "19:00")을 실제 시점으로.
 * 오프셋을 한 번 추정하고 그 시점 기준으로 다시 계산해 경계에서도 맞춘다.
 */
export function wallToInstant(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = offsetMinutes(new Date(guess), timeZone);
  return new Date(guess - off * 60000);
}

/** 실제 시점을 그 시간대의 벽시계 값으로. 폼 기본값에 쓴다. */
export function instantToWall(
  iso: string,
  timeZone: string,
): { date: string; time: string } {
  const at = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return { date, time };
}

/** 그 시간대 기준 오늘 날짜 (YYYY-MM-DD) */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** 그 시간대 기준 하루의 시작·끝 */
export function dayRange(date: string, timeZone: string) {
  const from = wallToInstant(date, "00:00", timeZone);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** 그 시간대 기준 달의 시작·끝 (앞뒤로 6주 격자를 채울 만큼 넉넉히) */
export function monthGridRange(year: number, month: number, timeZone: string) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // 격자는 일요일부터 시작한다
  const lead = first.getUTCDay();
  const start = new Date(Date.UTC(year, month - 1, 1 - lead));
  const cells = 42; // 6주 × 7일. 어느 달이든 다 들어간다
  const days: string[] = [];
  for (let i = 0; i < cells; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    days.push(new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(d));
  }
  return {
    days,
    from: wallToInstant(days[0], "00:00", timeZone).toISOString(),
    to: new Date(
      wallToInstant(days[cells - 1], "00:00", timeZone).getTime() + 86400000,
    ).toISOString(),
  };
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** '8월 21일 목' */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 ${wd}`;
}

export { WEEKDAY };
