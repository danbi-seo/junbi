import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import type { Place } from "@/lib/places";
import { Brand } from "@/app/brand";
import { Live } from "@/app/(app)/live";
import { PlacesView } from "./places-view";

export const metadata: Metadata = { title: "가보고 싶은 곳 · JUNBI" };

export default async function PlacesPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const supabase = await createClient();
  const { data: places } = await supabase
    .from("places")
    .select(
      "id,name,category,address,lat,lng,source_url,map_url,memo,added_by,visited_at,rating_a,rating_b,want_again",
    )
    .order("created_at", { ascending: false })
    .returns<Place[]>();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-6 py-8">
      <Live />

      <div className="flex items-center justify-between">
        <span className="md:hidden">
          <Brand />
        </span>
        <h1 className="font-display text-lg">가보고 싶은 곳</h1>
      </div>

      <PlacesView
        places={places ?? []}
        mySlot={ctx.me.member_slot}
        myEmoji={ctx.me.emoji_key}
        partnerEmoji={ctx.partner?.emoji_key ?? "🙂"}
      />

      <p className="text-xs leading-5 text-ash">
        위치 권한을 요청하지 않아요. 저장한 곳만 지도에 표시하고, 지금 어디
        있는지는 읽지 않습니다.
      </p>
    </main>
  );
}
