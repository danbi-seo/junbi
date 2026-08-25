"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addExpense,
  deleteExpense,
  settleUp,
  undoSettlement,
} from "@/app/actions/expenses";
import {
  CATEGORIES,
  SPLIT_LABEL,
  categoryEmoji,
  won,
  otherOwes,
  balanceSentence,
  dayLabel,
  type Expense,
  type Settlement,
  type SplitType,
} from "@/lib/expenses";

type Who = { id: string; emoji: string };

export function ExpensesView({
  expenses,
  settlements,
  balance,
  me,
  partner,
  partnerLabel,
  timeZone,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  balance: { owed_to: string | null; amount: number };
  me: Who;
  partner: Who | null;
  partnerLabel: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) {
        setError(res.message ?? "처리하지 못했어요");
        return;
      }
      router.refresh();
    });

  const unsettled = expenses.filter((e) => !e.settlement_id);
  const owedToMe = balance.owed_to === me.id;
  const emojiOf = (id: string) => (id === me.id ? me.emoji : (partner?.emoji ?? "🙂"));

  // 날짜별로 묶는다
  const byDay = new Map<string, Expense[]>();
  for (const e of unsettled) {
    const d = dayLabel(e.occurred_at, timeZone);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(e);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 잔액 — 문장으로. 부호 표기는 방향이 헷갈린다. */}
      <section className="rounded-xl border border-line bg-card p-5">
        <p className="text-lg">
          {balanceSentence(balance.amount, owedToMe, partnerLabel)}
        </p>
        {unsettled.length > 0 && (
          <p className="mt-1 text-xs text-ash">미정산 {unsettled.length}건</p>
        )}

        {balance.amount > 0 && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`${won(balance.amount)}을 주고받으셨나요?`)) return;
                act(() => settleUp(null));
              }}
              className="mt-4 w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
            >
              {pending ? "처리 중…" : "정산 완료로 표시"}
            </button>
            <p className="mt-2 text-xs leading-5 text-ash">
              실제 송금은 앱 밖에서 해주세요. 여기서는 기록만 해요.
            </p>
          </>
        )}
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* 미정산 목록 */}
      {unsettled.length === 0 ? (
        <p className="text-ash">아직 기록한 지출이 없어요.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {[...byDay.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm text-ash">{day}</h2>
              <ul className="flex flex-col gap-2">
                {list.map((e) => {
                  const owes = otherOwes(e);
                  const payerIsMe = e.payer_id === me.id;
                  return (
                    <li
                      key={e.id}
                      className="rounded-xl border border-line bg-card p-4"
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="text-lg">{categoryEmoji(e.category)}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {e.memo ?? "지출"}
                        </span>
                        <span className="tnum shrink-0">{won(e.amount)}</span>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-xs text-ash">
                        <span>{emojiOf(e.payer_id)} 결제</span>
                        <span>·</span>
                        <span>{SPLIT_LABEL[e.split as SplitType]}</span>
                        {e.split === "payer_all" ? (
                          <span>· 내가 다 낼게</span>
                        ) : (
                          <span>
                            → {emojiOf(payerIsMe ? (partner?.id ?? "") : me.id)}{" "}
                            {won(owes)}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (!confirm("이 지출을 지울까요?")) return;
                            act(() => deleteExpense(e.id));
                          }}
                          className="ml-auto underline underline-offset-4"
                        >
                          지우기
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {adding ? (
        <AddForm
          me={me}
          partner={partner}
          partnerLabel={partnerLabel}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg border border-line bg-card px-4 py-3 text-sm"
        >
          ＋ 지출 추가
        </button>
      )}

      {/* 이력이 없으면 "언제 정산했지"라는 분쟁이 남는다 */}
      {settlements.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-sm text-ash underline underline-offset-4"
          >
            정산 이력 {showHistory ? "접기" : `${settlements.length}건 보기`}
          </button>

          {showHistory && (
            <ul className="mt-3 flex flex-col gap-2">
              {settlements.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-card px-4 py-3 text-sm"
                >
                  <span className="text-xs text-ash">
                    {dayLabel(s.settled_at, timeZone)}
                  </span>
                  <span>
                    {emojiOf(s.from_id)} → {emojiOf(s.to_id)}
                  </span>
                  <span className="tnum ml-auto">{won(s.amount)}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm("이 정산을 되돌릴까요?")) return;
                      act(() => undoSettlement(s.id));
                    }}
                    className="text-xs text-ash underline underline-offset-4"
                  >
                    되돌리기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function AddForm({
  me,
  partner,
  partnerLabel,
  onDone,
}: {
  me: Who;
  partner: Who | null;
  partnerLabel: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState(me.id);
  const [split, setSplit] = useState<SplitType>("half");
  const [ratio, setRatio] = useState(50);
  const [category, setCategory] = useState("food");
  const [error, setError] = useState<string | null>(null);

  const value = Number(amount.replace(/[^\d]/g, "")) || 0;
  const owes =
    split === "payer_all"
      ? 0
      : split === "half"
        ? Math.floor(value / 2)
        : Math.floor((value * (100 - ratio)) / 100);
  const otherEmoji = payer === me.id ? (partner?.emoji ?? "🙂") : me.emoji;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const form = new FormData(e.currentTarget);
        form.set("payer_id", payer);
        form.set("split", split);
        form.set("payer_ratio", String(ratio));
        form.set("category", category);
        start(async () => {
          const res = await addExpense(form);
          if (!res.ok) {
            setError(res.message);
            return;
          }
          onDone();
          router.refresh();
        });
      }}
      className="flex flex-col gap-4 rounded-xl border border-line bg-card p-5"
    >
      {/* 금액이 주인공이라 크게 */}
      <input
        name="amount"
        inputMode="numeric"
        value={amount}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, "");
          setAmount(raw ? Number(raw).toLocaleString("ko-KR") : "");
        }}
        placeholder="0"
        required
        className="tnum rounded-lg border border-line bg-paper px-4 py-3 text-right text-2xl outline-none focus:border-slot-a"
      />

      <div>
        <p className="mb-2 text-sm text-ash">누가 냈어요?</p>
        <div className="flex gap-2">
          {[
            { id: me.id, emoji: me.emoji, label: "나" },
            ...(partner ? [{ id: partner.id, emoji: partner.emoji, label: partnerLabel }] : []),
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPayer(p.id)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                payer === p.id ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
              }`}
            >
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm text-ash">어떻게 나눌까요?</p>
        <div className="flex gap-2">
          {(["half", "payer_all", "custom"] as SplitType[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSplit(s)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                split === s ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
              }`}
            >
              {SPLIT_LABEL[s]}
            </button>
          ))}
        </div>

        {split === "custom" && (
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-ash">결제자 부담</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={ratio}
              onChange={(e) => setRatio(Number(e.target.value))}
              className="flex-1"
            />
            <span className="tnum w-12 text-right">{ratio}%</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              category === c.key ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
            }`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <input
        name="memo"
        placeholder="메모 (선택)"
        maxLength={200}
        className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
      />

      {/* 저장 전에 결과가 보이면 오입력이 줄고 서로 확인이 된다 */}
      {value > 0 && (
        <p className="rounded-lg bg-paper px-3 py-2 text-sm">
          {split === "payer_all"
            ? "정산 없이 기록만 해요"
            : `→ ${otherEmoji} 가 ${won(owes)} 정산`}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="silent" className="size-4" />
        🔕 이 지출은 알리지 않기
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || value <= 0}
          className="flex-1 rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-line px-4 py-3 text-sm"
        >
          취소
        </button>
      </div>

      <p className="text-xs leading-5 text-ash">
        계좌·카드 정보는 입력하지 마세요. 실제 송금은 앱 밖에서 해주세요.
      </p>
    </form>
  );
}
