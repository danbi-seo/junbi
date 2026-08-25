/**
 * 지출 · 정산 — docs/20-expenses.md
 *
 * 계산기 + 기록장이다. 돈은 앱 밖에서 움직인다.
 * 계좌·카드 연동, 실제 송금, 영수증 촬영은 하지 않는다.
 *
 * 금액은 bigint 원 단위 정수다. 소수를 쓰면 반올림에서 1원씩 어긋나고,
 * 커플 정산에서 1원 차이는 실제로 화제가 된다.
 */

export type SplitType = "half" | "payer_all" | "custom";

export type Expense = {
  id: string;
  event_id: string | null;
  payer_id: string;
  amount: number;
  split: SplitType;
  payer_ratio: number | null;
  category: string | null;
  memo: string | null;
  silent: boolean;
  occurred_at: string;
  settlement_id: string | null;
};

export type Settlement = {
  id: string;
  from_id: string;
  to_id: string;
  amount: number;
  settled_at: string;
  memo: string | null;
};

export const SPLIT_LABEL: Record<SplitType, string> = {
  half: "반반",
  payer_all: "내가 다",
  custom: "직접",
};

export const CATEGORIES = [
  { key: "food", emoji: "🍽", label: "식사" },
  { key: "cafe", emoji: "☕", label: "카페" },
  { key: "transport", emoji: "🚗", label: "이동" },
  { key: "ticket", emoji: "🎬", label: "티켓" },
  { key: "shopping", emoji: "🛍", label: "쇼핑" },
  { key: "travel", emoji: "✈️", label: "여행" },
  { key: "etc", emoji: "📌", label: "기타" },
];

export function categoryEmoji(key: string | null): string {
  return CATEGORIES.find((c) => c.key === key)?.emoji ?? "📌";
}

/** 1,234원 */
export function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * 상대가 부담할 금액.
 *
 * 홀수 반반은 결제자가 더 내는 쪽으로 버린다.
 * 반대로 하면 "네가 1원 더 냈네"가 된다. 결제한 사람이 손해를 보는 방향이
 * 정서적으로 안전하다.
 */
export function otherOwes(e: Expense): number {
  if (e.split === "payer_all") return 0;
  if (e.split === "half") return Math.floor(e.amount / 2);
  return Math.floor((e.amount * (100 - (e.payer_ratio ?? 50))) / 100);
}

/**
 * 잔액을 문장으로.
 *
 * '+12,400' 같은 부호 표기를 쓰지 않는다.
 * 누가 받는지 방향이 순간적으로 헷갈린다 → docs/20-expenses.md
 */
export function balanceSentence(
  amount: number,
  owedToMe: boolean,
  partnerLabel: string,
): string {
  if (amount === 0) return "정산할 게 없어요";
  return owedToMe
    ? `${partnerLabel}님에게 ${won(amount)} 받을 차례예요`
    : `${partnerLabel}님에게 ${won(amount)} 보낼 차례예요`;
}

export function dayLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}
