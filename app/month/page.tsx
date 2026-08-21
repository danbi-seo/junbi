import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { monthGridRange, todayIn, WEEKDAY } from "@/lib/time";
import { kindOf, titleOf, emojiOf, type VisibleEvent } from "@/lib/events";
import { Live } from "@/app/live";
import { Brand } from "@/app/brand";

export const metadata: Metadata = { title: "월 · JUNBI" };

export default async function MonthPage(props: PageProps<"/month">) {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const today = todayIn(ctx.timeZone);
  const sp = await props.searchParams;
  const year = Number(sp.y) || Number(today.slice(0, 4));
  const month = Number(sp.m) || Number(today.slice(5, 7));

  const { days, from, to } = monthGridRange(year, month, ctx.timeZone);

  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events_visible")
    .select("*")
    .lt("starts_at", to)
    .gt("ends_at", from)
    .neq("status", "declined")
    .order("all_day", { ascending: false })
    .order("starts_at")
    .returns<VisibleEvent[]>();

  // 날짜별로 모은다. 하루를 걸치는 일정은 걸친 날 전부에 들어간다.
  const byDay = new Map<string, VisibleEvent[]>();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.timeZone });
  for (const e of events ?? []) {
    const s = new Date(e.starts_at);
    // 종일 일정의 끝은 다음 날 00:00이므로 1분 빼서 마지막 날을 잡는다
    const end = new Date(new Date(e.ends_at).getTime() - 60000);
    for (let t = s; t <= end; t = new Date(t.getTime() + 86400000)) {
      const key = fmt.format(t);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(e);
      if (byDay.size > 100) break; // 방어
    }
  }

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
      <Live />

      <div className="mb-6 flex items-center justify-between">
        <Brand />
        <h1 className="font-display text-2xl">
          {year}년 {month}월
        </h1>
        <div className="flex gap-4 text-sm text-ash">
          <Link href={`/month?y=${prev.y}&m=${prev.m}`}>‹</Link>
          <Link href={`/month?y=${next.y}&m=${next.m}`}>›</Link>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-line pb-2 text-center text-xs text-ash">
        {WEEKDAY.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 gap-px bg-line">
        {days.map((d) => {
          const inMonth = Number(d.slice(5, 7)) === month;
          const list = byDay.get(d) ?? [];
          const kinds = list.map((e) => kindOf(e, ctx.userId));
          const hasShared = kinds.includes("shared");
          const hasMine = kinds.includes("mine");
          const hasTheirs = kinds.some(
            (k) => k === "partner" || k === "partner_busy",
          );

          return (
            <Link
              key={d}
              href={`/day/${d}`}
              className={`min-h-24 bg-paper p-1.5 lg:min-h-28 ${
                inMonth ? "" : "opacity-35"
              }`}
            >
              <div className="mb-1 text-center text-xs">
                {/* 오늘은 채운 원이 아니라 밑줄. 채운 원은 일정 점과 헷갈린다. */}
                <span
                  className={
                    d === today ? "underline decoration-2 underline-offset-4" : ""
                  }
                >
                  {Number(d.slice(8, 10))}
                </span>
              </div>

              {/* 좁은 화면: 점과 막대만 */}
              <div className="flex flex-col items-center gap-1 lg:hidden">
                {hasShared && (
                  <div className="h-1 w-6 rounded-full bg-gradient-to-r from-slot-a to-slot-b" />
                )}
                {(hasMine || hasTheirs) && (
                  <div className="flex gap-0.5">
                    {hasMine && <div className="size-1.5 rounded-full bg-slot-a" />}
                    {hasTheirs && <div className="size-1.5 rounded-full bg-slot-b" />}
                  </div>
                )}
              </div>

              {/* 넓은 화면: 제목까지. PC에서 이 앱을 쓰는 가장 큰 이유다. */}
              <div className="hidden flex-col gap-0.5 lg:flex">
                {list.slice(0, 3).map((e) => {
                  const kind = kindOf(e, ctx.userId);
                  const emoji = emojiOf(e, kind);
                  const bar =
                    kind === "shared"
                      ? "bg-shared-bg border-l-2 border-slot-a"
                      : kind === "mine"
                        ? "border-l-2 border-slot-a"
                        : kind === "partner"
                          ? "border-l-2 border-slot-b"
                          : "border-l-2 border-dashed border-slot-b/50";
                  return (
                    <div
                      key={e.id}
                      className={`truncate pl-1 text-[11px] leading-4 ${bar}`}
                    >
                      {emoji && <span className="mr-0.5">{emoji}</span>}
                      {titleOf(e)}
                    </div>
                  );
                })}
                {list.length > 3 && (
                  <div className="pl-1 text-[10px] text-ash">
                    +{list.length - 3}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-ash">
        <span className="flex items-center gap-1">
          <span className="h-1 w-5 rounded-full bg-gradient-to-r from-slot-a to-slot-b" />
          함께
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-slot-a" />내
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-slot-b" />
          {ctx.label}
        </span>
      </div>
    </main>
  );
}
