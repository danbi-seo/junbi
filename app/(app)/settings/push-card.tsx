"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  pushState,
  subscribePush,
  unsubscribePush,
  STEP_LABEL,
  lastPushError,
  lastSaveError,
  type PushState,
  type PushStep,
} from "@/lib/push";

/**
 * 웹 푸시 켜기 — docs/13-notifications.md, docs/21-onboarding.md
 *
 * OS 팝업보다 우리 설명 화면을 먼저 띄운다.
 * OS 팝업은 한 번 거절하면 되돌리기가 매우 어렵다.
 * 우리 화면에서 거절하면 팝업을 아예 안 띄우고 나중에 다시 물어볼 수 있다.
 */
/** 알림 권한은 브라우저에만 있는 정보다. 서버에서는 알 수 없다. */
const noSubscribe = () => () => {};

export function PushCard({ hasSubscription }: { hasSubscription: boolean }) {
  const detected = useSyncExternalStore<PushState | null>(
    noSubscribe,
    pushState,
    () => null,
  );
  // 사용자가 켜거나 끄면 즉시 반영한다
  const [override, setOverride] = useState<PushState | null>(null);
  const state = override ?? detected;

  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<PushStep | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (state === null) return null;

  // 브라우저 권한은 있는데 서버에 구독이 없는 경우.
  // 화면만 '켜짐'이고 실제로는 한 통도 안 온다. 사용자는 원인을 알 수 없다.
  const needsResubscribe = state === "granted" && !hasSubscription;

  async function turnOn() {
    setBusy(true);
    setNote(null);
    setStep(null);
    // 어디서 멈추는지 보이게 한다. '등록 중…'만 뜨면 원인을 알 수 없다.
    const next = await subscribePush(setStep);

    // 세션이 끊겼으면 여기 머물 이유가 없다.
    // 로그인된 것처럼 보이는 화면에 실패 문구만 얹으면 뭘 해야 할지 모른다.
    if (next === "signed-out") {
      router.replace("/login");
      router.refresh();
      return;
    }

    setOverride(next);
    setBusy(false);
    if (next === "granted") {
      setNote("켜졌어요. 상대가 일정을 넣으면 알려드릴게요.");
    } else if (next === "denied") {
      setNote("거절하셨어요. 아래 안내를 참고해 주세요.");
    } else if (next === "save-failed") {
      // 원인을 그대로 보여준다. 세션이 끊긴 것과 DB가 거부한 것은
      // 사용자가 할 일이 다르다 — 하나는 재로그인, 하나는 재시도다.
      setNote(
        lastSaveError
          ? `허용은 됐는데 저장에 실패했어요.\n${lastSaveError}`
          : "허용은 됐는데 저장에 실패했어요. 다시 시도해 주세요.",
      );
    } else if (next === "no-worker") {
      setNote("알림을 받을 준비가 안 됐어요. 새로고침한 뒤 다시 시도해 주세요.");
    } else if (next === "timeout" || next === "error") {
      // 브라우저가 준 메시지를 그대로 보여준다. 뭉개면 원인을 못 찾는다.
      setNote(
        `'${step ? STEP_LABEL[step] : "등록"}' 단계에서 막혔어요.` +
          (lastPushError ? `
${lastPushError}` : ""),
      );
    }
  }

  async function turnOff() {
    setBusy(true);
    await unsubscribePush();
    setOverride(pushState());
    setBusy(false);
    setNote("껐어요. 일정 알림은 캘린더 앱이 계속 보내드려요.");
  }

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">알림</h2>

      {needsResubscribe ? (
        <div className="mt-2 text-sm leading-6 text-ash">
          <p className="rounded-lg bg-slot-b-bg px-3 py-2 text-ink">
            알림 권한은 켜져 있는데 이 기기가 등록되지 않았어요.
          </p>
          <p className="mt-2 text-xs">
            기기를 바꾸거나 브라우저 데이터를 지우면 이렇게 됩니다.
          </p>
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="mt-3 w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {busy ? `등록 중… ${step ? STEP_LABEL[step] : ""}` : "이 기기 등록하기"}
          </button>
        </div>
      ) : state === "granted" ? (
        <>
          <p className="mt-2 text-sm leading-6 text-ash">
            켜져 있어요. 상대가 함께 일정을 추가하거나 바꾸면 바로 알려드려요.
          </p>
          <button
            type="button"
            onClick={turnOff}
            disabled={busy}
            className="mt-4 rounded-lg border border-line px-4 py-2 text-sm"
          >
            {busy ? "끄는 중…" : "알림 끄기"}
          </button>
        </>
      ) : state === "needs-install" ? (
        <p className="mt-2 rounded-lg bg-slot-b-bg px-3 py-2 text-sm leading-6">
          아이폰은 <strong>홈 화면에 추가</strong>해야 알림을 받을 수 있어요.
          애플 정책이라 어쩔 수 없어요. 위 &lsquo;설정 상태&rsquo;에서 먼저 추가해
          주세요.
        </p>
      ) : state === "denied" ? (
        <div className="mt-2 text-sm leading-6 text-ash">
          {/* 실패를 사용자 잘못처럼 쓰지 않는다 → docs/21-onboarding.md */}
          <p>알림이 꺼져 있어요. 기기 설정에서 켤 수 있어요.</p>
          <p className="mt-2 text-xs">
            아이폰 · 설정 → JUNBI → 알림
            <br />
            안드로이드 · 설정 → 앱 → JUNBI → 알림
          </p>
          <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-xs">
            알림을 안 켜도 <strong>일정 시간 알림은 캘린더 앱이 보내줘요.</strong>{" "}
            아래에서 캘린더를 연결해 두셨다면 약속을 놓치지 않아요.
          </p>
        </div>
      ) : state === "no-worker" ? (
        <div className="mt-2 text-sm leading-6 text-ash">
          <p>
            알림을 받을 준비가 아직 안 됐어요. 새로고침한 뒤 다시 눌러 주세요.
          </p>
          {/*
           * 개발자용 안내(npm run dev)가 여기 남아 있었다. 쓰는 사람에게는
           * 무슨 말인지 알 수 없는 문구다. 실제로 할 수 있는 일만 적는다.
           */}
          <p className="mt-2 text-xs">
            앱을 완전히 껐다가 다시 열면 대부분 해결돼요.
          </p>
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="mt-3 rounded-lg border border-line px-4 py-2 text-sm"
          >
            다시 시도
          </button>
        </div>
      ) : state === "save-failed" ? (
        <div className="mt-2 text-sm leading-6 text-ash">
          <p>알림 권한은 받았는데 저장에 실패했어요.</p>
          {lastSaveError && (
            <p className="mt-1 text-xs break-words">{lastSaveError}</p>
          )}
          <p className="mt-2 text-xs leading-5">
            로그인이 풀린 경우가 가장 많아요. 다시 시도해도 안 되면 로그아웃 후
            다시 로그인해 주세요.
          </p>
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="mt-3 rounded-lg border border-line px-4 py-2 text-sm"
          >
            다시 시도
          </button>
        </div>
      ) : state === "unsupported" ? (
        <p className="mt-2 text-sm leading-6 text-ash">
          이 브라우저는 알림을 지원하지 않아요. 일정 알림은 캘린더 앱이
          보내드려요.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-ash">이럴 때 알려드려요.</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-ash">
            <li>상대가 함께 일정을 추가했을 때</li>
            <li>일정이 바뀌었을 때</li>
          </ul>
          <p className="mt-2 text-xs leading-5 text-ash">
            상대가 &lsquo;시간만&rsquo;으로 둔 일정은 알리지 않아요.
          </p>
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            {busy ? `켜는 중… ${step ? STEP_LABEL[step] : ""}` : "알림 받기"}
          </button>
        </>
      )}

      {note && (
        <p className="mt-3 whitespace-pre-line text-xs leading-5 text-ok">
          {note}
        </p>
      )}
    </section>
  );
}
