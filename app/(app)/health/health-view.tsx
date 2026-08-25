"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ackOngoing,
  deletePeriod,
  exportHealth,
  logPeriodEnd,
  logPeriodStart,
  saveCondition,
  setHealthSharing,
} from "@/app/actions/health";
import {
  CYCLE_COPY,
  ENERGY,
  FLOW_LABEL,
  PAIN_AREAS,
  PAIN_LABEL,
  SYMPTOMS,
  buildMarks,
  delayMessage,
  expand,
  isoDay,
  varianceLabel,
  type DayMark,
  type MyHealth,
} from "@/lib/health";

export function HealthView({
  initial,
  partnerLabel,
  timeZone,
}: {
  initial: MyHealth;
  partnerLabel: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [h, setH] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.message ?? "처리하지 못했어요");
      router.refresh();
    });

  const share = (patch: Parameters<typeof setHealthSharing>[0]) =>
    start(async () => {
      setError(null);
      const res = await setHealthSharing(patch);
      if (!res.ok) return setError(res.message);
      if (res.data) setH(res.data);
      router.refresh();
    });

  // 동의 전 · 모듈 끄기 전에는 아무것도 보여주지 않는다.
  // 동의를 거부해도 나머지 기능이 전부 동작해야 한다 → docs/19-health.md I
  if (!h.consentedAt) {
    return <Consent onAgree={() => share({ consent: true })} pending={pending} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <ConditionCard health={h} onSave={(v) => run(() => saveCondition(v))} pending={pending} />

      {h.cycleModuleOn ? (
        <CycleCard
          health={h}
          timeZone={timeZone}
          pending={pending}
          onStart={(d) => run(() => logPeriodStart(d))}
          onEnd={(d) => run(() => logPeriodEnd(d))}
          onAck={(id) => run(() => ackOngoing(id))}
          onDelete={(id) => run(() => deletePeriod(id))}
        />
      ) : (
        <section className="rounded-xl border border-line bg-card p-5">
          <h2 className="font-display text-lg">생리 주기를 기록할까요?</h2>
          <p className="mt-2 text-sm leading-6 text-ash">
            기록하면 다음 예정일을 예상해 달력에 표시해요.
            <br />
            상대에게 보여줄지는 나중에 따로 정할 수 있어요. 기본은 공유하지
            않아요.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => share({ module: true })}
            className="mt-4 rounded-lg bg-slot-a px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            네, 기록할게요
          </button>
        </section>
      )}

      <SharingCard
        health={h}
        partnerLabel={partnerLabel}
        pending={pending}
        onChange={share}
      />

      <ExportCard />
    </div>
  );
}

/* ── 별도 동의 ──────────────────────────────────────────────────
 *
 * 건강 정보는 민감정보다. 일반 약관과 분리된 화면에서 따로 받는다.
 * 선택 동의를 필수처럼 받으면 위반이다 — 마지막 문단이 법적으로 중요하다.
 */
function Consent({ onAgree, pending }: { onAgree: () => void; pending: boolean }) {
  const [checked, setChecked] = useState(false);

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">건강 정보 수집 동의 (선택)</h2>
      <p className="mt-3 text-sm leading-6">
        컨디션과 생리 주기 기록을 위해 건강 정보를 수집합니다.
      </p>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm leading-6 text-ash">
        <li>
          · 수집 항목: 기운 정도, 통증 부위, 생리 시작·종료일, 생리량, 통증,
          증상, 메모
        </li>
        <li>· 보유 기간: 기능 해제 또는 탈퇴 시 즉시 파기</li>
        <li>· 상대에게는 내가 켠 항목만 전달</li>
      </ul>
      <p className="mt-3 text-sm leading-6">
        동의하지 않아도 나머지 기능을 모두 쓸 수 있어요.
      </p>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="size-4"
        />
        동의합니다
      </label>

      <button
        type="button"
        disabled={!checked || pending}
        onClick={onAgree}
        className="mt-4 w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
      >
        {pending ? "저장 중…" : "시작하기"}
      </button>
    </section>
  );
}

