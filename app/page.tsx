import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { getUser } from "@/lib/supabase/server";
import { dayRange, todayIn, formatDay } from "@/lib/time";
import type { VisibleEvent } from "@/lib/events";
import { EventRow } from "./event-row";
import { SignOutButton } from "./sign-out";

export default async function HomePage() {
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

  const today = todayIn(ctx.timeZone);
  const { from, to } = dayRange(today, ctx.timeZone);

  // 항상 events_visible 뷰를 읽는다. 원본 events는 select 권한이 없다.
  // couple_id 조건을 넣지 않는다 — 뷰가 이미 거른다.
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events_visible")
    .select("*")
    .lt("starts_at", to)
    .gte("ends_at", from)
    .neq("status", "declined")
    .order("all_day", { ascending: false })
    .order("starts_at")
    .returns<VisibleEvent[]>();

  return (
    <Shell email={ctx.email}>
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

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-xl">오늘 · {formatDay(today)}</h2>
        <div className="flex items-center gap-4 text-sm">
          <Link href={`/day/${today}`} className="text-ash underline underline-offset-4">
            하루 보기
          </Link>
          <Link href="/month" className="text-ash underline underline-offset-4">
            월
          </Link>
          <Link
            href={`/new?date=${today}`}
            className="rounded-lg bg-slot-a px-3 py-1.5 font-medium text-white"
          >
            ＋ 일정
          </Link>
        </div>
      </div>

      {!events?.length ? (
        <p className="text-ash">비어 있는 하루</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((e) => (
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
