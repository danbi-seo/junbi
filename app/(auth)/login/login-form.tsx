"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "start" | "password";

/**
 * 로그인 — docs/08-auth-pairing.md 1
 *
 * 카카오는 **인증에만** 쓴다. 친구목록·메시지 보내기 같은 건 요청하지 않는다.
 * 우리가 받는 건 "이 사람이 이 사람이 맞다"는 사실뿐이다.
 *
 * ── 이메일 코드(OTP)를 화면에서 뺀 이유 ────────────────────────
 *
 * Supabase 기본 메일은 시간당 2통이고 프로젝트 팀원 주소로만 나간다.
 * 그대로 두면 눌러도 실패하는 죽은 버튼이 된다. 실패를 사용자 잘못처럼
 * 보이게 하느니 없는 게 낫다 → docs/21-onboarding.md
 *
 * 커스텀 SMTP를 붙이면 되살린다. 코드는 git 이력에 있다.
 *
 * ── 비밀번호 경로가 남아 있는 이유 ─────────────────────────────
 *
 * 이제 이게 유일한 보조 경로다. 카카오 계정을 잃거나 카카오 로그인이
 * 막히면 여기로 들어온다. 설정에서 미리 만들어 둘 수 있다.
 * 메일을 한 통도 안 보내고 동작하는 게 핵심이다.
 */
export function LoginForm() {
  const router = useRouter();
  // 초대 링크로 들어왔다면 로그인 뒤 그리로 돌아가야 한다.
  // 안 그러면 코드가 사라져 링크를 다시 받아야 한다.
  const next = useSearchParams().get("next");
  const supabase = createClient();

  const [step, setStep] = useState<Step>("start");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function done() {
    // 서버 컴포넌트가 새 세션을 보게 하려면 refresh가 필요하다.
    router.refresh();
    router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

  async function signInWithKakao() {
    setBusy(true);
    setError(null);

    // 카카오 → Supabase → 우리 /auth/callback 순서로 돌아온다.
    // 그 라우트가 이미 code를 세션으로 바꾸고 있어 따로 만들 게 없다.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo:
          `${window.location.origin}/auth/callback` +
          (next ? `?next=${encodeURIComponent(next)}` : ""),
      },
    });

    if (error) {
      setBusy(false);
      setError(
        "카카오 로그인을 시작하지 못했어요. 잠시 뒤에 다시 시도해 주세요.",
      );
    }
    // 성공하면 페이지가 카카오로 넘어간다. busy는 그대로 둔다.
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);
    if (error) {
      setError("주소나 비밀번호가 맞지 않아요.");
      return;
    }
    done();
  }

  const field =
    "w-full rounded-lg border border-line bg-card px-4 py-3 text-ink " +
    "outline-none focus:border-slot-a focus:ring-2 focus:ring-slot-a/20";

  if (step === "start") {
    return (
      <div className="flex flex-col gap-4">
        {/* 카카오 버튼은 브랜드 색을 그대로 쓴다. 우리 색으로 칠하면
            "카카오가 맞나" 하는 의심이 생기고 그게 이탈로 이어진다. */}
        <button
          type="button"
          onClick={signInWithKakao}
          disabled={busy}
          className="w-full rounded-lg bg-[#FEE500] px-4 py-3 font-medium text-[#191600] disabled:opacity-40"
        >
          {busy ? "카카오로 이동 중…" : "카카오로 시작하기"}
        </button>

        {error && <p className="text-sm text-danger">{error}</p>}

        <p className="text-sm leading-6 text-ash">로그인 할때만 사용됩니다.</p>

        <button
          type="button"
          onClick={() => {
            setStep("password");
            setError(null);
          }}
          className="text-sm text-ash underline underline-offset-4"
        >
          비밀번호로 로그인
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={signInWithPassword} className="flex flex-col gap-4">
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

      <label className="flex flex-col gap-2">
        <span className="text-sm text-ash">비밀번호</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
        />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={busy || !email || !password}
        className="w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "확인 중…" : "로그인"}
      </button>

      {/* 잊었을 때 스스로 되돌릴 방법이 없다. 미리 말해 둔다. */}
      <p className="text-xs leading-5 text-ash">
        설정에서 미리 만들어 둔 비상용 비밀번호예요. 잊으면 되돌릴 수 없으니
        카카오로 들어와 다시 설정해 주세요.
      </p>

      <button
        type="button"
        onClick={() => {
          setStep("start");
          setPassword("");
          setError(null);
        }}
        className="text-sm text-ash underline underline-offset-4"
      >
        카카오로 로그인할게요
      </button>
    </form>
  );
}
