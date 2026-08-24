import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { KIND_LABEL, progress, type Checklist, type ChecklistItem } from "@/lib/checklist";
import { Brand } from "@/app/brand";
import { Live } from "@/app/(app)/live";
import { NewListForm } from "./new-list";

export const metadata: Metadata = { title: "체크리스트 · JUNBI" };

export default async function ListsPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const supabase = await createClient();

  const { data: lists } = await supabase
    .from("checklists")
    .select("id,kind,title,emoji,event_id,archived_at,created_by,created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<Checklist[]>();

  // 진행도를 함께 보여주려면 항목이 필요하다. 목록이 적어 한 번에 읽는다.
  const { data: items } = await supabase
    .from("checklist_items")
    .select("id,checklist_id,text,qty,assignee_id,position,checked_at,checked_by")
    .returns<ChecklistItem[]>();

  const byList = new Map<string, ChecklistItem[]>();
  for (const i of items ?? []) {
    if (!byList.has(i.checklist_id)) byList.set(i.checklist_id, []);
    byList.get(i.checklist_id)!.push(i);
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-8">
      <Live />

      <div className="flex items-center justify-between">
        <span className="md:hidden">
          <Brand />
        </span>
        <h1 className="font-display text-lg">체크리스트</h1>
      </div>

      {!lists?.length ? (
        <p className="text-ash">
          아직 목록이 없어요. 장보기나 데이트 준비물을 만들어 보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lists.map((l) => {
            const { done, total } = progress(byList.get(l.id) ?? []);
            const kind = KIND_LABEL[l.kind];
            return (
              <li key={l.id}>
                <Link
                  href={`/lists/${l.id}`}
                  className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3"
                >
                  <span className="text-xl">{l.emoji ?? kind.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{l.title}</div>
                    <div className="text-xs text-ash">{kind.label}</div>
                  </div>
                  <span className="tnum shrink-0 text-sm text-ash">
                    {done} / {total}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <NewListForm />
    </main>
  );
}
