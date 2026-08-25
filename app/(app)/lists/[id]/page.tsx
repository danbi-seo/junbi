import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { KIND_LABEL, type Checklist, type ChecklistItem } from "@/lib/checklist";
import { Brand } from "@/app/brand";
import { Items } from "./items";
import { DeleteList } from "./delete-list";

export const metadata: Metadata = { title: "체크리스트 · JUNBI" };

export default async function ListPage(props: PageProps<"/lists/[id]">) {
  const { id } = await props.params;

  const ctx = await getContext();
  if (!ctx) redirect("/");

  const supabase = await createClient();

  const { data: list } = await supabase
    .from("checklists")
    .select("id,kind,title,emoji,event_id,archived_at,created_by,created_at")
    .eq("id", id)
    .maybeSingle<Checklist>();

  if (!list) notFound();

  const { data: items } = await supabase
    .from("checklist_items")
    .select("id,checklist_id,text,qty,assignee_id,position,checked_at,checked_by")
    .eq("checklist_id", id)
    .order("position")
    .returns<ChecklistItem[]>();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <span className="md:hidden">
          <Brand />
        </span>
        <Link href="/lists" className="text-sm text-ash underline underline-offset-4">
          목록으로
        </Link>
      </div>

      <div>
        <h1 className="font-display text-xl">
          {list.emoji ?? KIND_LABEL[list.kind].emoji} {list.title}
        </h1>
        <p className="mt-1 text-xs text-ash">{KIND_LABEL[list.kind].label}</p>
      </div>

      <Items
        checklistId={list.id}
        initial={items ?? []}
        me={{ id: ctx.userId, emoji: ctx.me.emoji_key }}
        partner={
          ctx.partner ? { id: ctx.partner.id, emoji: ctx.partner.emoji_key } : null
        }
      />

      <div className="flex items-start justify-between gap-4 border-t border-line pt-4">
        <p className="text-xs leading-5 text-ash">
          상대가 체크하면 바로 반영돼요. 완료 알림은 기본으로 꺼져 있어요 —
          마트에서 체크할 때마다 울리면 곤란하니까요.
        </p>
        <DeleteList
          checklistId={list.id}
          title={list.title}
          itemCount={items?.length ?? 0}
        />
      </div>
    </main>
  );
}
