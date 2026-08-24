import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { todayIn } from "@/lib/time";
import type { Routine } from "@/lib/presence";
import { Brand } from "@/app/brand";
import { RoutineList } from "./routine-list";

export const metadata: Metadata = { title: "루틴 · JUNBI" };

export default async function RoutinesPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const supabase = await createClient();

  // routines에 짝 조회 정책이 없다. 내 것만 나온다.
  const { data: routines } = await supabase
    .from("routines")
    .select("id,label,emoji,days,starts_at,ends_at,enabled,priority")
    .order("starts_at")
    .returns<Routine[]>();

  const { data: overrides } = await supabase
    .from("routine_overrides")
    .select("routine_id")
    .eq("on_date", todayIn(ctx.timeZone))
    .returns<Array<{ routine_id: string }>>();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <span className="md:hidden">
          <Brand />
        </span>
        <h1 className="font-display text-lg">내 루틴</h1>
      </div>

      <p className="text-sm leading-6 text-ash">
        평소 일정을 넣어두면 그 시간대에 상대에게 자동으로 표시돼요. 자동으로
        뜬 상태는 <span className="text-ink">점선</span>이라 &lsquo;추정&rsquo;이라는
        게 드러나요.
      </p>

      <RoutineList
        routines={routines ?? []}
        skippedToday={(overrides ?? []).map((o) => o.routine_id)}
      />

      <div className="rounded-xl border border-line bg-card p-4 text-xs leading-6 text-ash">
        <p className="text-ink">상대에게 무엇이 보이나요</p>
        <p className="mt-1">
          지금 어떤 루틴 시간대인지, 그 상태가 언제 끝나는지만 보여요.
          <br />
          <span className="text-ink">
            요일·시간표 자체는 상대에게 보이지 않아요.
          </span>
        </p>
        <p className="mt-2">
          루틴이 바뀌고 끝날 때 알림은 가지 않아요. 하루 두 번 예측 가능한 알림은
          정보가 아니니까요.
        </p>
      </div>
    </main>
  );
}
