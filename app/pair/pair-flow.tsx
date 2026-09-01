"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptInvite,
  cancelPair,
  confirmPair,
  createInvite,
  createMyProfile,
  previewInvite,
  type InvitePreview,
  type PendingState,
} from "@/app/actions/pairing";
import { OWNER_EMOJI } from "@/lib/emoji";

/**
 * 페어링 — docs/08-auth-pairing.md 2
 *
 * 3단계 확인. 링크가 새어도 마지막에 막을 수 있게 한다 → 설계 원칙 9
 *
 *   1  A가 초대를 만든다
 *   2  B가 A의 이름·생일을 보고 확인한다
 *   3  A가 B를 보고 확정한다      ← 여기서 비로소 연결
 *
 * 2단계에서 수락해도 데이터는 안 열린다. 확정 전까지 모든 조회가 0건이다.
 */

const field =
  "w-full rounded-lg border border-line bg-card px-4 py-3 outline-none " +
  "focus:border-slot-a focus:ring-2 focus:ring-slot-a/20";
const primary =
  "w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white " +
  "disabled:cursor-not-allowed disabled:opacity-40";

export function PairFlow({
  hasProfile,
  pending,
  initialCode,
  inviteCode,
  origin,
}: {
  hasProfile: boolean;
  pending: PendingState;
  initialCode: string | null;
  /** 살아 있는 내 초대 코드. 서버에서 읽어 온다. */
  inviteCode: string | null;
  /** 초대 링크에 쓸 주소. 서버가 준다. */
  origin: string;
}) {
  if (!hasProfile) return <ProfileStep initialCode={initialCode} />;
  if (pending)
    return <PendingStep state={pending} inviteCode={inviteCode} origin={origin} />;
  return <InviteStep initialCode={initialCode} />;
}

/* ── 1. 내 정보 ─────────────────────────────────────────────────
 *
 * 이름과 생일을 받는 실질적 이유는 **페어링 확인 화면** 하나다.
 * 이름만으로는 동명이인이 헷갈리고, 생일이 붙으면 확실해진다.
 * 그래서 여기 말고는 어디에도 실명이 안 나온다.
 */
