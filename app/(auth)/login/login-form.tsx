"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

/**
 * 이메일로 6자리 코드를 받아 로그인한다.
 *
 * 카카오 로그인은 7단계다. 0~6단계는 이 경로로 개발한다.
 * 카카오가 붙은 뒤에도 이 경로는 남는다 — 카카오가 막히거나
 * PC에서 쓸 때의 보조 경로가 필요하다 → docs/08-auth-pairing.md
 */
export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });

    setBusy(false);
    if (error) {
      // 실패를 사용자 잘못처럼 쓰지 않는다 → docs/21-onboarding.md
      setError(
        error.status === 429
          ? "메일을 너무 자주 보냈어요. 잠시 뒤에 다시 시도해 주세요."
          : "코드를 보내지 못했어요. 주소를 확인하고 다시 시도해 주세요.",
      );
      return;
    }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });

    setBusy(false);
    if (error) {
      setError("코드가 맞지 않아요. 메일을 다시 확인해 주세요.");
      return;
    }

    // 서버 컴포넌트가 새 세션을 보게 하려면 refresh가 필요하다.
    router.refresh();
    router.push("/");
  }

  const field =
    "w-full rounded-lg border border-line bg-card px-4 py-3 text-ink " +
    "outline-none focus:border-slot-a focus:ring-2 focus:ring-slot-a/20";
  const button =
    "w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white " +
    "disabled:opacity-40 disabled:cursor-not-allowed";

  if (step === "email") {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-ash">이메일</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={field}
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button type="submit" disabled={busy || !email} className={button}>
          {busy ? "보내는 중…" : "코드 받기"}
        </button>

        <p className="text-sm leading-6 text-ash">
          비밀번호가 없어요. 메일로 6자리 코드를 보내드립니다.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-ash">
        <span className="text-ink">{email}</span> 으로 코드를 보냈어요.
      </p>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-ash">6자리 코드</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className={`${field} tnum text-center text-2xl tracking-[0.4em]`}
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button type="submit" disabled={busy || code.length < 6} className={button}>
        {busy ? "확인 중…" : "로그인"}
      </button>

      <button
        type="button"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
        className="text-sm text-ash underline underline-offset-4"
      >
        주소를 다시 입력할게요
      </button>
    </form>
  );
}