/* ── 오늘 컨디션 ────────────────────────────────────────────────
 *
 * 주기 모듈이 켜지면 같은 화면에 항목이 늘어날 뿐이다.
 * 별도 화면을 만들면 하루에 두 군데를 기록하게 되고 둘 다 안 쓴다.
 */
function ConditionCard({
  health,
  onSave,
  pending,
}: {
  health: MyHealth;
  onSave: (v: {
    energy: number | null;
    painAreas: string[];
    memo: string | null;
    flow: number | null;
    pain: number | null;
    symptoms: string[];
  }) => void;
  pending: boolean;
}) {
  const t = health.today;
  const [energy, setEnergy] = useState<number | null>(t?.energy ?? null);
  const [areas, setAreas] = useState<string[]>(t?.painAreas ?? []);
  const [memo, setMemo] = useState(t?.memo ?? "");
  const [flow, setFlow] = useState<number | null>(t?.flow ?? null);
  const [pain, setPain] = useState<number | null>(t?.pain ?? null);
  const [symptoms, setSymptoms] = useState<string[]>(t?.symptoms ?? []);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // 오늘이 기록된 생리 기간 안이면 주기 항목이 뜬다
  const inPeriod = health.cycleModuleOn && Boolean(health.openPeriodStart);

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">오늘</h2>

      <p className="mt-4 mb-2 text-sm text-ash">기운</p>
      <div className="flex gap-2">
        {ENERGY.map((e) => (
          <button
            key={e.value}
            type="button"
            aria-label={e.label}
            aria-pressed={energy === e.value}
            onClick={() => setEnergy(energy === e.value ? null : e.value)}
            className={`flex-1 rounded-lg border py-2.5 text-xl ${
              energy === e.value ? "border-slot-a bg-slot-a-bg" : "border-line"
            }`}
          >
            {e.emoji}
          </button>
        ))}
      </div>

      <p className="mt-4 mb-2 text-sm text-ash">아픈 곳</p>
      <div className="flex flex-wrap gap-2">
        {PAIN_AREAS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => toggle(areas, setAreas, p)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              areas.includes(p) ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAreas([])}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            areas.length === 0 ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
          }`}
        >
          없음
        </button>
      </div>

      {inPeriod && (
        <>
          <div className="mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs text-ash">주기 기록</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <p className="mt-4 mb-2 text-sm text-ash">생리량</p>
          <div className="flex gap-2">
            {[1, 2, 3].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFlow(flow === v ? null : v)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  flow === v ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
                }`}
              >
                {FLOW_LABEL[v]}
              </button>
            ))}
          </div>

          <p className="mt-4 mb-2 text-sm text-ash">통증</p>
          <div className="flex gap-2">
            {[0, 1, 2].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPain(pain === v ? null : v)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  pain === v ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
                }`}
              >
                {PAIN_LABEL[v]}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {SYMPTOMS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggle(symptoms, setSymptoms, s)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  symptoms.includes(s)
                    ? "border-slot-a bg-slot-a-bg"
                    : "border-line text-ash"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="메모 (선택)"
        maxLength={300}
        rows={2}
        className="mt-4 w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-slot-a"
      />

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          onSave({
            energy,
            painAreas: areas,
            memo: memo.trim() || null,
            flow: inPeriod ? flow : null,
            pain: inPeriod ? pain : null,
            symptoms: inPeriod ? symptoms : [],
          })
        }
        className="mt-4 w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
      >
        {pending ? "저장 중…" : "저장"}
      </button>

      <p className="mt-3 text-xs leading-5 text-ash">
        메모는 상대에게 보이지 않아요. 공유를 켜도 기운과 아픈 곳만 전해져요.
      </p>
    </section>
  );
}

/* ── 주기 ───────────────────────────────────────────────────────*/
function CycleCard({
  health,
  timeZone,
  pending,
  onStart,
  onEnd,
  onAck,
  onDelete,
}: {
  health: MyHealth;
  timeZone: string;
  pending: boolean;
  onStart: (date?: string) => void;
  onEnd: (date?: string) => void;
  onAck: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [showBasis, setShowBasis] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const dur = health.periodDuration ?? 5;
  const marks = useMemo(
    () => buildMarks(health.periods, health.prediction, dur),
    [health.periods, health.prediction, dur],
  );

  /**
   * 시작·끝을 달력에서 바로 읽히게 한다.
   *
   * 구간을 한 가지 색으로만 칠하면 어디서 시작해 어디서 끝났는지 안 보인다.
   * 날짜를 잘못 눌렀을 때 그걸 알아채는 게 이 화면의 핵심이다.
   *
   * 끝을 안 눌렀으면 마지막 날은 추정이라 '끝'으로 표시하지 않는다.
   * 추정을 확정처럼 적으면 고칠 이유를 못 느낀다.
   */
  const edges = useMemo(() => {
    const m = new Map<string, CellEdge>();
    for (const p of health.periods ?? []) {
      const span = expand(p.from, p.to, dur);
      const last = span[span.length - 1];
      if (p.to && p.from === last) {
        m.set(p.from, "only");
      } else {
        m.set(p.from, "start");
        if (p.to) m.set(last, "end");
      }
    }
    return m;
  }, [health.periods, dur]);

  const base = new Date();
  const month = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1),
  );
  const first = month.getUTCDay();
  const days = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const today = isoDay(new Date());
  const pred = health.prediction;

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone,
      month: "long",
      day: "numeric",
    }).format(new Date(iso + "T00:00:00Z"));

  /** 그 날짜를 품고 있는 기록. 종료를 안 눌렀으면 평균 5일로 본다. */
  const owningPeriod = (iso: string) =>
    (health.periods ?? []).find((p) => expand(p.from, p.to, dur).includes(iso)) ?? null;

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      {/* 지연 감지 — 본인에게만. 푸시로 보내지 않고 배너로만. */}
      {health.delayDays != null && (
        <div className="mb-4 rounded-lg border border-line bg-paper p-4">
          <p className="text-sm font-medium">{delayMessage(health.delayDays).title}</p>
          <p className="mt-1 text-xs leading-5 text-ash">
            {delayMessage(health.delayDays).body}
          </p>
        </div>
      )}

      {/* 종료를 안 눌러도 동작한다. 다만 7일이 지나면 한 번만 묻는다. */}
      {health.askIfOngoing && health.openPeriodId && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-line bg-paper p-4">
          <p className="flex-1 text-sm">아직 진행 중인가요?</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => onEnd()}
            className="rounded-lg border border-line px-3 py-1.5 text-sm"
          >
            끝났어요
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onAck(health.openPeriodId!)}
            className="text-sm text-ash underline underline-offset-4"
          >
            진행 중
          </button>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffset((o) => o - 1)}
          className="px-2 py-1 text-ash"
          aria-label="이전 달"
        >
          ‹
        </button>
        <h2 className="font-display">
          {month.getUTCFullYear()}년 {month.getUTCMonth() + 1}월
        </h2>
        <button
          type="button"
          onClick={() => setOffset((o) => o + 1)}
          className="px-2 py-1 text-ash"
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-ash">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const iso = isoDay(
            new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i + 1)),
          );
          return (
            <Cell
              key={iso}
              day={i + 1}
              mark={marks.get(iso) ?? null}
              edge={edges.get(iso) ?? null}
              isToday={iso === today}
              // 앞으로의 날짜는 기록할 수 없다. 서버도 막지만 눌리지 않게 한다.
              disabled={iso > today}
              selected={iso === picked}
              onClick={() => setPicked(iso === picked ? null : iso)}
            />
          );
        })}
      </div>

      {/* 과거 날짜 소급 입력. 시작일을 놓치는 일이 잦은데,
          잘못된 기록 하나가 평균을 통째로 망가뜨린다 → docs/19-health.md D */}
      {picked && (
        <DaySheet
          iso={picked}
          label={fmt(picked)}
          owning={owningPeriod(picked)}
          hasOpen={Boolean(health.openPeriodStart)}
          pending={pending}
          onStart={() => {
            onStart(picked);
            setPicked(null);
          }}
          onEnd={() => {
            onEnd(picked);
            setPicked(null);
          }}
          onDelete={(id) => {
            onDelete(id);
            setPicked(null);
          }}
          onClose={() => setPicked(null)}
        />
      )}

      {/* 달력에 뜨는 건 두 가지다. 생리 주기 안에서만 기록과 예상을 나눈다 —
          추정치가 확정된 기록처럼 보이면 과신한다.
          범례는 바로 아래 상시 노출. 상세 화면에만 넣으면 안 본다. */}
      <div className="mt-4 flex flex-col gap-2 text-xs text-ash">
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0">{CYCLE_COPY.cycle}</span>
          <Legend mark="recorded" text={CYCLE_COPY.recorded} />
          <Legend mark="predicted" text={CYCLE_COPY.predicted} />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0">{CYCLE_COPY.fertile}</span>
          <Legend mark="fertile" text="" />
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-ash">{CYCLE_COPY.disclaimer}</p>

      {/*
       * 이미 오늘로 기록된 것을 또 누르면 안 된다.
       * 시작을 다시 누르면 3일 규칙에 걸려 시작일이 조용히 옮겨지고,
       * 끝을 다시 누르면 같은 날로 덮어써진다. 둘 다 눌린 티가 안 난다.
       */}
      <button
        type="button"
        disabled={pending || edges.get(today) != null}
        onClick={() => (health.openPeriodStart ? onEnd() : onStart())}
        className="mt-4 w-full rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
      >
        {pending
          ? "저장 중…"
          : edges.get(today) === "end" || edges.get(today) === "only"
            ? "오늘 끝으로 기록됨"
            : edges.get(today) === "start"
              ? "오늘 시작으로 기록됨"
              : health.openPeriodStart
                ? "오늘 끝났어요"
                : "오늘 시작했어요"}
      </button>

      {/* 왜 이 날짜가 나왔는지 궁금해한다.
          숫자를 숨기고 날짜만 던지면 과신하거나 불신하거나 둘 중 하나다. */}
      {pred?.status === "ok" ? (
        <>
          <button
            type="button"
            onClick={() => setShowBasis((v) => !v)}
            className="mt-4 text-sm text-ash underline underline-offset-4"
          >
            예측 근거 {showBasis ? "접기" : "보기"}
          </button>
          {showBasis && (
            <dl className="mt-3 flex flex-col gap-2 rounded-lg bg-paper p-4 text-sm">
              <Row k="평균 주기" v={`${pred.cycleLength}일`} />
              <Row k="최근 기록" v={pred.recentGaps.join(" · ")} />
              <Row
                k="편차"
                v={`${pred.variance}일   ${varianceLabel(pred.variance)}`}
              />
              <Row k="다음 예상" v={`${fmt(pred.nextFrom)} ~ ${fmt(pred.nextTo)}`} />
            </dl>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-ash">
          {pred?.status === "irregular"
            ? CYCLE_COPY.irregular
            : CYCLE_COPY.insufficient}
        </p>
      )}

      {/* 잘못된 기록 하나가 평균을 망가뜨리는데, 고치기 어려우면 앱을 안 쓴다 */}
      {(health.periods?.length ?? 0) > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-ash">
            기록 {health.periods!.length}건 고치기
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {health.periods!.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <span>
                  {fmt(p.from)}
                  {p.to ? ` ~ ${fmt(p.to)}` : " ~ 진행 중"}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm("이 기록을 지울까요?")) return;
                    onDelete(p.id);
                  }}
                  className="ml-auto text-xs text-ash underline underline-offset-4"
                >
                  지우기
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// 색으로만 구분하지 않는다. 기호를 함께 쓴다 → 설계 원칙 4
const MARK_STYLE: Record<Exclude<DayMark, null>, string> = {
  // 꽉 찬 색은 '기록'만 쓴다. 실제로 있었던 일이라 확정적으로 읽혀도 된다.
  recorded: "bg-slot-a text-white",
  predicted: "bg-slot-a/35",
  // 임신 가능성 구간은 분홍. 무채색은 눈에 안 들어와 표시한 의미가 없었다.
  //
  // 다만 채우기는 옅게 두고 글자·테두리로 존재감을 낸다.
  // 기록과 같은 무게로 칠하면 추정치가 확정처럼 읽힌다.
  // 빨강(--danger)을 안 쓰는 이유는 삭제·오류와 같은 색이 되기 때문이다.
  fertile: "bg-fertile-bg text-fertile ring-1 ring-inset ring-fertile/40",
};
/** 기록 구간의 양 끝. only는 하루짜리 기록. */
type CellEdge = "start" | "end" | "only";

const EDGE_LABEL: Record<CellEdge, string> = {
  start: "시작",
  end: "끝",
  only: "하루",
};

const MARK_GLYPH: Record<Exclude<DayMark, null>, string> = {
  recorded: "●",
  predicted: "░",
  fertile: "▒",
};

function Cell({
  day,
  mark,
  edge,
  isToday,
  disabled,
  selected,
  onClick,
}: {
  day: number;
  mark: DayMark;
  edge: CellEdge | null;
  isToday: boolean;
  disabled: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      // 선택·오늘 표시는 outline으로 낸다.
      // ring을 쓰면 임신 가능성 칸의 ring과 같은 속성을 다투게 된다.
      className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm outline-offset-1 disabled:opacity-30 ${
        mark ? MARK_STYLE[mark] : ""
      } ${
        selected
          ? "outline-2 outline-slot-a"
          : isToday
            ? "outline-1 outline-ink"
            : ""
      }`}
    >
      <span>{day}</span>
      {/* 색으로만 구분하지 않는다. 양 끝은 글자로 적는다 → 설계 원칙 4 */}
      <span className={`text-[9px] leading-none ${edge ? "font-medium" : ""}`}>
        {edge ? EDGE_LABEL[edge] : mark ? MARK_GLYPH[mark] : " "}
      </span>
    </button>
  );
}

