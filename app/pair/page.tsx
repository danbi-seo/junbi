import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { pendingPartner } from "@/app/actions/pairing";
import { BrandFull } from "@/app/brand";
import { PairFlow } from "./pair-flow";

export const metadata: Metadata = { title: "연결하기 · JUNBI" };

/**
 * 가입 · 페어링 — docs/08-auth-pairing.md
 *
 * 로그인은 됐지만 아직 프로필이 없거나 짝이 없는 사람이 오는 자리.
 * 이미 연결된 사람은 메인으로 돌려보낸다.
 */
export default async function PairPage(props: PageProps<"/pair">) {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: me } = await supabase
    .from("profiles")
    .select("id,name,couple_id,member_slot,pet_name_for_partner")
    .eq("id", user.id)
    .maybeSingle<{
      id: string;
      name: string;
      couple_id: string | null;
      member_slot: "a" | "b" | null;
      pet_name_for_partner: string | null;
    }>();

  // 연결이 끝났으면 여기 있을 이유가 없다
  if (me?.couple_id) {
    const { data: couple } = await supabase
      .from("couples")
      .select("status")
      .eq("id", me.couple_id)
      .maybeSingle<{ status: string }>();
    if (couple?.status === "active") redirect("/");
  }

  const sp = await props.searchParams;
  const code = typeof sp.code === "string" ? sp.code.toUpperCase() : null;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <BrandFull className="mx-auto mb-8 max-w-[12rem]" />
      <PairFlow
        hasProfile={Boolean(me)}
        pending={await pendingPartner()}
        initialCode={code}
      />
    </main>
  );
}
