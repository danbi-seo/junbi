"use client";

import { useState, useSyncExternalStore } from "react";
import {
  pushState,
  subscribePush,
  unsubscribePush,
  type PushState,
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

export function PushCard() {
  const detected = useSyncExternalStore<PushState | null>(
    noSubscribe,
    pushState,
    () => null,
  );
  // 사용자가 켜거나 끄면 즉시 반영한다
  const [override, setOverride] = useState<PushState | null>(null);
  const state = override ?? detected;

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (state === null) return null;

  async function turnOn() {
    setBusy(true);
    setNote(null);
    const next = await subscribePush();
    setOverride(next);
    setBusy(false);
    if (next === "granted") {
      setNote("켜졌어요. 상대가 일정을 넣으면 알려드릴게요.");
    } else if (next === "denied") {
      setNote("거절하셨어요. 아래 안내를 참고해 주세요.");
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

      {state === "granted" ? (
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
            {busy ? "켜는 중…" : "알림 받기"}
          </button>
        </>
      )}

      {note && <p className="mt-3 text-xs leading-5 text-ok">{note}</p>}
    </section>
  );
}
