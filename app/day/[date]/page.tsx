import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { dayRange, formatDay } from "@/lib/time";
import type { VisibleEvent } from "@/lib/events";
import { SeamView } from "./seam-view";

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
        <Link href="/" className="text-sm text-ash underline underline-offset-4">
          ← 오늘
        </Link>
        <h1 className="font-display text-lg">{formatDay(date)}</h1>
        <div className="flex gap-3 text-sm text-ash">
          <Link href={`/day/${shift(date, -1)}`}>‹</Link>
          <Link href={`/day/${shift(date, 1)}`}>›</Link>
        </div>
      </div>

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
