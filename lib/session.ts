import { createClient } from "@/lib/supabase/server";
import { partnerLabel, type Profile } from "@/lib/naming";

const PROFILE_COLUMNS =
  "id,name,display_name,pet_name_for_partner,emoji_key,member_slot,couple_id,previous_couple_id,timezone";

export type Context = {
  userId: string;
  email?: string;
  me: Profile;
  partner: Profile | null;
  /** 내 화면에서 상대를 부르는 이름. 짝이 없으면 '상대' */
  label: string;
  timeZone: string;
};

/**
 * 화면마다 필요한 것 — 나, 짝, 상대를 부르는 이름 — 을 한 번에 가져온다.
 *
 * 화면마다 따로 조회하면 애칭 계산이 어긋나고 실명이 새어 나갈 자리가 생긴다.
 * 프로필이 없으면(0단계에서 SQL로 넣기 전) null을 돌려준다.
 */
export async function getContext(): Promise<Context | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (!me) return null;

  // 짝은 커플이 active일 때만 보인다. pending·dissolved면 0건이다.
  const { data: partner } = me.couple_id
    ? await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("couple_id", me.couple_id)
        .neq("id", me.id)
        .maybeSingle<Profile>()
    : { data: null };

  return {
    userId: user.id,
    email: user.email,
    me,
    partner: partner ?? null,
    label: partner ? partnerLabel(me, partner) : "상대",
    timeZone: me.timezone,
  };
}
