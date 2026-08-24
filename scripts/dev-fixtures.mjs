/**
 * 검증용 데이터 세트 — 개발 중에만 쓴다.
 *
 * 실행: npm run fixtures
 *
 * 여러 번 실행해도 안전하다. 이전 [검증] 데이터를 지우고 다시 만든다.
 *
 * 두 계정으로 각각 로그인해서 만든다. service_role로 넣으면 auth.uid()가 없어
 * 알림 트리거가 동작하지 않고, 실제 사용과 다른 경로가 된다.
 *
 * 양쪽 소유 일정을 모두 만드는 게 핵심이다. 한쪽 것만 있으면
 * "A→B 마스킹"만 확인되고 "B→A"는 확인되지 않는다.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.DEV_PASSWORD;

if (!URL_ || !KEY || !SRV || !PASSWORD) {
  console.error(".env.local에 SUPABASE 키들과 DEV_PASSWORD가 필요합니다.");
  process.exit(1);
}

const PREFIX = "[검증]";

const admin = (path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SRV,
      Authorization: `Bearer ${SRV}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...init.headers,
    },
  });

async function login(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const b = await res.json();
  if (!res.ok) throw new Error(`${email} 로그인 실패: ${b.msg ?? b.error}`);
  return { token: b.access_token, id: b.user.id, email };
}

const as = (who, path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${who.token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...init.headers,
    },
  });

/** 오늘 기준 상대 시각을 ISO로. 한국 시간대 기준. */
function at(dayOffset, hhmm, minutesLong = 60) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(Date.now() + dayOffset * 86400000),
  );
  const start = new Date(`${ymd}T${hhmm}:00+09:00`);
  return {
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + minutesLong * 60000).toISOString(),
  };
}

function allDay(dayOffset, days = 1) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(Date.now() + dayOffset * 86400000),
  );
  const start = new Date(`${ymd}T00:00:00+09:00`);
  return {
    starts_at: start.toISOString(),
    // 종일 일정의 끝은 다음 날 00:00
    ends_at: new Date(start.getTime() + days * 86400000).toISOString(),
    all_day: true,
  };
}

const a = await login(process.env.DEV_EMAIL_A);
const b = await login(process.env.DEV_EMAIL_B);

const prof = await (
  await fetch(`${URL_}/rest/v1/profiles?select=id,couple_id,member_slot`, {
    headers: { apikey: SRV, Authorization: `Bearer ${SRV}` },
  })
).json();
const couple_id = prof[0].couple_id;
const slotOf = (id) => prof.find((p) => p.id === id)?.member_slot;

console.log(`\n검증용 데이터 세트`);
console.log(`  ${a.email}  슬롯 ${slotOf(a.id)}`);
console.log(`  ${b.email}  슬롯 ${slotOf(b.id)}\n`);

// ── 정리 ────────────────────────────────────────────────────────
// 소프트 삭제한다. .ics ETag가 max(updated_at)에 걸려 있어서
// 하드 삭제하면 최대값이 과거로 돌아간다.
await admin(`events?title=like.${encodeURIComponent(PREFIX)}*`, {
  method: "PATCH",
  body: JSON.stringify({ deleted_at: new Date().toISOString() }),
});
await admin(`events?title=like.%5B테스트%5D*`, {
  method: "PATCH",
  body: JSON.stringify({ deleted_at: new Date().toISOString() }),
});
await admin(`anniversaries?title=like.${encodeURIComponent(PREFIX)}*`, { method: "DELETE" });
await admin(`routines?label=like.${encodeURIComponent(PREFIX)}*`, { method: "DELETE" });
console.log("이전 검증 데이터 정리");

// ── 일정 ────────────────────────────────────────────────────────
const EVENTS = [
  // 네 가지 성격 — 슬롯 a 소유
  { who: a, scope: "shared", visibility: "full", title: `${PREFIX} 본가 저녁`, emoji: "🍽", ...at(0, "19:00", 120) },
  { who: a, scope: "personal", visibility: "full", title: `${PREFIX} 팀 회의`, emoji: "💼", ...at(0, "10:00", 90) },
  { who: a, scope: "personal", visibility: "busy", title: `${PREFIX} 병원 예약`, emoji: "🏥", ...at(0, "14:00", 60) },
  { who: a, scope: "personal", visibility: "private", title: `${PREFIX} 선물 사러`, emoji: "🎁", ...at(0, "21:30", 60) },

  // 반대 방향 — 슬롯 b 소유. B→A 마스킹도 확인해야 한다.
  { who: b, scope: "personal", visibility: "full", title: `${PREFIX} 요가`, emoji: "🏃", ...at(0, "07:00", 60) },
  { who: b, scope: "personal", visibility: "busy", title: `${PREFIX} 상담`, emoji: "🏥", ...at(0, "16:00", 60) },
  { who: b, scope: "personal", visibility: "private", title: `${PREFIX} 서프라이즈 준비`, emoji: "🎁", ...at(0, "22:00", 60) },

  // 겹치는 일정 — 이음새 뷰에서 칸이 나뉘는지
  { who: a, scope: "personal", visibility: "full", title: `${PREFIX} 겹침 A1`, emoji: "📚", ...at(0, "13:00", 90) },
  { who: a, scope: "personal", visibility: "full", title: `${PREFIX} 겹침 A2`, emoji: "☕", ...at(0, "13:30", 60) },

  // 자정을 넘기는 일정
  { who: a, scope: "shared", visibility: "full", title: `${PREFIX} 밤샘 영화`, emoji: "🎬", ...at(0, "23:00", 180) },

  // 종일 · 여러 날 (여행)
  { who: a, scope: "shared", visibility: "full", title: `${PREFIX} 오사카 여행`, emoji: "✈️", ...allDay(3, 3) },

  // 알리지 않기
  { who: a, scope: "shared", visibility: "full", title: `${PREFIX} 조용히 등록`, emoji: "🔕", silent: true, ...at(1, "12:00", 60) },

  // 미래 일정 — 월 뷰·.ics 범위 확인
  { who: b, scope: "shared", visibility: "full", title: `${PREFIX} 다음 주 데이트`, emoji: "💜", ...at(7, "18:00", 180) },
  { who: a, scope: "personal", visibility: "busy", title: `${PREFIX} 다음 달 출장`, emoji: "✈️", ...at(35, "09:00", 480) },
];

