import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { dayRange, formatDay } from "@/lib/time";
import type { VisibleEvent } from "@/lib/events";
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
          <Brand />
        </span>
        <div className="text-center">
          <div className="font-display text-lg">our Day</div>
          <div className="text-xs text-ash">{formatDay(date)}</div>
        </div>
        {/* 글자 하나짜리 링크는 누를 자리가 14px밖에 안 된다.
            보이지도 않고 눌리지도 않아서 44px 상자를 준다. */}
        <div className="flex items-center text-ash">
          <Link
            href={`/day/${shift(date, -1)}`}
            aria-label="어제"
            className="grid size-11 place-items-center rounded-lg text-2xl leading-none hover:bg-slot-a-bg"
          >
            ‹
          </Link>
          <Link
            href={`/day/${shift(date, 1)}`}
            aria-label="내일"
            className="grid size-11 place-items-center rounded-lg text-2xl leading-none hover:bg-slot-a-bg"
          >
            ›
          </Link>
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