/**
 * 날짜를 눌렀을 때 뜨는 시트.
 *
 * 시작일을 놓치는 일이 잦고, 잘못된 기록 하나가 평균을 통째로 망가뜨린다.
 * 고치기 어려우면 그냥 앱을 안 쓴다 → docs/19-health.md D
 */
function DaySheet({
  iso,
  label,
  owning,
  hasOpen,
  pending,
  onStart,
  onEnd,
  onDelete,
  onClose,
}: {
  iso: string;
  label: string;
  owning: { id: string; from: string; to: string | null } | null;
  hasOpen: boolean;
  pending: boolean;
  onStart: () => void;
  onEnd: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  // 이미 그날로 기록된 것은 다시 누를 수 없다.
  //
  // 시작을 다시 누르면 3일 규칙에 걸려 시작일이 조용히 옮겨지고,
  // 끝을 다시 누르면 같은 날로 덮어써진다. 둘 다 아무 일도 안 일어난 것처럼
  // 보이는데 실제로는 기록이 바뀐다. 그게 제일 나쁘다.
  const isStart = owning?.from === iso;
  const isEnd = owning?.to === iso;

  return (
    <div className="mt-4 rounded-lg border border-line bg-paper p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium">
          {label}
          {isStart && <span className="ml-2 text-sm text-slot-a">시작</span>}
          {isEnd && <span className="ml-2 text-sm text-slot-a">끝</span>}
        </p>
        <button type="button" onClick={onClose} aria-label="닫기" className="px-2 text-ash">
          ✕
        </button>
      </div>

      {owning && !isStart && !isEnd && (
        <p className="mt-1 text-xs text-ash">
          {owning.to ? "기록된 기간 안이에요" : "진행 중인 기록이에요"}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || isStart}
          onClick={onStart}
          className="rounded-lg border border-line bg-card px-3 py-2 text-sm disabled:opacity-40"
        >
          {isStart ? "시작으로 기록됨" : "이날 시작했어요"}
        </button>

        {/* 끝난 날은 시작한 기록이 있어야 의미가 있다 */}
        {(hasOpen || owning) && (
          <button
            type="button"
            disabled={pending || isEnd}
            onClick={onEnd}
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm disabled:opacity-40"
          >
            {isEnd ? "끝으로 기록됨" : "이날 끝났어요"}
          </button>
        )}

        {owning && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm("이 기록을 지울까요?")) return;
              onDelete(owning.id);
            }}
            className="rounded-lg border border-line px-3 py-2 text-sm text-danger disabled:opacity-40"
          >
            기록 지우기
          </button>
        )}
      </div>

      <p className="mt-3 text-xs leading-5 text-ash">
        지난 날짜를 눌러 소급 입력할 수 있어요. 앞으로의 날짜는 기록할 수 없어요.
      </p>
    </div>
  );
}

