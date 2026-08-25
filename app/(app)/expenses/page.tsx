import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import type { Expense, Settlement } from "@/lib/expenses";
import { Brand } from "@/app/brand";
import { Live } from "@/app/(app)/live";
import { ExpensesView } from "./expenses-view";

export const metadata: Metadata = { title: "our Pay · JUNBI" };

export default async function ExpensesPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/");

  const supabase = await createClient();

  // 잔액은 화면에서 다시 더하지 않는다. DB 함수 한 곳에서만 계산한다 —
  // 두 군데서 더하면 언젠가 서로 다른 숫자가 나오고, 그게 돈이면 싸움이 된다.
  const [{ data: expenses }, { data: settlements }, { data: balance }] =
    await Promise.all([
      supabase
        .from("expenses")
        .select(
          "id,event_id,payer_id,amount,split,payer_ratio,category,memo,silent,occurred_at,settlement_id",
        )
        .order("occurred_at", { ascending: false })
        .returns<Expense[]>(),
      supabase
        .from("settlements")
        .select("id,from_id,to_id,amount,settled_at,memo")
        .order("settled_at", { ascending: false })
        .limit(20)
        .returns<Settlement[]>(),
      supabase.rpc("settlement_balance").maybeSingle<{
        owed_to: string | null;
        amount: number;
      }>(),
    ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-6 py-8">
      <Live />

      <div className="flex items-center justify-between">
        <span className="md:hidden">
          <Brand />
        </span>
        <h1 className="font-display text-lg">our Pay</h1>
      </div>

      <ExpensesView
        expenses={expenses ?? []}
        settlements={settlements ?? []}
        balance={{
          owed_to: balance?.owed_to ?? null,
          amount: Number(balance?.amount ?? 0),
        }}
        me={{ id: ctx.userId, emoji: ctx.me.emoji_key }}
        partner={
          ctx.partner
            ? { id: ctx.partner.id, emoji: ctx.partner.emoji_key }
            : null
        }
        partnerLabel={ctx.label}
        timeZone={ctx.timeZone}
      />

      <p className="text-xs leading-5 text-ash">
        계좌·카드를 연결하지 않아요. 계산과 기록만 하고, 실제 송금은 앱 밖에서
        해주세요.
      </p>
    </main>
  );
}
