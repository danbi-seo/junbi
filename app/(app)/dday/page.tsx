import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { formatDay } from "@/lib/time";
import {
  upcomingAnniversaries,
  ddayLabel,
  todayIn,
  type AnniversaryRow,
} from "@/lib/anniversary";
import { Brand } from "@/app/brand";
import { AnnivForm, StartedOnForm, DeleteButton } from "./anniv-form";

export const metadata: Metadata = { title: "기념일 · JUNBI" };

export default async function DdayPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const supabase = await createClient();

  const { data: couple } = await supabase
    .from("couples")
    .select("started_on")
    .eq("id", ctx.me.couple_id!)
    .maybeSingle<{ started_on: string | null }>();

  const { data: rows } = await supabase
    .from("anniversaries")
    .select("id,title,emoji,base_date,repeat,is_lunar,day_step,pinned")
    .order("base_date")
    .returns<AnniversaryRow[]>();

  const today = todayIn(ctx.timeZone);
  const list = upcomingAnniversaries({
    startedOn: couple?.started_on ?? null,
    rows: rows ?? [],
    today,
    within: 400,
  });

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <span className="md:hidden">
          <Brand />
        </span>
        <h1 className="font-display text-lg">기념일</h1>
      </div>

      {!couple?.started_on && <StartedOnForm value={null} />}

      {list.length === 0 ? (
        <p className="text-ash">
          아직 다가오는 기념일이 없어요.
          {!couple?.started_on && " 사귄 날을 넣으면 100일부터 세어드려요."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((o) => (
            <li
              key={o.key}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                o.pinned ? "border-slot-a bg-slot-a-bg" : "border-line bg-card"
              }`}
            >
              <span className="text-xl">{o.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  {o.title}
                  {o.pinned && <span className="ml-1 text-xs">📌</span>}
                </div>
                <div className="text-xs text-ash">
                  {formatDay(o.date)}
                  {o.lunarNote && ` · ${o.lunarNote}`}
                </div>
              </div>
              {/* D-day 숫자가 주인공인 유일한 자리다 → docs/09-ui-spec.md */}
              <span className="font-display tnum shrink-0 text-xl">
                {ddayLabel(o.daysLeft)}
              </span>
              {o.id && <DeleteButton id={o.id} />}
            </li>
          ))}
        </ul>
      )}

      <AnnivForm />

      {couple?.started_on && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ash">사귄 날 바꾸기</summary>
          <div className="mt-3">
            <StartedOnForm value={couple.started_on} />
          </div>
        </details>
      )}

      <p className="text-xs leading-5 text-ash">
        기념일은 캘린더 앱에도 종일 일정으로 보내드려요. 설정에서 캘린더를
        연결해 두셨다면 위젯에도 뜹니다.
      </p>
    </main>
  );
}