function Legend({ mark, text }: { mark: Exclude<DayMark, null>; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block size-3 rounded ${MARK_STYLE[mark]}`} />
      {text}
    </span>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ash">{k}</dt>
      <dd className="tnum text-right">{v}</dd>
    </div>
  );
}

/* ── 공유 ───────────────────────────────────────────────────────
 *
 * 무엇이 보이는지 미리 다 적는다. 켜기 전에 알아야 켤지 말지 판단한다.
 * '공유해달라고 요청하기' 버튼은 만들지 않는다 — 압박 도구가 된다.
 */
function SharingCard({
  health,
  partnerLabel,
  pending,
  onChange,
}: {
  health: MyHealth;
  partnerLabel: string;
  pending: boolean;
  onChange: (patch: Parameters<typeof setHealthSharing>[0]) => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">{partnerLabel}님에게 공유</h2>

      <div className="mt-4 flex flex-col gap-3">
        <Switch
          label="컨디션 (기운, 아픈 곳)"
          on={Boolean(health.shareCondition)}
          disabled={pending}
          onToggle={(v) => onChange({ condition: v })}
        />
        {health.cycleModuleOn && (
          <Switch
            label="생리 주기"
            on={Boolean(health.shareCycle)}
            disabled={pending}
            onToggle={(v) => onChange({ cycle: v })}
          />
        )}
      </div>

      {health.cycleModuleOn && (
        <div className="mt-4 rounded-lg bg-paper p-4 text-xs leading-6 text-ash">
          주기를 공유하면 {partnerLabel}님에게 이것만 보여요.
          <br />· 생리 시작일과 끝난 날
          <br />· 임신 가능성이 높은 기간
          <br />
          <br />
          증상, 통증, 메모, 예측 근거는 보이지 않아요.
          <br />
          언제든 끌 수 있어요. 끄면 바로 사라지고, 알림도 가지 않아요.
        </div>
      )}

      {health.cycleModuleOn && (
        <>
          <div className="mt-4 border-t border-line pt-4">
            <Switch
              label="Let's Meet에서 생리 예상 기간 피하기"
              on={Boolean(health.avoidInFreeSlots)}
              disabled={pending}
              onToggle={(v) => onChange({ avoid: v })}
            />
            <p className="mt-2 text-xs leading-5 text-ash">
              예상 기간의 추천 순위를 낮춰요. 아예 빼지는 않아요. 이유는 내
              화면에만 보이고, {partnerLabel}님 화면에는 순위가 조금 낮은
              후보로만 보여요.
            </p>
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  "주기 기록을 끄면 지금까지의 기록이 즉시 삭제돼요. 되돌릴 수 없어요. 계속할까요?",
                )
              )
                return;
              onChange({ module: false });
            }}
            className="mt-5 text-sm text-danger underline underline-offset-4"
          >
            주기 기록 끄기 (기록 삭제)
          </button>
        </>
      )}
    </section>
  );
}

function Switch({
  label,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onToggle(!on)}
      className="flex items-center justify-between gap-4 text-left text-sm disabled:opacity-40"
    >
      <span>{label}</span>
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 ${
          on ? "justify-end bg-slot-a" : "justify-start bg-line"
        }`}
      >
        <span className="size-5 rounded-full bg-card" />
      </span>
    </button>
  );
}

/* ── 내보내기 ───────────────────────────────────────────────────*/
function ExportCard() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-lg">내보내기</h2>
      <p className="mt-2 text-xs leading-5 text-ash">
        건강 기록은 연결 해제나 탈퇴 시 유예 없이 즉시 삭제돼요. 필요하면 먼저
        내보내세요.
      </p>
      <div className="mt-4 flex gap-3">
        {(["json", "csv"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await exportHealth();
                if (!res.ok) return setError(res.message);
                const d = res.data!;
                download(
                  `junbi-health.${kind}`,
                  kind === "json" ? d.json : d.csv,
                  kind === "json" ? "application/json" : "text/csv;charset=utf-8",
                );
              })
            }
            className="rounded-lg border border-line px-4 py-2 text-sm"
          >
            {kind.toUpperCase()}로 받기
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  );
}
