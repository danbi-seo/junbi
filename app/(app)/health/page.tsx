import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import type { MyHealth } from "@/lib/health";
import { Brand } from "@/app/brand";
import { HealthView } from "./health-view";

export const metadata: Metadata = { title: "컨디션 · JUNBI" };

// 건강 정보는 실시간일 필요가 전혀 없다.
// <Live />를 붙이지 않는다 — cycles·conditions는 publication에도 없다.
export default async function HealthPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const supabase = await createClient();
  const { data } = await supabase.rpc("my_health");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-6 py-8">
      <div className="flex items-center justify-between">
        <span className="md:hidden">
          <Brand />
        </span>
        <h1 className="font-display text-lg">컨디션</h1>
      </div>

      <HealthView
        initial={(data ?? {}) as MyHealth}
        partnerLabel={ctx.label}
        timeZone={ctx.timeZone}
      />
    </main>
  );
}
