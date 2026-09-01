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

  // 커플이 active인지 먼저 본다.
  //
  // ⚠ profiles만 봐서는 알 수 없다. 확정 대기 중에도 profiles.couple_id는
  //   채워져 있고, '확정 대기 중 상대 프로필 조회' 정책 때문에 상대도 보인다.
  //   그래서 pending인데 partner가 잡히고, 화면은 앱을 정상으로 그린다.
  //   그런데 my_couple_id()는 active만 돌려주므로 일정·지출·장소 조회는
  //   전부 0건이고 저장은 실패한다. 겉보기엔 멀쩡한데 아무것도 안 되는
  //   상태가 된다 — 실제로 그렇게 됐다.
  //
  //   여기서 active가 아니면 partner를 비운다. 그러면 메인이 /pair로 보내고
  //   사용자는 '연결하기'를 누를 수 있다.
  const { data: couple } = me.couple_id
    ? await supabase
        .from("couples")
        .select("status")
        .eq("id", me.couple_id)
        .maybeSingle<{ status: string }>()
    : { data: null };

  const active = couple?.status === "active";

  const { data: partner } = active
    ? await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("couple_id", me.couple_id!)
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
