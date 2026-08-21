"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueIcsToken } from "@/app/actions/ics";

/**
 * 캘린더 앱 연결 카드 — docs/12-ics-feed.md, docs/21-onboarding.md
 *
 * 기술적으로는 간단한데 사용자가 구독하는 법을 모른다.
 * 안내가 부실하면 여기서 절반이 빠진다.
 */
export function IcsCard({
  initialToken,
  lastRead,
  origin,
}: {
  initialToken: string | null;
  lastRead: string | null;
  origin: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [howto, setHowto] = useState<"ios" | "google" | null>(null);

  const url = token ? `${origin}/api/ics/${token}.ics` : null;

  function issue(regenerate: boolean) {
    if (regenerate && !confirm("이전 주소는 즉시 못 쓰게 돼요. 다시 만들까요?")) return;
    setError(null);
    start(async () => {
      const res = await issueIcsToken();
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setToken(res.token);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">캘린더 앱에서 보기</h2>
      <p className="mt-2 text-sm leading-6 text-ash">
        기본 캘린더 앱에 연결하면 홈 화면 위젯과 잠금화면에서 일정을 볼 수 있고,
        일정 알림도 더 정확하게 와요.
      </p>

      {!url ? (
        <button
          type="button"
          onClick={() => issue(false)}
          disabled={pending}
          className="mt-4 w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          {pending ? "만드는 중…" : "주소 만들기"}
        </button>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 rounded-md border border-line px-2 py-1 text-xs"
            >
              {copied ? "복사됨" : "복사"}
            </button>
          </div>

          {/* 인증 없는 공개 URL이다. 눈에 띄게 알려야 한다. */}
          <p className="mt-3 rounded-lg bg-slot-b-bg px-3 py-2 text-xs leading-5">
            ⚠️ 이 주소를 아는 사람은 누구나 일정을 볼 수 있어요. 공유하지 마세요.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setHowto(howto === "ios" ? null : "ios")}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            >
              아이폰에서 추가하기
            </button>
            <button
              type="button"
              onClick={() => setHowto(howto === "google" ? null : "google")}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            >
              구글 캘린더에 추가하기
            </button>
          </div>

          {howto === "ios" && (
            <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-sm leading-6 text-ash">
              <li>위 주소를 복사해요</li>
              <li>설정 → 캘린더 → 계정</li>
              <li>계정 추가 → 기타</li>
              <li>구독 캘린더 추가</li>
              <li>주소를 붙여넣고 저장</li>
            </ol>
          )}

          {howto === "google" && (
            <div className="mt-3 text-sm leading-6 text-ash">
              <p className="rounded-lg bg-slot-b-bg px-3 py-2 text-xs leading-5 text-ink">
                ⚠️ 구글 캘린더는 <strong>PC에서만</strong> 구독을 추가할 수 있어요.
                구글 정책이라 어쩔 수 없어요.
              </p>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
                <li>PC 브라우저에서 calendar.google.com 접속</li>
                <li>왼쪽 &lsquo;다른 캘린더&rsquo; 옆 ＋ → URL로 추가</li>
                <li>주소를 붙여넣고 추가</li>
              </ol>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-xs text-ash">
            <span>
              {lastRead
                ? `캘린더 연결됨 · 마지막 동기화 ${when(lastRead)}`
                : "아직 캘린더 앱이 읽어간 적이 없어요"}
            </span>
            <button
              type="button"
              onClick={() => issue(true)}
              disabled={pending}
              className="underline underline-offset-4"
            >
              주소 재발급
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}

function when(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
