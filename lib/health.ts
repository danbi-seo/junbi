/**
 * 컨디션 · 주기 — docs/19-health.md
 *
 * 관통하는 원칙 하나.
 *   몸 상태로 만든 판단은 **본인 화면에만** 띄운다.
 *   상대에게는 **본인이 켠 것만** 보낸다.
 *
 * 이 파일에는 계산이 거의 없다. 예측은 전부 DB 함수가 한다.
 * 클라이언트에서 계산하면 원본이 브라우저까지 내려와야 하는데,
 * 그러면 화면에서 감춰도 감춘 게 아니다.
 */

export type Prediction =
  | { status: "insufficient"; count: number }
  | { status: "irregular"; cycleLength?: number }
  | {
      status: "ok";
      cycleLength: number;
      variance: number;
      recentGaps: number[];
      lastStart: string;
      nextFrom: string;
      nextTo: string;
      nextDuration: number;
      fertileFrom: string;
      fertileTo: string;
    };

export type PeriodRow = {
  id: string;
  from: string;
  to: string | null;
  flow: number | null;
  pain: number | null;
  symptoms: string[] | null;
  memo: string | null;
};

export type MyHealth = {
  cycleModuleOn?: boolean;
  shareCycle?: boolean;
  shareCondition?: boolean;
  avoidInFreeSlots?: boolean;
  consentedAt?: string;
  today?: {
    energy?: number;
    painAreas?: string[];
    memo?: string;
    flow?: number;
    pain?: number;
    symptoms?: string[];
  };
  prediction?: Prediction;
  openPeriodId?: string;
  openPeriodStart?: string;
  askIfOngoing?: boolean;
  delayDays?: number;
  periods?: PeriodRow[];
};

/** 상대에게 나가는 전부. 이 타입에 없는 건 나가지 않는다. */
export type PartnerHealth = {
  shared: boolean;
  condition?: { energy?: number; painAreas?: string[] };
  periods?: { from: string; to: string | null }[];
  periodActive?: boolean;
  fertileFrom?: string;
  fertileTo?: string;
};

// ── 문구 ─────────────────────────────────────────────────────────
//
// 절대 쓰지 않는 표현
//   ❌ 가임기   ❌ 안전기 / 안전한 날
//   ❌ 임신 가능성 낮음   ❌ 배란일 (하루로 특정)
//
// '안전'이 들어간 표현이 가장 위험하다. 달력법으로는 안전한 날을 식별할 수
// 없고, 정자 생존 기간 때문에 계산 구간 밖에서도 임신이 가능하다.
//
// 임신 가능성이 높은 구간만 표시하고 나머지 날에는 아무 표시도 하지 않는다.
// 다른 날을 '낮음'으로 라벨하지 않으므로 비교 대상이 화면에 없다.
//
// 달력에 뜨는 건 두 가지다 — 생리 주기 · 임신 가능성 높음.
// 다만 생리 주기 안에서 기록과 예상은 눈으로 구분돼야 한다.
// 추정치가 확정된 기록과 똑같이 보이면 과신한다.
// 앱 전체의 실선/점선 규칙과 같다 → CLAUDE.md
export const CYCLE_COPY = {
  cycle: "생리 주기",
  recorded: "기록",
  predicted: "예상",
  fertile: "임신 가능성 높음",

  disclaimer: "추정치예요. 피임이나 임신 계획의 근거로 쓰지 마세요.",

  insufficient: "아직 예측할 만큼 기록이 모이지 않았어요. (3회 이상 필요)",
  irregular: "주기가 일정하지 않아 예측이 어려워요.",
} as const;

export const ENERGY = [
  { value: 1, emoji: "😫", label: "많이 힘듦" },
  { value: 2, emoji: "😕", label: "기운 없음" },
  { value: 3, emoji: "😐", label: "보통" },
  { value: 4, emoji: "🙂", label: "괜찮음" },
  { value: 5, emoji: "😄", label: "좋음" },
];

export const PAIN_AREAS = ["머리", "목", "어깨", "허리", "배", "무릎", "몸살"];
export const SYMPTOMS = ["두통", "부종", "피로", "기분변화", "복통", "메스꺼움"];
export const FLOW_LABEL = ["", "적음", "보통", "많음"];
export const PAIN_LABEL = ["없음", "약간", "심함"];

export function energyOf(v: number | null | undefined) {
  return ENERGY.find((e) => e.value === v) ?? null;
}

/**
 * 편차 라벨.
 *
 * 숫자만 던지면 "1.4일이 큰 건가"를 모른다.
 * 3일 미만 안정적, 3~7일 보통, 7일 이상은 예측 자체를 안 한다.
 */
export function varianceLabel(sd: number): string {
  if (sd < 3) return "안정적";
  if (sd < 7) return "보통";
  return "불규칙 · 예측 어려움";
}

/**
 * 지연 안내.
 *
 * 본인에게만. 진단하지 말고 권유만.
 * 임신 가능성은 언급하지 않는다 — 앱이 먼저 꺼낼 말이 아니다.
 */
export function delayMessage(days: number): { title: string; body: string } {
  return {
    title: `예상일보다 ${days}일 지났어요`,
    body:
      days >= 7
        ? "주기가 늦어지는 건 흔한 일이에요. 스트레스, 수면, 체중 변화로 달라질 수 있어요. 계속 늦어지면 산부인과 상담을 권해요."
        : "주기가 늦어지는 건 흔한 일이에요. 스트레스, 수면, 체중 변화로 달라질 수 있어요.",
  };
}

const DAY = 86400000;
const toDate = (s: string) => new Date(s + "T00:00:00Z");
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** from~to를 하루 단위 문자열 집합으로. 달력 칠하기에 쓴다. */
export function expand(from: string, to: string | null, fallbackDays = 5): string[] {
  const s = toDate(from);
  const e = to ? toDate(to) : new Date(s.getTime() + (fallbackDays - 1) * DAY);
  const out: string[] = [];
  for (let t = s.getTime(); t <= e.getTime(); t += DAY) {
    out.push(isoDay(new Date(t)));
  }
  return out;
}

/**
 * 달력 한 칸의 표시 종류.
 *
 * 우선순위가 있다. 기록이 예상을 이긴다 — 실제로 있었던 일이 추정보다 세다.
 * 임신 가능성 구간은 가장 약하게 깔린다.
 */
export type DayMark = "recorded" | "predicted" | "fertile" | null;

export function buildMarks(
  periods: { from: string; to: string | null }[] | undefined,
  prediction: Prediction | undefined,
): Map<string, DayMark> {
  const marks = new Map<string, DayMark>();

  if (prediction?.status === "ok") {
    for (const d of expand(prediction.fertileFrom, prediction.fertileTo)) {
      marks.set(d, "fertile");
    }
    // 예상 시작일이 구간이므로 그 폭만큼 넓게 칠한다
    const start = toDate(prediction.nextFrom);
    const end = new Date(
      toDate(prediction.nextTo).getTime() + (prediction.nextDuration - 1) * DAY,
    );
    for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
      marks.set(isoDay(new Date(t)), "predicted");
    }
  }

  for (const p of periods ?? []) {
    for (const d of expand(p.from, p.to)) marks.set(d, "recorded");
  }

  return marks;
}
