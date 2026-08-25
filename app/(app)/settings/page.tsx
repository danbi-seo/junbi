import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { Brand } from "@/app/brand";
import { IcsCard } from "./ics-card";
import { ReminderCard } from "./reminder-card";
import { SetupCard } from "./setup-card";
import { PushCard } from "./push-card";

export const metadata: Metadata = { title: "설정 · JUNBI" };

export default async function SettingsPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const supabase = await createClient();
  const { data } = await supabase.rpc("my_ics_token");
  const row = Array.isArray(data) ? data[0] : null;

  // 브라우저 권한만 보면 "켜짐"인데 서버에 구독이 없을 수 있다.
  // 실제로 발송 가능한지는 이 행이 있는지로 판단한다.
  const { data: sub } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("user_id", ctx.userId)
    .limit(1)
    .maybeSingle<{ endpoint: string }>();

  const { data: prefs } = await supabase
    .from("notification_prefs")
    .select("recv_event_upcoming,upcoming_min")
    .eq("user_id", ctx.userId)
    .maybeSingle<{ recv_event_upcoming: boolean; upcoming_min: number }>();

  // .ics 주소는 캘린더 앱에 영구 저장된다. 배포 주소를 그대로 써야 한다.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <span className="md:hidden">
          <Brand />
        </span>
        <h1 className="font-display text-lg">설정</h1>
      </div>

      <SetupCard calendarConnected={!!row?.last_read} />

      <IcsCard
        initialToken={row?.token ?? null}
        lastRead={row?.last_read ?? null}
        origin={`${proto}://${host}`}
      />

      <PushCard hasSubscription={!!sub} />

      <ReminderCard
        initial={prefs?.recv_event_upcoming === false ? 0 : (prefs?.upcoming_min ?? 60)}
      />

      <Link
        href="/health"
        className="rounded-xl border border-line bg-card p-5"
      >
        <h2 className="font-display text-lg">컨디션</h2>
        <p className="mt-2 text-xs leading-5 text-ash">
          기운·아픈 곳과 생리 주기 기록, 공유 설정. 기본은 전부 꺼져 있어요.
        </p>
      </Link>

      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="font-display text-lg">연결</h2>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ash">계정</dt>
            <dd className="max-w-[14rem] truncate">{ctx.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ash">나</dt>
            <dd>
              {ctx.me.emoji_key} {ctx.me.display_name ?? ctx.me.name}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ash">상대</dt>
            <dd>
              {ctx.partner ? `${ctx.partner.emoji_key} ${ctx.label}` : "연결 안 됨"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-5 text-ash">
          애칭 바꾸기와 연결 해제는 7단계에서 붙습니다.
        </p>
      </section>
    </main>
  );
}
