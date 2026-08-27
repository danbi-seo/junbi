"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptRestore,
  dissolveCouple,
  dissolveSummary,
  exportCoupleData,
  requestRestore,
  type DissolveSummary,
} from "@/app/actions/account";
import { exportHealth } from "@/app/actions/health";
import { createClient } from "@/lib/supabase/client";

/**
 * 계정 — docs/08-auth-pairing.md 5~7
 *
 * 가입만큼 나가기도 쉬워야 한다. 개발자에게 요청하지 않고 앱 안에서 끝난다.
 * App Store도 앱 안에서 계정 삭제가 되기를 요구한다 — 없으면 반려된다.
 *
 * 화면이 하는 일은 하나다: **무슨 일이 일어나는지 미리 다 말하는 것.**
 * 숫자를 세어 보여준다. '모든 데이터가 삭제됩니다'로는 판단이 안 된다.
 */

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function AccountCard({
  paired,
  partnerLabel,
  restore,
}: {
  paired: boolean;
  partnerLabel: string;
  /** 해제 뒤 유예 기간 중일 때만 온다 */
  restore: { purgeAfter: string; askedByMe: boolean | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<"idle" | "confirm" | "danger">("idle");
  const [summary, setSummary] = useState<DissolveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = () =>
    start(async () => {
      setError(null);
      setSummary(await dissolveSummary());
      setStep("confirm");
    });

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.message ?? "처리하지 못했어요");
      setStep("idle");
      router.refresh();
    });

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">계정</h2>

      {/* 유예 기간 중 — 되돌릴 수 있다는 걸 먼저 보여준다 */}
      {restore && (
        <div className="mt-4 rounded-lg border border-line bg-paper p-4">
          <p className="text-sm">
            연결이 해제됐어요.{" "}
            {new Intl.DateTimeFormat("ko-KR", {
              month: "long",
              day: "numeric",
            }).format(new Date(restore.purgeAfter))}
            까지는 되돌릴 수 있어요.
          </p>
          <p className="mt-2 text-xs leading-5 text-ash">
            끊는 건 혼자 할 수 있지만 다시 잇는 건 둘 다 동의해야 해요.
            <br />
            건강 기록은 이미 지워져서 돌아오지 않아요.
          </p>

          {restore.askedByMe === null ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(requestRestore)}
              className="mt-3 rounded-lg border border-line bg-card px-4 py-2 text-sm disabled:opacity-40"
            >
              다시 연결하자고 하기
            </button>
          ) : restore.askedByMe ? (
            <p className="mt-3 text-xs text-ash">
              요청했어요. {partnerLabel}님이 수락하면 다시 연결돼요.
            </p>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(acceptRestore)}
              className="mt-3 rounded-lg bg-slot-a px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              다시 연결하기
            </button>
          )}
        </div>
      )}

      {/* ── 연결 해제 ─────────────────────────────────────────── */}
      {paired && step === "idle" && (
        <button
          type="button"
          disabled={pending}
          onClick={open}
          className="mt-4 text-sm text-ash underline underline-offset-4 disabled:opacity-40"
        >
          {partnerLabel}님과 연결 해제
        </button>
      )}

      {paired && step === "confirm" && summary && (
        <div className="mt-4 rounded-lg border border-line bg-paper p-4">
          <p className="font-medium">{partnerLabel}님과의 연결을 해제할까요?</p>

          <p className="mt-4 text-sm">즉시 삭제되는 것</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ash">
            <li>· 생리 주기 기록 {summary.cycles}건</li>
            <li>· 컨디션 기록 {summary.conditions}건</li>
            <li>· 지금 상태</li>
            <li>· 캘린더 구독 주소 (양쪽 다)</li>
          </ul>

          <p className="mt-4 text-sm">30일 후 삭제되는 것</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ash">
            <li>· 함께 일정 {summary.sharedEvents}개</li>
            <li>· 저장한 장소 {summary.places}곳</li>
            <li>· 지출 내역 {summary.expenses}건</li>
            <li>· 체크리스트 {summary.checklists}개</li>
            <li>· 기념일 {summary.anniversaries}개</li>
          </ul>

          {/* 다 없어지는 게 아니라는 걸 말해줘야 공포가 안 생긴다 */}
          <p className="mt-4 text-sm">
            내 개인 일정 {summary.myEvents}개는 그대로 남아요.
          </p>

          <p className="mt-3 text-xs leading-5 text-ash">
            · 30일 안에는 되돌릴 수 있어요 (양쪽 동의 필요)
            <br />· {partnerLabel}님에게 해제 사실이 알려져요. 누가 눌렀는지는
            알리지 않아요
          </p>

          {/* 건강 기록은 유예 없이 사라진다. 그래서 위에 따로 둔다. */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await exportHealth();
                  if (!res.ok) return setError(res.message);
                  download("junbi-health.json", res.data!.json);
                })
              }
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm disabled:opacity-40"
            >
              건강 기록 먼저 내보내기
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await exportCoupleData();
                  if (!res.ok) return setError(res.message);
                  download("junbi-my-data.json", res.data!);
                })
              }
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm disabled:opacity-40"
            >
              내 기록 내보내기
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`${partnerLabel}님과 연결을 해제할까요?`)) return;
                run(() => dissolveCouple(false));
              }}
              className="rounded-lg bg-slot-a px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              연결 해제 (30일 뒤 삭제)
            </button>

            {/* 30일을 기다리고 싶지 않은 사람이 있고, 그게 권리다 */}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  !confirm(
                    "지금 바로 모두 삭제할까요? 되돌릴 수 없어요.",
                  )
                )
                  return;
                run(() => dissolveCouple(true));
              }}
              className="rounded-lg border border-line px-4 py-3 text-sm text-danger disabled:opacity-40"
            >
              지금 바로 모두 삭제
            </button>

            <button
              type="button"
              onClick={() => setStep("idle")}
              className="px-4 py-2 text-sm text-ash"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* ── 탈퇴 ──────────────────────────────────────────────── */}
      <div className="mt-5 border-t border-line pt-4">
        {step !== "danger" ? (
          <button
            type="button"
            onClick={() => setStep("danger")}
            className="text-sm text-ash underline underline-offset-4"
          >
            탈퇴하기
          </button>
        ) : (
          <div className="rounded-lg border border-line bg-paper p-4">
            <p className="font-medium">정말 탈퇴할까요?</p>
            <p className="mt-2 text-sm leading-6 text-ash">
              계정과 내가 만든 모든 기록이 지워져요. 되돌릴 수 없어요.
              {paired && (
                <>
                  <br />
                  {partnerLabel}님과의 연결도 함께 해제돼요.
                </>
              )}
            </p>
            <p className="mt-2 text-xs leading-5 text-ash">
              필요한 기록이 있으면 먼저 내보내세요. 탈퇴 후에는 받을 수 없어요.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm("탈퇴하면 되돌릴 수 없어요. 계속할까요?")) return;
                  start(async () => {
                    setError(null);
                    const res = await fetch("/api/account", { method: "DELETE" });
                    if (!res.ok) {
                      const b = await res.json().catch(() => ({}));
                      return setError(b.message ?? "탈퇴하지 못했어요");
                    }
                    // 계정이 사라졌으니 로컬 세션도 비운다.
                    // 안 비우면 죽은 토큰으로 계속 401을 맞는다.
                    await createClient().auth.signOut().catch(() => {});
                    router.replace("/login");
                    router.refresh();
                  });
                }}
                className="rounded-lg border border-line px-4 py-3 text-sm text-danger disabled:opacity-40"
              >
                {pending ? "처리 중…" : "탈퇴하기"}
              </button>
              <button
                type="button"
                onClick={() => setStep("idle")}
                className="px-4 py-2 text-sm text-ash"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
