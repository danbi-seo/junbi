import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { BrandFull } from "@/app/brand";
import { WelcomeFlow } from "./welcome-flow";

export const metadata: Metadata = { title: "연결됐어요 · JUNBI" };

/**
 * 연결 직후 온보딩 — docs/08-auth-pairing.md 4단계
 *
 * 빈 앱을 마주하면 이탈한다. 순서대로 묻되 전부 건너뛸 수 있게 한다.
 * 여기서는 애칭만 묻는다 — 가장 재밌어하는 순간이고, 나머지(주기·캘린더·
 * 알림)는 설정에 이미 있어서 첫 화면에서 몰아 물으면 지친다.
 *
 * 특히 알림 권한은 첫 실행에 묻지 않는다. 거절당하면 되돌리기가 매우 어렵다.
 */
export default async function WelcomePage() {
  const ctx = await getContext();
  if (!ctx) redirect("/pair");
  if (!ctx.partner) redirect("/pair");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <BrandFull className="mx-auto mb-8 max-w-[12rem]" />
      <WelcomeFlow
        partnerName={ctx.partner.name}
        partnerEmoji={ctx.partner.emoji_key}
        current={ctx.me.pet_name_for_partner ?? ""}
      />
    </main>
  );
}
