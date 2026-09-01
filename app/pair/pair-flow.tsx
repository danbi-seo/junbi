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
}: {
  hasProfile: boolean;
  pending: PendingState;
  initialCode: string | null;
}) {
  if (!hasProfile) return <ProfileStep initialCode={initialCode} />;
  if (pending) return <PendingStep state={pending} />;
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
        이름과 생일은 <b>서로 확인할 때만</b> 써요. 달력이나 알림에는 애칭만
        나와요.
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
  const [mode, setMode] = useState<"pick" | "invite" | "enter">(
    initialCode ? "enter" : "pick",
  );
  const [code, setCode] = useState(initialCode ?? "");
  const [issued, setIssued] = useState<string | null>(null);
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
              setIssued(res.data!.code);
              setMode("invite");
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

  if (mode === "invite" && issued) {
    const link = `${window.location.origin}/j/${issued}`;
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-xl">초대를 보내세요</h1>

        <div className="rounded-xl border border-line bg-card p-5 text-center">
          <p className="font-display text-3xl tracking-[0.3em]">{issued}</p>
          <p className="mt-2 text-xs text-ash">24시간 동안 쓸 수 있어요</p>
        </div>

        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(link)}
          className={primary}
        >
          링크 복사하기
        </button>
        <p className="text-xs break-all text-ash">{link}</p>

        <p className="text-sm leading-6 text-ash">
          상대가 링크를 열고 확인하면, 마지막에 <b>내가 한 번 더</b> 확정해요.
          링크가 다른 사람에게 가더라도 연결되지 않아요.
        </p>

        <button
          type="button"
          onClick={() => {
            setIssued(null);
            setMode("pick");
            router.refresh();
          }}
          className="text-sm text-ash underline underline-offset-4"
        >
          돌아가기
        </button>
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
function PendingStep({ state }: { state: NonNullable<PendingState> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startedOn, setStartedOn] = useState("");

  const drop = () =>
    start(async () => {
      await cancelPair();
      router.refresh();
    });

  // 초대한 쪽인데 상대가 아직 안 왔다
  if (state.waiting) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-xl">기다리는 중</h1>
        <p className="text-sm leading-6 text-ash">
          상대가 링크를 열고 확인하면 여기서 알려드려요.
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className={primary}
        >
          새로고침
        </button>
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
        <button
          type="button"
          onClick={() => router.refresh()}
          className={primary}
        >
          새로고침
        </button>
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
