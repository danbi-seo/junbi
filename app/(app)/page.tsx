import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { dayRange, monthGridRange, todayIn, formatDay } from "@/lib/time";
import type { VisibleEvent } from "@/lib/events";
import { Brand } from "../brand";
import {
  upcomingAnniversaries,
  headline,
  ddayLabel,
  type AnniversaryRow,
} from "@/lib/anniversary";
import type { CurrentStatus } from "@/lib/presence";
import type { PartnerHealth } from "@/lib/health";
import { Calendar } from "./calendar";
import { MyStatus, PartnerStatus } from "./status-chips";
import { EventRow } from "./event-row";
import { Live } from "./live";
import { PartnerHealthChip } from "./partner-health";


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
      <Shell>
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

  // 기념일 — 상단에 한 줄, 하나만. 두 개 이상 띄우면 눈에 안 들어온다.
  const [{ data: couple }, { data: annivRows }] = await Promise.all([
    supabase
      .from("couples")
      .select("started_on")
      .eq("id", ctx.me.couple_id!)
      .maybeSingle<{ started_on: string | null }>(),
    supabase
      .from("anniversaries")
      .select("id,title,emoji,base_date,repeat,is_lunar,day_step,pinned")
      .returns<AnniversaryRow[]>(),
  ]);

  // 상태 — 루틴과 수동을 합쳐 계산된 '지금 상태'만 온다.
  // 루틴 원본(요일·시간표)은 상대에게 나가지 않는다 → docs/15-presence.md
  const [{ data: mine }, { data: theirs }] = await Promise.all([
    supabase.rpc("current_statuses", { p_user: ctx.userId }),
    ctx.partner
      ? supabase.rpc("current_statuses", { p_user: ctx.partner.id })
      : Promise.resolve({ data: [] }),
  ]);

  // 상대 건강. partner_health()가 켜진 항목만 계산해서 내보낸다.
  // 원본 테이블을 읽지 않는다 — cycles에는 짝 조회 정책이 아예 없다.
  const { data: ph } = await supabase.rpc("partner_health");
  const partnerHealth = (ph ?? null) as PartnerHealth | null;

  const dday = headline(
    upcomingAnniversaries({
      startedOn: couple?.started_on ?? null,
      rows: annivRows ?? [],
      today,
      within: 400,
    }),
  );

  const all = events ?? [];
  const day = dayRange(selected, ctx.timeZone);
  const ofDay = all.filter(
    (e) => e.starts_at < day.to && e.ends_at > day.from,
  );

  return (
    <Shell>
      <Live />

      {/* 내 상태는 우상단에 작게. 내 상태는 내가 이미 알고 있다. */}
      <div className="mb-4 flex items-center justify-end gap-3">
        <Link
          href="/health"
          className="text-sm text-ash underline underline-offset-4"
        >
          컨디션
        </Link>
        <MyStatus
          statuses={(mine ?? []) as CurrentStatus[]}
          timeZone={ctx.timeZone}
        />
      </div>

      {/* 상대가 맨 위. 앱을 여는 이유가 "지금 뭐 하고 있나"다. */}
      <header className="mb-8">
        {ctx.partner ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-lg">
                <span className="mr-1">{ctx.partner.emoji_key}</span>
                {ctx.label}
              </p>
              {/*
               * 건강 정보는 펼쳐야 보인다. 메인은 늘 켜져 있는 화면이라
               * 옆자리에서도 보이고 사진에도 들어간다 → docs/19-health.md
               *
               * 볼 게 없으면 칩 자체가 없다. '꺼져 있음'과 '기록이 없음'이
               * 구별되면 끄는 행위가 추궁 대상이 된다.
               */}
              <PartnerHealthChip
                health={partnerHealth}
                partnerLabel={ctx.label}
                timeZone={ctx.timeZone}
              />
            </div>
            <PartnerStatus
              statuses={(theirs ?? []) as CurrentStatus[]}
              timeZone={ctx.timeZone}
            />
          </>
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

      {/* D-day는 탭에서 뺐다. 이 띠가 유일한 입구라 기념일이 없어도 띄워 둔다. */}
      <Link
        href="/dday"
        className="mb-5 flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-3"
      >
        {dday ? (
          <>
            <span>{dday.emoji}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{dday.title}까지</span>
            <span className="font-display tnum text-lg">{ddayLabel(dday.daysLeft)}</span>
          </>
        ) : (
          <>
            <span>💜</span>
            <span className="min-w-0 flex-1 truncate text-sm text-ash">
              D-day를 만들어 보세요
            </span>
          </>
        )}
      </Link>

      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm text-ash">
          {selected === today ? "오늘" : formatDay(selected)}
        </h3>
        <div className="flex gap-4 text-sm">
          <Link href="/free" className="text-ash underline underline-offset-4">
            Let&apos;s Meet
          </Link>
          <Link
            href={`/day/${selected}`}
            className="text-ash underline underline-offset-4"
          >
            our Day
          </Link>
        </div>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10">
      {/* 좌측 레일이 있는 넓은 화면에서는 로고가 중복이라 감춘다 */}
      <div className="mb-8 md:hidden">
        <Brand />
      </div>
      {children}
    </main>
  );
}
