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
import { NotificationCard, type Prefs } from "./notification-card";
import { AccountCard } from "./account-card";
import { PasswordCard } from "./password-card";
import { ProfileCard } from "./profile-card";

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

  // 스위치 16개가 전부 여기 있다. 판정은 DB가 하고 화면은 값만 보여준다.
  const { data: prefs } = await supabase
    .from("notification_prefs")
    .select("*")
    .eq("user_id", ctx.userId)
    .maybeSingle<Prefs & { recv_event_upcoming: boolean; upcoming_min: number }>();

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("name,birth_date,birth_is_lunar,emoji_key,pet_name_for_partner")
    .eq("id", ctx.userId)
    .maybeSingle<{
      name: string;
      birth_date: string;
      birth_is_lunar: boolean;
      emoji_key: string;
      pet_name_for_partner: string | null;
    }>();

  // 해제 뒤 유예 기간 중인지. previous_couple_id가 남아 있으면 그렇다.
  const { data: prev } = ctx.me.previous_couple_id
    ? await supabase
        .from("couples")
        .select("purge_after,status")
        .eq("id", ctx.me.previous_couple_id)
        .maybeSingle<{ purge_after: string | null; status: string }>()
    : { data: null };

  const { data: req } = ctx.me.previous_couple_id
    ? await supabase
        .from("restore_requests")
        .select("asked_by")
        .eq("couple_id", ctx.me.previous_couple_id)
        .maybeSingle<{ asked_by: string }>()
    : { data: null };

  const restore =
    prev?.status === "dissolved" &&
    prev.purge_after &&
    new Date(prev.purge_after) > new Date()
      ? {
          purgeAfter: prev.purge_after,
          askedByMe: req ? req.asked_by === ctx.userId : null,
        }
      : null;

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

      {prefs && <NotificationCard initial={prefs} partnerLabel={ctx.label} />}

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
            {/* 카카오가 이메일을 안 줄 수 있다. 빈칸으로 두면 고장으로 읽힌다. */}
            <dd className="max-w-[14rem] truncate">
              {ctx.email ?? "카카오 계정"}
            </dd>
          </div>
          {/*
           * 여기만 실명을 함께 보여준다.
           *
           * '실명은 페어링 확인 화면 외에 어디에도 나오지 않는다'가 원칙인데,
           * 이 줄은 성격이 그 확인 화면과 같다 — "내가 누구와 연결돼 있나"다.
           * 애칭은 내가 붙인 이름이라 확인이 안 된다. 엉뚱한 사람과 연결돼
           * 있어도 애칭만 보면 알 수 없다.
           *
           * 달력·알림·잠금화면에는 여전히 애칭만 나간다.
           */}
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-ash">상대</dt>
            <dd className="text-right">
              {ctx.partner ? (
                <>
                  {ctx.partner.emoji_key} {ctx.label}
                  {ctx.label !== ctx.partner.name && (
                    <span className="text-ash"> · {ctx.partner.name}</span>
                  )}
                </>
              ) : (
                "연결 안 됨"
              )}
            </dd>
          </div>
        </dl>
      </section>

      {myProfile && (
        <ProfileCard
          initial={{
            name: myProfile.name,
            birthDate: myProfile.birth_date,
            birthIsLunar: myProfile.birth_is_lunar,
            emoji: myProfile.emoji_key,
            petName: myProfile.pet_name_for_partner ?? "",
          }}
          partnerName={ctx.partner?.name ?? null}
          paired={Boolean(ctx.partner)}
        />
      )}

      <PasswordCard email={ctx.email ?? null} />

      <AccountCard
        paired={Boolean(ctx.partner)}
        partnerLabel={ctx.label}
        restore={restore}
      />
    </main>
  );
}
