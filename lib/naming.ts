/**
 * 상대를 뭐라고 부를지 — 이 파일 한 곳에서만 정한다.
 *
 * 화면마다 따로 계산하면 어딘가에서 실명이 새어 나간다 → docs/11-naming.md
 * DB 쪽 짝이 되는 함수는 public.partner_label(viewer, owner)이다.
 */

export type Profile = {
  id: string;
  /** 실명. 페어링 확인 화면 외에는 어디에도 쓰지 않는다. */
  name: string;
  display_name: string | null;
  /** 내가 상대를 부르는 애칭. 소유자는 나다. */
  pet_name_for_partner: string | null;
  emoji_key: string;
  member_slot: "a" | "b" | null;
  couple_id: string | null;
  previous_couple_id?: string | null;
  timezone: string;
};

/** 내 화면에서 상대를 부르는 이름. */
export function partnerLabel(me: Profile, partner: Profile): string {
  return me.pet_name_for_partner ?? partner.display_name ?? partner.name;
}

/**
 * 문장에는 '님'을 붙이고 라벨·칩에는 붙이지 않는다.
 *
 * 받침이 ㅁ으로 고정되므로 조사가 하나로 정해진다.
 * 덕분에 이모지 애칭(🐻님이)과 영문 애칭(honey님이)도 그대로 동작한다.
 * '님'이 없으면 받침 판별 함수와 조사 분기가 필요하고, 이모지는 결국 해결이 안 된다.
 */
export const hon = (label: string) => `${label}님`;