function ProfileStep({ initialCode }: { initialCode: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [emoji, setEmoji] = useState("🐰");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        form.set("emoji", emoji);
        // 브라우저가 아는 걸 또 묻지 않는다
        form.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
        start(async () => {
          setError(null);
          const res = await createMyProfile(form);
          if (!res.ok) return setError(res.message);
          router.replace(initialCode ? `/pair?code=${initialCode}` : "/pair");
          router.refresh();
        });
      }}
      className="flex flex-col gap-4"
    >
      <h1 className="font-display text-xl">내 정보</h1>
      <p className="text-sm leading-6 text-ash">
        이름과 생일은 <b>서로 확인할 때만</b> 써요.
        <br />
        달력이나 알림에는 애칭만 나와요.
      </p>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-ash">이름</span>
        <input name="name" required maxLength={20} className={field} />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-ash">생년월일</span>
        <input name="birth" type="date" required className={field} />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="lunar" className="size-4" />
        음력이에요
      </label>

      <div>
        <p className="mb-2 text-sm text-ash">나를 나타낼 이모지</p>
        <div className="flex flex-wrap gap-2">
          {OWNER_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={`rounded-lg border px-3 py-2 text-xl ${
                emoji === e ? "border-slot-a bg-slot-a-bg" : "border-line"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button type="submit" disabled={pending} className={primary}>
        {pending ? "저장 중…" : "다음"}
      </button>
    </form>
  );
}

/* ── 2. 초대 만들기 · 코드 넣기 ─────────────────────────────── */
function InviteStep({ initialCode }: { initialCode: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"pick" | "enter">(
    initialCode ? "enter" : "pick",
  );
  const [code, setCode] = useState(initialCode ?? "");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 링크로 들어왔으면 바로 상대를 보여준다. 코드를 손으로 칠 일이 없다.
  useEffect(() => {
    if (!initialCode) return;
    start(async () => {
      const res = await previewInvite(initialCode);
      if (!res.ok) return setError(res.message);
      setPreview(res.data!);
    });
  }, [initialCode]);

  if (preview) {
    return (
      <ConfirmPerson
        person={preview}
        title="초대를 받았어요"
        question="이 사람이 맞나요?"
        yes="네, 맞아요"
        pending={pending}
        onYes={() =>
          start(async () => {
            setError(null);
            const res = await acceptInvite(code);
            if (!res.ok) return setError(res.message);
            router.refresh();
          })
        }
        onNo={() => {
          setPreview(null);
          setCode("");
          setMode("pick");
        }}
        error={error}
      />
    );
  }

  if (mode === "pick") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-xl">상대와 연결하기</h1>
        <p className="text-sm leading-6 text-ash">
          한 사람이 초대를 만들고, 다른 사람이 그 링크를 열면 돼요.
        </p>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await createInvite();
              if (!res.ok) return setError(res.message);
              // 코드는 서버가 다시 그리면서 대기 화면에 실어 준다.
              // 클라이언트에 들고 있으면 새로고침 한 번에 사라진다.
              router.refresh();
            })
          }
          className={primary}
        >
          {pending ? "만드는 중…" : "초대 만들기"}
        </button>

        <button
          type="button"
          onClick={() => setMode("enter")}
          className="text-sm text-ash underline underline-offset-4"
        >
          받은 코드 넣기
        </button>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }


  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await previewInvite(code);
          if (!res.ok) return setError(res.message);
          setPreview(res.data!);
        });
      }}
      className="flex flex-col gap-4"
    >
      <h1 className="font-display text-xl">받은 코드 넣기</h1>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={6}
        autoCapitalize="characters"
        placeholder="ABCDEF"
        className={`${field} text-center font-display text-2xl tracking-[0.3em]`}
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={pending || code.length < 6}
        className={primary}
      >
        {pending ? "확인 중…" : "확인"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode("pick");
          setError(null);
        }}
        className="text-sm text-ash underline underline-offset-4"
      >
        돌아가기
      </button>
    </form>
  );
}

/* ── 3. 확정 대기 · 확정 ────────────────────────────────────── */
function PendingStep({
  state,
  inviteCode,
  origin,
}: {
  state: NonNullable<PendingState>;
  inviteCode: string | null;
  origin: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startedOn, setStartedOn] = useState("");

  const drop = () =>
    start(async () => {
      await cancelPair();
      router.refresh();
    });

  // 상대가 확인했는지 알아서 본다.
  //
  // 버튼을 두면 "이걸 왜 눌러야 하지"가 된다. 상대가 링크를 여는 건
  // 보통 몇 분 안이라 그동안만 몇 초에 한 번 물어보면 된다.
  //
  // Realtime을 쓰지 않는 이유: couples·profiles는 publication에 없고,
  // 이 짧은 순간을 위해 넣으면 페어링 정보가 실시간 채널로 흐른다.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [router]);

  // 초대한 쪽인데 상대가 아직 안 왔다
  // 초대한 쪽인데 상대가 아직 안 왔다.
  //
  // 여기서 코드를 계속 보여준다. 예전에는 코드 화면과 이 화면이 따로였는데,
  // 초대를 만들면 서버가 다시 그리면서 이 화면으로 갈아치워져 코드가
  // 1초 만에 사라졌다. 새로고침해도 마찬가지였다.
  // 두 화면을 합치면 코드가 어디서 그려지든 남아 있다.
  if (state.waiting) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-xl">초대를 보내세요</h1>

        {inviteCode ? (
          <ShareInvite code={inviteCode} origin={origin} />
        ) : (
          <p className="text-sm text-ash">
            코드가 만료됐어요. 취소하고 다시 만들어 주세요.
          </p>
        )}

        <p className="text-sm leading-6 text-ash">
          상대가 링크를 열고 확인하면, 마지막에 <b>내가 한 번 더</b> 확정해요.
          링크가 다른 사람에게 가더라도 연결되지 않아요.
        </p>

        <p className="text-sm text-ash">
          상대가 확인하면 이 화면이 알아서 바뀌어요.
        </p>

        <button
          type="button"
          disabled={pending}
          onClick={drop}
          className="text-sm text-ash underline underline-offset-4"
        >
          초대 취소하기
        </button>
      </div>
    );
  }

  // 수락한 쪽 — A의 확정을 기다린다
  if (state.mySlot === "b") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-xl">확인했어요</h1>
        <p className="text-sm leading-6 text-ash">
          {state.partner?.name}님이 마지막으로 확정하면 연결돼요.
          <br />
          그때까지는 서로의 일정이 보이지 않아요.
        </p>

        <p className="text-sm text-ash">
          확정하면 이 화면이 알아서 바뀌어요.
        </p>

        <button
          type="button"
          disabled={pending}
          onClick={drop}
          className="text-sm text-ash underline underline-offset-4"
        >
          그만두기
        </button>
      </div>
    );
  }

  // 초대한 쪽 — 마지막 확정
  return (
    <div className="flex flex-col gap-4">
      <ConfirmPerson
        person={state.partner!}
        title="연결 요청이 왔어요"
        question="이 사람이 맞나요?"
        yes="연결하기"
        pending={pending}
        onYes={() =>
          start(async () => {
            setError(null);
            const res = await confirmPair(startedOn || null);
            if (!res.ok) return setError(res.message);
            router.replace("/pair/welcome");
            router.refresh();
          })
        }
        onNo={drop}
        error={error}
        extra={
          <label className="flex flex-col gap-2">
            <span className="text-sm text-ash">언제부터 만났어요? (선택)</span>
            <input
              type="date"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
              className={field}
            />
            <span className="text-xs text-ash">
              D-day를 자동으로 만들어요. 나중에 정해도 돼요.
            </span>
          </label>
        }
      />
    </div>
  );
}

/* ── 사람 확인 카드 ─────────────────────────────────────────── */
function ConfirmPerson({
  person,
  title,
  question,
  yes,
  pending,
  onYes,
  onNo,
  error,
  extra,
}: {
  person: InvitePreview;
  title: string;
  question: string;
  yes: string;
  pending: boolean;
  onYes: () => void;
  onNo: () => void;
  error: string | null;
  extra?: React.ReactNode;
}) {
  const birth = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(person.birthDate + "T00:00:00Z"));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl">{title}</h1>

      <div className="rounded-xl border border-line bg-card p-6 text-center">
        <p className="text-4xl">{person.emoji}</p>
        <p className="mt-3 text-lg">{person.name}</p>
        <p className="mt-1 text-sm text-ash">
          {person.birthIsLunar && "음력 "}
          {birth}
        </p>
      </div>

      {extra}

      <p className="text-sm">{question}</p>
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={onYes}
          className={primary}
        >
          {pending ? "처리 중…" : yes}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onNo}
          className="rounded-lg border border-line px-4 py-3 text-sm"
        >
          아니에요
        </button>
      </div>
    </div>
  );
}

/* ── 초대 코드 · 보내기 ─────────────────────────────────────────
 *
 * 코드를 클라이언트 상태에 들고 있지 않는다. 서버가 매번 실어 준다.
 * 그래야 새로고침하거나 화면이 다시 그려져도 코드가 남는다.
 */
function ShareInvite({ code, origin }: { code: string; origin: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = `${origin}/j/${code}`;

  return (
    <>
      <div className="rounded-xl border border-line bg-card p-5 text-center">
        <p className="font-display text-3xl tracking-[0.3em]">{code}</p>
        <p className="mt-2 text-xs text-ash">24시간 동안 쓸 수 있어요</p>
      </div>

      {/*
       * 공유 시트가 있으면 그쪽을 먼저 쓴다. 폰에서는 카카오톡이 목록에
       * 바로 떠서 '복사 → 카톡 열기 → 붙여넣기'가 한 번이 된다.
       *
       * 없으면(PC 등) 복사로 떨어진다. 그때는 눌렸는지 보여줘야 한다 —
       * 아무 반응이 없으면 계속 누르게 된다.
       */}
      <button
        type="button"
        onClick={async () => {
          setCopied(false);
          setError(null);
          const nav = navigator as Navigator & {
            share?: (d: ShareData) => Promise<void>;
          };
          if (nav.share) {
            try {
              await nav.share({
                title: "JUNBI 초대",
                text: `JUNBI에서 같이 써요\n${link}`,
                url: link,
              });
            } catch {
              // 공유 시트를 닫은 경우. 복사로 떨어지지 않는다.
            }
            return;
          }
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          } catch {
            setError("복사하지 못했어요. 아래 주소를 직접 복사해 주세요.");
          }
        }}
        className={primary}
      >
        {copied ? "복사했어요" : "링크 보내기"}
      </button>

      {copied && (
        <p className="text-sm text-ok">
          복사했어요. 카카오톡에 붙여넣어 보내세요.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {/* 링크가 안 열리거나 PC로 받은 경우를 위해 주소도 보여준다 */}
      <p className="text-xs break-all text-ash">{link}</p>
    </>
  );
}
