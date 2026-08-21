import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { todayIn } from "@/lib/time";
import { EventForm } from "@/app/event/event-form";
import { Brand } from "@/app/brand";

export const metadata: Metadata = { title: "새 일정 · JUNBI" };

export default async function NewEventPage(props: PageProps<"/new">) {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const { date } = await props.searchParams;
  const day = typeof date === "string" ? date : todayIn(ctx.timeZone);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <Brand />
        <h1 className="font-display text-lg">새 일정</h1>
        <Link href="/" className="text-sm text-ash underline underline-offset-4">
          취소
        </Link>
      </div>

      <EventForm
        partnerLabel={ctx.label}
        initial={{
          scope: "personal",
          // 기본값은 '시간만'이다. 처음부터 전체 공개면 실수로 다 보이게 된다.
          visibility: "busy",
          title: "",
          emoji: null,
          memo: null,
          date: day,
          endDate: day,
          startTime: "19:00",
          endTime: "20:00",
          allDay: false,
          silent: false,
        }}
      />
    </main>
  );
}
