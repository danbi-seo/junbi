import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { dayRange, formatDay, todayIn } from "@/lib/time";
import type { VisibleEvent } from "@/lib/events";
import { ArrowLink } from "@/app/arrow-link";
import { Brand } from "@/app/brand";
import { SeamView } from "./seam-view";
import { Live } from "@/app/(app)/live";

export const metadata: Metadata = { title: "하루 · JUNBI" };

function shift(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return at.toISOString().slice(0, 10);
}

export default async function DayPage(props: PageProps<"/day/[date]">) {
  const { date } = await props.params;
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const { from, to } = dayRange(date, ctx.timeZone);
  const isToday = date === todayIn(ctx.timeZone);

  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events_visible")
    .select("*")
    // 하루를 걸치는 일정도 잡는다. 시작이 오늘인 것만 보면 여행이 사라진다.
    .lt("starts_at", to)
    .gt("ends_at", from)
    .neq("status", "declined")
    .order("starts_at")
    .returns<VisibleEvent[]>();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <span className="md:hidden">
          <Brand back />
        </span>
        {/* 큰 쪽이 날짜여야 한다.
            'our Day'는 화면 이름일 뿐이고, 여기서 확인할 것은 며칠인지다.
            거꾸로 두면 정작 필요한 글자가 12px 회색으로 깔린다. */}
        <div className="min-w-0 text-center">
          <div className="text-xs text-ash">our Day</div>
          <div className="font-display text-lg leading-tight">
            {formatDay(date)}
          </div>
          {isToday && <div className="text-xs text-slot-a">오늘</div>}
        </div>
        <div className="flex items-center gap-1">
          <ArrowLink href={`/day/${shift(date, -1)}`} dir="prev" label="어제" />
          <ArrowLink href={`/day/${shift(date, 1)}`} dir="next" label="내일" />
        </div>
      </div>

      <Live />

      <SeamView
        events={events ?? []}
        me={ctx.userId}
        myEmoji={ctx.me.emoji_key}
        partnerEmoji={ctx.partner?.emoji_key ?? "🙂"}
        partnerLabel={ctx.label}
        timeZone={ctx.timeZone}
        date={date}
      />
    </main>
  );
}
