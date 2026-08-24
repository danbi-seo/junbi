import KoreanLunarCalendar from "korean-lunar-calendar";

/**
 * 기념일 · D-day 계산 — docs/14-anniversaries.md
 *
 * 자주 틀리는 세 가지가 여기 모여 있다.
 *
 *   100일  = started_on + 99   한국에서 만난 날이 1일째다
 *   1주년  = 365일이 아니라 날짜 기준. 윤년이 끼면 366일이다
 *   음력   = 규칙이 아니라 천문 계산 결과다. 라이브러리를 쓴다
 *
 * 설계서는 이 계산을 DB 함수로 두라고 하지만, 음력 변환을 SQL에서 하려면
 * Edge Function으로 위임해야 한다. TypeScript 한 곳에 모으면
 * 화면과 .ics 라우트가 같은 함수를 쓴다 → docs/decisions.md
 *
 * 행을 미리 만들지 않는다. 100일·200일·300일…을 전부 행으로 만들면
 * 수백 개가 쌓인다. 조회할 때 계산한다.
 */

export type AnnivRepeat = "once" | "yearly" | "day_count";

export type AnniversaryRow = {
  id: string;
  title: string;
  emoji: string | null;
  base_date: string; // YYYY-MM-DD
  repeat: AnnivRepeat;
  is_lunar: boolean;
  day_step: number | null;
  pinned: boolean;
};

export type Occurrence = {
  /** 등록된 기념일이면 그 id, 자동 생성이면 'count-100' 같은 합성 키 */
  key: string;
  id: string | null;
  title: string;
  emoji: string;
  /** YYYY-MM-DD */
  date: string;
  daysLeft: number;
  kind: AnnivRepeat;
  pinned: boolean;
  /** 음력 기념일이면 원래 음력 날짜를 함께 보여준다 */
  lunarNote?: string;
};

const DAY = 86400000;

function toUTC(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function diffDays(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / DAY);
}

/** 그 시간대 기준 오늘 (YYYY-MM-DD) */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/**
 * 사귄 날로부터 n일째가 되는 날.
 *
 * 만난 날이 1일째이므로 100일은 started_on + 99다.
 * 이걸 틀리면 하루 어긋나고, 이런 건 반드시 지적당한다.
 */
export function dayCountDate(startedOn: string, n: number): string {
  return fmt(new Date(toUTC(startedOn).getTime() + (n - 1) * DAY));
}

/**
 * 음력 날짜를 해당 연도의 양력으로.
 *
 * 없는 날짜(음력 30일이 없는 달)는 그달 마지막 날로 대체한다.
 * 양력 2월 29일 생일이 평년에 28일로 가는 것과 같은 처리다.
 */
function lunarToSolar(
  year: number,
  lunarMonth: number,
  lunarDay: number,
  intercalation = false,
): string | null {
  const cal = new KoreanLunarCalendar();
  // 음력 30일이 없는 달이면 29일, 28일로 물러난다.
  // 물러나는 건 최대 이틀까지다 — 조건을 day >= 28로 두면
  // 음력 5일 같은 날짜에서 반복문이 아예 돌지 않는다.
  for (let day = lunarDay; day >= Math.max(1, lunarDay - 2); day--) {
    if (cal.setLunarDate(year, lunarMonth, day, intercalation)) {
      const s = cal.getSolarCalendar();
      return `${s.year}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`;
    }
  }
  return null;
}

/** 양력 날짜의 음력 표기 — '음력 8월 3일' */
export function lunarLabel(date: string): string | null {
  const [y, m, d] = date.split("-").map(Number);
  const cal = new KoreanLunarCalendar();
  if (!cal.setSolarDate(y, m, d)) return null;
  const l = cal.getLunarCalendar();
  return `음력 ${l.month}월 ${l.day}일${l.intercalation ? " (윤달)" : ""}`;
}

/**
 * 매년 오는 기념일의 다음 날짜.
 *
 * 1주년을 365일로 세지 않는다. 날짜 기준이라 윤년이 끼면 366일이다.
 */
