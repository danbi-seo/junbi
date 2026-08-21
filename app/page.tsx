import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { dayRange, monthGridRange, todayIn, formatDay } from "@/lib/time";
import type { VisibleEvent } from "@/lib/events";
import { Calendar } from "./calendar";
import { EventRow } from "./event-row";
import { Live } from "./live";
import { SignOutButton } from "./sign-out";

/**
 * 메인 화면. 구성은 셋이다 — 상대 → 달력 → 그날 일정
 *
 * 상대가 맨 위인 이유: 앱을 여는 이유가 "지금 뭐 하고 있나"이기 때문이다.
 * 내 상태는 내가 이미 안다. 두 사람을 좌우로 똑같이 배치하면
 * 화면 절반이 이미 아는 정보로 채워진다 → docs/09-ui-spec.md
 *
 * 상대 상태 카드는 4단계에서 붙는다. 지금은 이름과 이모지만.
 */
export default async function HomePage(props: PageProps<"/">) {
  const ctx = await getContext();

  // 0단계에서는 프로필과 페어링을 SQL로 직접 넣는다.
  // 가입·페어링 화면은 7단계다 → docs/03-roadmap.md
  if (!ctx) {
    const user = await getUser();
    if (!user) return null; // proxy.ts가 이미 로그인 화면으로 보낸다
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

  const sp = await props.searchParams;
  const today = todayIn(ctx.timeZone);
  const selected = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const view = sp.v === "month" ? "month" : "week";

  // 달력 점 표기에는 6주치가 필요하고, 목록에는 하루치면 된다.
  // 한 번에 6주치를 읽고 목록은 걸러 쓴다. 왕복을 줄인다.
  const grid = monthGridRange(
    Number(selected.slice(0, 4)),
    Number(selected.slice(5, 7)),
    ctx.timeZone,
  );

  // 항상 events_visible 뷰를 읽는다. 원본 events는 select 권한이 없다.
  // couple_id 조건을 넣지 않는다 — 뷰가 이미 거른다.
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events_visible")
    .select("*")
    .lt("starts_at", grid.to)
    .gt("ends_at", grid.from)
    .neq("status", "declined")
    .order("all_day", { ascending: false })
    .order("starts_at")
    .returns<VisibleEvent[]>();

  const all = events ?? [];
  const day = dayRange(selected, ctx.timeZone);
  const ofDay = all.filter(
    (e) => e.starts_at < day.to && e.ends_at > day.from,
  );

  return (
    <Shell email={ctx.email}>
      <Live />

      <header className="mb-8">
        {ctx.partner ? (
          <p className="text-lg">
            <span className="mr-1">{ctx.partner.emoji_key}</span>
            {ctx.label}
          </p>
        ) : (
          <p className="text-ash">아직 연결된 상대가 없어요.</p>
        )}
      </header>

      <Calendar
        events={all}
        selected={selected}
        today={today}
        view={view}
        me={ctx.userId}
        timeZone={ctx.timeZone}
      />

      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm text-ash">
          {selected === today ? "오늘" : formatDay(selected)}
        </h3>
        <Link
          href={`/day/${selected}`}
          className="text-sm text-ash underline underline-offset-4"
        >
          이음새 보기
        </Link>
      </div>

      {!ofDay.length ? (
        <p className="text-ash">비어 있는 하루</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ofDay.map((e) => (
            <li key={e.id}>
              <EventRow
                event={e}
                me={ctx.userId}
                partnerLabel={ctx.label}
                timeZone={ctx.timeZone}
              />
            </li>
          ))}
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
          <span className="max-w-[10rem] truncate">{email}</span>
          <SignOutButton />
        </div>
      </div>
      {children}
    </main>
  );
}
