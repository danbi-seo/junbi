/**
 * 공유 체크리스트 — docs/16-shared-lists.md
 *
 * 두 사람이 동시에 보면서 쓰는 유일한 화면이다.
 * 마트에서 각자 다른 통로를 돌며 체크하는 게 실제 사용 시나리오다.
 *
 * 체크 상태를 boolean이 아니라 checked_at + checked_by로 둔 이유는
 * "누가 언제 체크했는지"를 보여주기 위해서다. 장보기에서 특히 유용하다.
 */

export type ChecklistKind = "date_prep" | "grocery" | "todo" | "free";

export type Checklist = {
  id: string;
  kind: ChecklistKind;
  title: string;
  emoji: string | null;
  event_id: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
};

export type ChecklistItem = {
  id: string;
  checklist_id: string;
  text: string;
  qty: string | null;
  assignee_id: string | null;
  position: number;
  checked_at: string | null;
  checked_by: string | null;
};

export const KIND_LABEL: Record<ChecklistKind, { label: string; emoji: string }> = {
  date_prep: { label: "데이트 준비물", emoji: "🎒" },
  grocery: { label: "장보기", emoji: "🛒" },
  todo: { label: "할 일", emoji: "✅" },
  free: { label: "자유", emoji: "📝" },
};

/**
 * 템플릿 — 처음부터 만들게 하면 안 쓴다.
 * 장보기는 빈 목록으로 두고 '자주 산 항목'을 대신 추천한다.
 */
export const TEMPLATES: Record<ChecklistKind, string[]> = {
  date_prep: ["지갑", "보조배터리", "우산", "예매 확인", "상비약"],
  grocery: [],
  todo: [],
  free: [],
};

export const TRAVEL_TEMPLATE = [
  "여권",
  "충전기",
  "세면도구",
  "상비약",
  "숙소 예약 확인",
  "교통편 확인",
];

/** '5분 전' — 누가 언제 체크했는지 보여준다 */
export function relativeTime(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/** 남은 것이 위, 완료가 아래. 완료한 건 흐려진다. */
export function sortItems(items: ChecklistItem[]): ChecklistItem[] {
  return [...items].sort((a, b) => {
    const ac = a.checked_at ? 1 : 0;
    const bc = b.checked_at ? 1 : 0;
    if (ac !== bc) return ac - bc;
    return a.position - b.position;
  });
}

export function progress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.checked_at).length, total: items.length };
}
