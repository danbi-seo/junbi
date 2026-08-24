import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { Brand } from "@/app/brand";
import { FreeView } from "./free-view";

export const metadata: Metadata = { title: "언제 만날까 · JUNBI" };

export default async function FreePage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  // 짝이 없으면 기능 자체를 감춘다 → docs/17-availability.md
  if (!ctx.partner) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-8">
        <h1 className="font-display text-lg">언제 만날까</h1>
        <p className="text-ash">상대와 연결되면 쓸 수 있어요.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <span className="md:hidden">
          <Brand />
        </span>
        <h1 className="font-display text-lg">언제 만날까</h1>
      </div>

      <FreeView timeZone={ctx.timeZone} partnerLabel={ctx.label} />

      <p className="text-xs leading-5 text-ash">
        비공개 일정도 바쁜 시간으로 계산해요. 다만 {ctx.label}님에게는 그 사실이
        보이지 않고, 그냥 그 시간이 후보에서 빠져 있을 뿐이에요.
      </p>
    </main>
  );
}
