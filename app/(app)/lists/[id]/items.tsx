"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addItem,
  toggleItem,
  deleteItem,
  assignItem,
  clearDone,
} from "@/app/actions/checklists";
import {
  sortItems,
  progress,
  relativeTime,
  type ChecklistItem,
} from "@/lib/checklist";

/**
 * 체크리스트 항목 — docs/16-shared-lists.md
 *
 * 여기서는 Realtime 페이로드를 직접 써도 된다.
 * 체크리스트에는 마스킹이 없기 때문이다. 일정과 다른 점이다.
 *
 * 낙관적 업데이트를 반드시 한다. 체크박스가 서버 응답을 기다리면
 * 마트 지하에서 못 쓴다.
 */

type Who = { id: string; emoji: string };

export function Items({
  checklistId,
  initial,
  me,
  partner,
}: {
  checklistId: string;
  initial: ChecklistItem[];
  me: Who;
  partner: Who | null;
}) {
  const [items, setItems] = useState(initial);
  const [optimistic, applyOptimistic] = useOptimistic(
    items,
    (state: ChecklistItem[], patch: { id: string; checked: boolean }) =>
      state.map((i) =>
        i.id === patch.id
          ? {
              ...i,
              checked_at: patch.checked ? new Date().toISOString() : null,
              checked_by: patch.checked ? me.id : null,
            }
          : i,
      ),
  );
  const [, start] = useTransition();
  const [text, setText] = useState("");
  const [qty, setQty] = useState("");

  // 상대가 체크하면 즉시 반영된다. 마트에서 각자 다른 통로를 돌 때 필요하다.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`checklist:${checklistId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_items",
          filter: `checklist_id=eq.${checklistId}`,
        },
        (payload) => {
          // 마스킹이 없는 테이블이라 페이로드를 그대로 써도 된다
          setItems((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((i) => i.id !== (payload.old as ChecklistItem).id);
            }
            const row = payload.new as ChecklistItem;
            const exists = prev.some((i) => i.id === row.id);
            return exists
              ? prev.map((i) => (i.id === row.id ? row : i))
              : [...prev, row];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checklistId]);

  const list = sortItems(optimistic);
  const { done, total } = progress(optimistic);

  function who(id: string | null): Who | null {
    if (!id) return null;
    if (id === me.id) return me;
    return partner?.id === id ? partner : null;
  }

  function toggle(item: ChecklistItem) {
    const checked = !item.checked_at;
    start(async () => {
      applyOptimistic({ id: item.id, checked });
      const res = await toggleItem(item.id, checked);
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  checked_at: checked ? new Date().toISOString() : null,
                  checked_by: checked ? me.id : null,
                }
              : i,
          ),
        );
      }
      // 실패하면 낙관적 상태가 자동으로 되돌아간다
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 진행 막대 */}
      <div>
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="text-ash">진행</span>
          <span className="tnum">
            {done} / {total}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-slot-a transition-[width]"
            style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* lg 이상에서 두 열. 20개짜리 장보기가 세로로 늘어지면 훑기 어렵다. */}
      <ul className="flex flex-col gap-1 lg:grid lg:grid-cols-2 lg:gap-x-6">
        {list.map((item) => {
          const checker = who(item.checked_by);
          const assignee = who(item.assignee_id);
          return (
            <li key={item.id} className="group flex items-center gap-3 py-1.5">
              <button
                type="button"
                onClick={() => toggle(item)}
                // 터치 타겟 44px 이상
                className="grid size-11 shrink-0 place-items-center"
                aria-pressed={!!item.checked_at}
              >
                <span
                  className={`grid size-5 place-items-center rounded-md border text-xs ${
                    item.checked_at
                      ? "border-slot-a bg-slot-a text-white"
                      : "border-line"
                  }`}
                >
                  {item.checked_at ? "✓" : ""}
                </span>
              </button>

              <span
                className={`min-w-0 flex-1 truncate ${
                  item.checked_at ? "text-ash line-through" : ""
                }`}
              >
                {item.text}
                {item.qty && <span className="ml-1 text-sm text-ash">{item.qty}</span>}
              </span>

              {/* 담당자는 이모지만. 이름을 쓰면 줄이 길어진다. */}
              {partner && (
                <button
                  type="button"
                  onClick={() =>
                    start(async () => {
                      const next =
                        item.assignee_id === me.id
                          ? partner.id
                          : item.assignee_id === partner.id
                            ? null
                            : me.id;
                      await assignItem(item.id, next);
                      setItems((prev) =>
                        prev.map((i) =>
                          i.id === item.id ? { ...i, assignee_id: next } : i,
                        ),
                      );
                    })
                  }
                  className="shrink-0 text-sm opacity-60"
                  title="담당자 바꾸기"
                >
                  {assignee ? assignee.emoji : "·"}
                </button>
              )}

              {checker && item.checked_at && (
                <span className="shrink-0 text-xs text-ash">
                  {checker.emoji} {relativeTime(item.checked_at)}
                </span>
              )}

              <button
                type="button"
                onClick={() =>
                  start(async () => {
                    await deleteItem(item.id);
                    setItems((prev) => prev.filter((i) => i.id !== item.id));
                  })
                }
                className="shrink-0 px-1 text-xs text-ash opacity-0 group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          const q = qty.trim();
          setText("");
          setQty("");
          start(async () => {
            await addItem(checklistId, t, q || null);
          });
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="항목 추가"
          maxLength={120}
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 outline-none focus:border-slot-a"
        />
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="수량"
          maxLength={12}
          className="w-20 rounded-lg border border-line bg-card px-3 py-2 outline-none focus:border-slot-a"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-lg bg-slot-a px-4 font-medium text-white disabled:opacity-40"
        >
          ＋
        </button>
      </form>

      {done > 0 && (
        <button
          type="button"
          onClick={() =>
            start(async () => {
              await clearDone(checklistId);
              setItems((prev) => prev.filter((i) => !i.checked_at));
            })
          }
          className="self-start text-xs text-ash underline underline-offset-4"
        >
          완료한 {done}개 치우기
        </button>
      )}
    </div>
  );
}