function nextYearly(baseDate: string, isLunar: boolean, from: string): string | null {
  const fromYear = Number(from.slice(0, 4));
  const [, bm, bd] = baseDate.split("-").map(Number);

  for (const year of [fromYear, fromYear + 1]) {
    let candidate: string | null;

    if (isLunar) {
      // base_date는 양력으로 저장돼 있다. 음력으로 바꿔 그 음력 날짜를
      // 올해 양력으로 다시 옮긴다.
      const cal = new KoreanLunarCalendar();
      const [by, bmm, bdd] = baseDate.split("-").map(Number);
      if (!cal.setSolarDate(by, bmm, bdd)) return null;
      const l = cal.getLunarCalendar();
      // 윤달 생일은 기본을 평달로 본다 → docs/14-anniversaries.md
      candidate = lunarToSolar(year, l.month, l.day, false);
    } else {
      // 2월 29일이 평년에 없으면 28일로
      const last = new Date(Date.UTC(year, bm, 0)).getUTCDate();
      candidate = `${year}-${String(bm).padStart(2, "0")}-${String(Math.min(bd, last)).padStart(2, "0")}`;
    }

    if (candidate && candidate >= from) return candidate;
  }
  return null;
}

/**
 * 자동 생성되는 일수 기념일.
 *
 * 무한히 만들면 목록이 지저분해진다.
 *   1000일 이하  100일 단위 전부
 *   1000일 초과  500일 단위만
 * 10년 차 커플에게 3700일은 의미가 없지만 10주년은 의미가 있다.
 */
function dayCounts(startedOn: string, from: string, within: number): Occurrence[] {
  const out: Occurrence[] = [];
  const limit = diffDays(startedOn, from) + within;

  for (let n = 100; n <= 20000; n += n <= 1000 ? 100 : 500) {
    if (n - 1 > limit) break;
    const date = dayCountDate(startedOn, n);
    if (date < from) continue;
    out.push({
      key: `count-${n}`,
      id: null,
      title: `${n}일`,
      emoji: "💜",
      date,
      daysLeft: diffDays(from, date),
      kind: "day_count",
      pinned: false,
    });
  }
  return out;
}

/** 사귄 날 기준 매년 오는 n주년 */
function yearlyMilestones(startedOn: string, from: string, within: number): Occurrence[] {
  const out: Occurrence[] = [];
  const startYear = Number(startedOn.slice(0, 4));
  const untilYear = Number(from.slice(0, 4)) + Math.ceil(within / 365) + 1;

  for (let year = startYear + 1; year <= untilYear; year++) {
    const date = nextYearly(startedOn, false, `${year}-01-01`);
    if (!date || date < from) continue;
    const left = diffDays(from, date);
    if (left > within) continue;
    out.push({
      key: `year-${year - startYear}`,
      id: null,
      title: `${year - startYear}주년`,
      emoji: "💜",
      date,
      daysLeft: left,
      kind: "yearly",
      pinned: false,
    });
  }
  return out;
}

export function upcomingAnniversaries(opts: {
  startedOn: string | null;
  rows: AnniversaryRow[];
  today: string;
  /** 며칠 앞까지 볼지 */
  within?: number;
  limit?: number;
}): Occurrence[] {
  const { startedOn, rows, today, within = 400, limit } = opts;
  const out: Occurrence[] = [];

  if (startedOn) {
    out.push(...dayCounts(startedOn, today, within));
    out.push(...yearlyMilestones(startedOn, today, within));
  }

  for (const r of rows) {
    const date =
      r.repeat === "yearly"
        ? nextYearly(r.base_date, r.is_lunar, today)
        : r.base_date;
    if (!date || date < today) continue;
    const left = diffDays(today, date);
    if (left > within) continue;

    out.push({
      key: r.id,
      id: r.id,
      title: r.title,
      emoji: r.emoji ?? "🎉",
      date,
      daysLeft: left,
      kind: r.repeat,
      pinned: r.pinned,
      lunarNote: r.is_lunar ? (lunarLabel(r.base_date) ?? undefined) : undefined,
    });
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return limit ? out.slice(0, limit) : out;
}

/** 메인 상단에 한 줄로 띄울 것. pinned가 있으면 그것, 없으면 가장 가까운 것. */
export function headline(list: Occurrence[]): Occurrence | null {
  return list.find((o) => o.pinned) ?? list[0] ?? null;
}

/** D-0은 '오늘'이라고 쓴다. 지난 것은 D+3. */
export function ddayLabel(daysLeft: number): string {
  if (daysLeft === 0) return "오늘";
  return daysLeft > 0 ? `D-${daysLeft}` : `D+${-daysLeft}`;
}
