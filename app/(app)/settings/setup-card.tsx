"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { installState, INSTALL_COPY, type InstallState } from "@/lib/install";
import { markInstalled } from "@/app/actions/onboarding";

/**
 * 설치 여부는 브라우저에만 있는 정보다. 서버에서는 알 수 없다.
 * useSyncExternalStore로 읽으면 서버 렌더와 어긋나지 않고,
 * 설치 직후 표시 모드가 바뀌는 것도 자동으로 따라간다.
 */
function subscribeDisplayMode(onChange: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * 설정 상태 카드 — docs/21-onboarding.md
 *
 * 세 가지 진행 상황을 한 곳에서 보여준다. 건너뛴 것도 여기서 다시 시작한다.
 * 다 되면 카드를 감춘다. 할 일이 없는 카드가 계속 떠 있으면 자리만 먹는다.
 */

type Prompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function SetupCard({ calendarConnected }: { calendarConnected: boolean }) {
  const state = useSyncExternalStore<InstallState | null>(
    subscribeDisplayMode,
    installState,
    () => null, // 서버에서는 알 수 없다
  );

  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<Prompt | null>(null);

  useEffect(() => {
    // 안드로이드는 브라우저 기본 배너를 막고 우리 타이밍에 띄운다.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as Prompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // 설치된 사실을 서버에도 남긴다. "완료" 버튼 대신 코드로 확인한다.
  useEffect(() => {
    if (state === "installed") void markInstalled();
  }, [state]);

  if (state === null) return null;

  const installed = state === "installed";
  // 셋 다 끝나면 카드를 감춘다. 알림은 3단계라 아직 항목에 넣지 않는다.
  if (installed && calendarConnected) return null;

  const copy = installed ? null : INSTALL_COPY[state];

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">설정 상태</h2>

      <ul className="mt-3 flex flex-col gap-2 text-sm">
        <Row done={installed} label={installed ? "홈 화면에 추가됨" : "홈 화면에 추가 안 됨"}>
          {!installed && (
            <button
              type="button"
              onClick={async () => {
                if (deferred) {
                  await deferred.prompt();
                  setDeferred(null);
                  return;
                }
                setOpen((v) => !v);
              }}
              className="rounded-md border border-line px-2 py-1 text-xs"
            >
              하기
            </button>
          )}
        </Row>

        <Row
          done={calendarConnected}
          label={calendarConnected ? "캘린더 앱 연결됨" : "캘린더 앱 연결 안 됨"}
        />

        <Row done={false} label="알림 — 3단계에서 붙습니다" muted />
      </ul>

      {open && copy && (
        <div className="mt-4 rounded-lg bg-paper p-4">
          <p className="font-medium">{copy.title}</p>
          <p className="mt-1 text-sm leading-6 text-ash">{copy.body}</p>

          {copy.steps && (
            <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-sm leading-6 text-ash">
              {copy.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}

          {state === "ios-other" && (
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(window.location.origin)}
              className="mt-3 rounded-lg border border-line px-3 py-2 text-sm"
            >
              주소 복사하기
            </button>
          )}
        </div>
      )}

      {!installed && (
        <p className="mt-3 text-xs leading-5 text-ash">
          홈 화면에 추가하지 않아도 앱은 그대로 써요. 다만 아이폰은 추가해야만
          알림을 받을 수 있어요.
        </p>
      )}
    </section>
  );
}

function Row({
  done,
  label,
  muted,
  children,
}: {
  done: boolean;
  label: string;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className={`flex items-center justify-between ${muted ? "text-ash" : ""}`}>
      <span className="flex items-center gap-2">
        <span className={done ? "text-ok" : "text-ash"}>{done ? "✓" : "○"}</span>
        {label}
      </span>
      {children}
    </li>
  );
}
