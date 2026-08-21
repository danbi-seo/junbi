import { createClient } from "@/lib/supabase/server";
import { partnerLabel, type Profile } from "@/lib/naming";
import {
  kindOf,
  titleOf,
  emojiOf,
  timeLabel,
  STYLE,
  type VisibleEvent,
} from "@/lib/events";
import { SignOutButton } from "./sign-out";

/** 그 시간대 기준 오늘의 시작·끝을 ISO로 돌려준다. */
function todayRange(timeZone: string) {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  // 한국 표준시는 서머타임이 없어 +09:00 고정으로 충분하다.
  // 시간대를 여러 개 다루게 되면 5단계(빈 시간 찾기)에서 제대로 처리한다.
  const offset = timeZone === "Asia/Seoul" ? "+09:00" : "Z";
  const from = new Date(`${ymd}T00:00:00${offset}`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { ymd, from: from.toISOString(), to: to.toISOString() };
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null; // proxy.ts가 이미 로그인 화면으로 보낸다

  const { data: me } = await supabase
    .from("profiles")
    .select(
      "id,name,display_name,pet_name_for_partner,emoji_key,member_slot,couple_id,timezone",
    )
    .eq("id", user.id)
    .maybeSingle<Profile>();

  // 0단계에서는 프로필과 페어링을 SQL로 직접 넣는다.
  // 가입·페어링 화면은 7단계다 → docs/03-roadmap.md
  if (!me) {
    return (
      <Shell email={user.email}>
        <p className="leading-7 text-ash">
          아직 프로필이 없어요.
          <br />
          0단계에서는 SQL로 직접 넣습니다.
        </p>
        <code className="mt-4 block rounded-lg bg-card px-4 py-3 text-xs break-all">
          {user.id}
        </code>
      </Shell>
    );
  }

  // 짝은 커플이 active일 때만 보인다. pending·dissolved면 0건이 나온다.
  const { data: partner } = me.couple_id
    ? await supabase
        .from("profiles")
        .select(
          "id,name,display_name,pet_name_for_partner,emoji_key,member_slot,couple_id,timezone",
        )
        .eq("couple_id", me.couple_id)
        .neq("id", me.id)
        .maybeSingle<Profile>()
    : { data: null };

  const { ymd, from, to } = todayRange(me.timezone);

  // 항상 events_visible 뷰를 읽는다. 원본 events는 select 권한이 없다.
  // couple_id 조건을 넣지 않는다 — RLS가 이미 거른다.
  const { data: events } = await supabase
    .from("events_visible")
    .select("*")
    .gte("starts_at", from)
    .lt("starts_at", to)
    .neq("status", "declined")
    .order("starts_at")
    .returns<VisibleEvent[]>();

  const label = partner ? partnerLabel(me, partner) : null;

  return (
    <Shell email={user.email}>
      <header className="mb-8">
        {partner ? (
          <p className="text-lg">
            <span className="mr-1">{partner.emoji_key}</span>
            {label}
          </p>
        ) : (
          <p className="text-ash">아직 연결된 상대가 없어요.</p>
        )}
      </header>

      <h2 className="mb-3 font-display text-xl">오늘 · {ymd}</h2>

      {!events?.length ? (
        <p className="text-ash">비어 있는 하루</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((e) => {
            const kind = kindOf(e, me.id);
            const style = STYLE[kind];
            const emoji = emojiOf(e, kind);
            return (
              <li
                key={e.id}
                className={`rounded-lg px-4 py-3 ${style.className}`}
              >
                <div className="flex items-baseline gap-3">
                  <span className="tnum text-sm text-ash">{timeLabel(e, me.timezone)}</span>
                  <span className="flex-1 truncate">
                    {emoji && <span className="mr-1">{emoji}</span>}
                    {titleOf(e)}
                  </span>
                  <span className="text-xs text-ash">
                    {kind === "shared"
                      ? "함께"
                      : kind === "mine"
                        ? "나"
                        : (label ?? "상대")}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

function Shell({
  email,
  children,
}: {
  email?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10">
      <div className="mb-10 flex items-baseline justify-between">
        <h1 className="font-display text-2xl tracking-tight">JUNBI</h1>
        <div className="flex items-center gap-3 text-sm text-ash">
          <span className="truncate max-w-[12rem]">{email}</span>
          <SignOutButton />
        </div>
      </div>
      {children}
    </main>
  );
}
