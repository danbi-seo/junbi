"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 비상용 비밀번호 — docs/08-auth-pairing.md 8 (예외 경로)
 *
 * 카카오로만 들어오면 카카오가 막히는 순간 앱에도 못 들어간다.
 * 계정을 잃거나, 심사·정책으로 로그인이 막히거나, 카카오가 장애일 때다.
 *
 * 이메일 코드로 되돌리는 게 정석인데 그건 메일 발송이 필요하고,
 * 지금은 SMTP가 없다. 그래서 **메일을 한 통도 안 쓰는** 경로를 둔다.
 * 로그인한 상태에서 비밀번호를 직접 정해 두면, 다음부터는
 * 이메일 + 비밀번호로 들어올 수 있다.
 *
 * 한계를 숨기지 않는다. 이 비밀번호를 잊으면 스스로 되돌릴 방법이 없다.
 * 재설정에는 결국 메일이 필요하기 때문이다.
 */
export function PasswordCard({ email }: { email: string | null }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 이메일이 없으면 비밀번호가 있어도 로그인할 수 없다.
  // 로그인 화면이 주소를 물어보기 때문이다.
  if (!email) {
    return (
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="font-display text-lg">비상용 비밀번호</h2>
        <p className="mt-2 text-sm leading-6 text-ash">
          카카오 계정에 이메일이 없어서 지금은 만들 수 없어요. 카카오에서
          이메일 제공에 동의하면 그때 만들 수 있어요.
        </p>
        <p className="mt-2 text-xs leading-5 text-ash">
          지금은 카카오 로그인만 쓸 수 있어요.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">비상용 비밀번호</h2>
      <p className="mt-2 text-sm leading-6 text-ash">
        카카오에 못 들어가게 됐을 때를 위한 거예요. 평소에는 카카오로
        로그인하시면 돼요.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-line px-4 py-2 text-sm"
        >
          {done ? "다시 설정하기" : "설정하기"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);

            if (value.length < 8) {
              setError("8자 이상으로 정해 주세요");
              return;
            }
            if (value !== again) {
              setError("두 번 입력한 값이 서로 달라요");
              return;
            }

            start(async () => {
              const { error } = await createClient().auth.updateUser({
                password: value,
              });
              if (error) {
                setError("설정하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
                return;
              }
              setValue("");
              setAgain("");
              setOpen(false);
              setDone(true);
            });
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ash">새 비밀번호 (8자 이상)</span>
            <input
              type="password"
              autoComplete="new-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ash">한 번 더</span>
            <input
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
            />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-slot-a px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setValue("");
                setAgain("");
                setError(null);
              }}
              className="px-4 py-2 text-sm text-ash"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {done && (
        <p className="mt-3 text-sm text-ok">
          설정했어요. 로그인 화면에서 <b>{email}</b> 와 이 비밀번호로 들어올 수
          있어요.
        </p>
      )}

      {/* 한계를 숨기면 나중에 더 크게 문제가 된다 */}
      <p className="mt-3 text-xs leading-5 text-ash">
        이 비밀번호를 잊으면 스스로 되돌릴 수 없어요. 재설정에는 메일이
        필요한데 아직 메일을 보낼 수 없거든요. 카카오로 들어와 다시 설정하는
        방법뿐이에요.
      </p>
    </section>
  );
}
