import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { instantToWall } from "@/lib/time";
import { EventForm } from "../event-form";
import type { VisibleEvent } from "@/lib/events";

export const metadata: Metadata = { title: "일정 · JUNBI" };

export default async function EditEventPage(props: PageProps<"/event/[id]">) {
  // Next.js 16에서 params는 Promise다. 동기 접근은 제거됐다.
  const { id } = await props.params;

  const ctx = await getContext();
  if (!ctx) redirect("/");

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events_visible")
    .select("*")
    .eq("id", id)
    .maybeSingle<VisibleEvent>();

  if (!event) notFound();

  // 상대의 개인 일정은 열어도 고칠 수 없다. RLS가 막지만 화면에서도 알려준다.
  const editable = event.scope === "shared" || event.owner_id === ctx.userId;
  if (!editable) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-display text-xl">일정</h1>
          <Link href="/" className="text-sm text-ash underline underline-offset-4">
            닫기
          </Link>
        </div>
        <p className="leading-7 text-ash">
          {ctx.label}님의 일정이라 여기서는 볼 수만 있어요.
        </p>
      </main>
    );
  }

  const start = instantToWall(event.starts_at, ctx.timeZone);
  const end = instantToWall(event.ends_at, ctx.timeZone);

  // 종일 일정의 끝은 '다음 날 00:00'으로 저장돼 있다. 화면에는 하루를 되돌린다.
  const endDate = event.all_day
    ? instantToWall(
        new Date(new Date(event.ends_at).getTime() - 86400000).toISOString(),
        ctx.timeZone,
      ).date
    : end.date;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-xl">일정 고치기</h1>
        <Link href="/" className="text-sm text-ash underline underline-offset-4">
          취소
        </Link>
      </div>

      <EventForm
        partnerLabel={ctx.label}
        initial={{
          id: event.id,
          scope: event.scope,
          visibility: event.visibility,
          title: event.title ?? "",
          emoji: event.emoji,
          memo: event.memo,
          date: start.date,
          endDate,
          startTime: start.time,
          endTime: end.time,
          allDay: event.all_day,
          silent: event.silent ?? false,
        }}
      />
    </main>
  );
}