let made = 0;
for (const e of EVENTS) {
  const { who, ...row } = e;
  const res = await as(who, "events", {
    method: "POST",
    body: JSON.stringify({ ...row, couple_id, owner_id: who.id }),
  });
  if (!res.ok) {
    console.log(`  실패 ${row.title}: ${res.status} ${await res.text()}`);
    continue;
  }
  made++;
}
console.log(`일정 ${made}/${EVENTS.length}건`);

// ── 제안 상태 일정 ──────────────────────────────────────────────
// scope=shared여야 하고, 상대가 수락해야 confirmed가 된다.
const prop = await as(a, "events", {
  method: "POST",
  body: JSON.stringify({
    couple_id,
    owner_id: a.id,
    scope: "shared",
    visibility: "full",
    status: "proposed",
    title: `${PREFIX} 제안 - 주말 나들이`,
    emoji: "✨",
    ...at(5, "13:00", 300),
  }),
});
console.log(`제안 상태 일정 ${prop.ok ? "1건" : "실패 " + (await prop.text())}`);

// ── 기념일 ──────────────────────────────────────────────────────
await as(a, "couples?id=eq." + couple_id, {
  method: "PATCH",
  body: JSON.stringify({ started_on: "2026-02-22" }),
});

const ANNIVS = [
  { title: `${PREFIX} 양력 생일`, emoji: "🎂", base_date: "1996-09-30", repeat: "yearly", is_lunar: false },
  { title: `${PREFIX} 음력 생일`, emoji: "🎂", base_date: "1996-09-04", repeat: "yearly", is_lunar: true },
  { title: `${PREFIX} 시험일`, emoji: "📚", base_date: nextMonth(), repeat: "once", is_lunar: false },
  { title: `${PREFIX} 고정 기념일`, emoji: "📌", base_date: "2026-12-25", repeat: "yearly", is_lunar: false, pinned: true },
];

function nextMonth() {
  const d = new Date(Date.now() + 40 * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

let annivs = 0;
for (const row of ANNIVS) {
  const res = await as(a, "anniversaries", {
    method: "POST",
    body: JSON.stringify({ ...row, couple_id }),
  });
  if (res.ok) annivs++;
  else console.log(`  실패 ${row.title}: ${await res.text()}`);
}
console.log(`기념일 ${annivs}/${ANNIVS.length}건 (사귄 날 2026-02-22)`);

// ── 루틴 ────────────────────────────────────────────────────────
const ROUTINES = [
  { who: a, label: `${PREFIX} 일하는중`, emoji: "💼", days: [1, 2, 3, 4, 5], starts_at: "09:30", ends_at: "18:30", priority: 1 },
  // 자정을 넘긴다. 낮에는 안 떠야 한다.
  { who: a, label: `${PREFIX} 자는중`, emoji: "😴", days: [0, 1, 2, 3, 4, 5, 6], starts_at: "23:00", ends_at: "07:00", priority: 0 },
  { who: b, label: `${PREFIX} 통학중`, emoji: "🚇", days: [1, 2, 3, 4, 5], starts_at: "08:00", ends_at: "09:00", priority: 2 },
];

let routines = 0;
for (const r of ROUTINES) {
  const { who, ...row } = r;
  const res = await as(who, "routines", {
    method: "POST",
    body: JSON.stringify({ ...row, user_id: who.id }),
  });
  if (res.ok) routines++;
  else console.log(`  실패 ${row.label}: ${await res.text()}`);
}
console.log(`루틴 ${routines}/${ROUTINES.length}건`);

console.log("\n완료. 다음으로 검증을 돌리세요:");
console.log("  npm run verify");
console.log("  npm run verify:ics -- <주소>\n");
