/**
 * 알림 규칙 검증 — docs/13-notifications.md 판정 순서
 *
 * 실행: npm run verify:push
 *
 * 판정 순서가 이 기능의 전부다.
 *   1. 마스킹 규칙   시간만·비공개 → 무조건 안 감
 *   2. 직접 상호작용 제안·해제 → 무조건 감
 *   3. 발신 설정     내가 끄면 안 감
 *   4. 수신 설정     상대가 끄면 안 감
 *   5. 조용한 시간   미룸
 *
 * 1번이 설정보다 위에 있는지가 핵심이다. 발신 설정을 켜도
 * '시간만' 일정은 알림이 가면 안 된다.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.DEV_PASSWORD;

if (!URL_ || !KEY || !SRV || !PASSWORD) {
  console.error(".env.local에 SUPABASE 키들과 DEV_PASSWORD가 필요합니다.");
  process.exit(1);
}

const admin = (path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SRV,
      Authorization: `Bearer ${SRV}`,
      "Content-Type": "application/json",
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
  if (!res.ok) throw new Error(`${email} 로그인 실패`);
  return { token: b.access_token, id: b.user.id, email };
}

const as = (who, path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${who.token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

const results = [];
function check(name, why, pass, detail = "") {
  results.push({ pass });
  console.log(`  ${pass ? "통과" : "실패"}  ${name}`);
  if (!pass) {
    console.log(`        ${why}`);
    if (detail) console.log(`        ${detail}`);
  }
}

async function clearQueue() {
  await admin("notification_queue?id=not.is.null", { method: "DELETE" });
}

async function queueFor(userId) {
  const res = await admin(
    `notification_queue?select=kind,title,body,send_at&user_id=eq.${userId}`,
  );
  return res.json();
}

/** 일정을 만들고, 상대 큐에 뭐가 쌓였는지 돌려준다 */
async function makeEvent(actor, partnerId, fields) {
  await clearQueue();
  const base = {
    couple_id: fields.couple_id,
    owner_id: actor.id,
    title: fields.title,
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    ends_at: new Date(Date.now() + 90000000).toISOString(),
    scope: fields.scope ?? "personal",
    visibility: fields.visibility ?? "busy",
    silent: fields.silent ?? false,
  };
  const res = await as(actor, "events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(base),
  });
  if (!res.ok) throw new Error(`일정 생성 실패 ${res.status} ${await res.text()}`);
  return queueFor(partnerId);
}

console.log("\n알림 규칙 검증\n");

const a = await login(process.env.DEV_EMAIL_A);
const b = await login(process.env.DEV_EMAIL_B);

const prof = await (await as(a, `profiles?select=couple_id&id=eq.${a.id}`)).json();
const couple_id = prof[0].couple_id;

// 시작 상태 저장 — 끝나고 되돌린다
const before = await (
  await admin("notification_prefs?select=user_id,send_event_created,recv_event_created,quiet_from,quiet_to")
).json();

const setPrefs = (userId, patch) =>
  admin(`notification_prefs?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });

try {
  // 조용한 시간을 확실히 벗어나게 해 둔다 (미뤄짐 검사는 따로 한다)
  await setPrefs(a.id, { quiet_from: "23:59", quiet_to: "23:58" });
  await setPrefs(b.id, { quiet_from: "23:59", quiet_to: "23:58" });

  // ── 1. 마스킹 규칙이 가장 위 ────────────────────────────
  let q = await makeEvent(a, b.id, { couple_id, title: "검증-시간만", visibility: "busy" });
  check(
    "'시간만' 일정에 알림이 가지 않는다",
    "달력에서 제목을 가려도 알림이 시각을 알려주면 가린 의미가 사라진다",
    q.length === 0,
    JSON.stringify(q),
  );

  q = await makeEvent(a, b.id, { couple_id, title: "검증-비공개", visibility: "private" });
  check("'비공개' 일정에 알림이 가지 않는다", "비공개는 존재 자체를 알리지 않는다", q.length === 0, JSON.stringify(q));

  // ── 2. 함께 · 전체공개는 간다 ───────────────────────────
  q = await makeEvent(a, b.id, { couple_id, title: "검증-함께", scope: "shared", visibility: "full" });
  check("함께 일정에 알림이 간다", "상대가 알아야 하는 일정이다", q.length === 1, JSON.stringify(q));
  check(
    "알림 문구에 애칭 + 님이 붙는다",
    "받침이 ㅁ으로 고정돼 이모지·영문 애칭도 조사가 안 깨진다",
    /님이/.test(q[0]?.title ?? ""),
    q[0]?.title,
  );

  q = await makeEvent(a, b.id, { couple_id, title: "검증-전체공개", visibility: "full" });
  check("개인 '전체 공개' 일정에 알림이 간다", "제목을 공개했으므로 알려도 된다", q.length === 1, JSON.stringify(q));

  // ── 3. 이 건만 알리지 않기 ──────────────────────────────
  q = await makeEvent(a, b.id, {
    couple_id, title: "검증-조용히", scope: "shared", visibility: "full", silent: true,
  });
  check("'이 일정은 알리지 않기'가 동작한다", "새벽 정리·서프라이즈 준비에 쓴다", q.length === 0, JSON.stringify(q));

  // ── 4. 발신 설정 ────────────────────────────────────────
  await setPrefs(a.id, { send_event_created: false });
  q = await makeEvent(a, b.id, { couple_id, title: "검증-발신끔", scope: "shared", visibility: "full" });
  check(
    "내가 발신을 끄면 안 간다",
    "내 쪽에서 상대를 안 귀찮게 하고 싶은 경우가 실제로 많다",
    q.length === 0,
    JSON.stringify(q),
  );
  await setPrefs(a.id, { send_event_created: true });

  // ── 5. 수신 설정 ────────────────────────────────────────
  await setPrefs(b.id, { recv_event_created: false });
  q = await makeEvent(a, b.id, { couple_id, title: "검증-수신끔", scope: "shared", visibility: "full" });
  check("상대가 수신을 끄면 안 간다", "둘 다 켜져야 발송된다", q.length === 0, JSON.stringify(q));
  await setPrefs(b.id, { recv_event_created: true });

  // ── 6. 조용한 시간 ──────────────────────────────────────
  // 지금이 조용한 시간 안이 되도록 설정한다
  await setPrefs(b.id, { quiet_from: "00:00", quiet_to: "23:59" });
  q = await makeEvent(a, b.id, { couple_id, title: "검증-조용한시간", scope: "shared", visibility: "full" });
  check(
    "조용한 시간에는 버리지 않고 미룬다",
    "밤에 온 알림은 아침에 묶어서 하나로 나간다",
    q.length === 1 && new Date(q[0].send_at).getTime() > Date.now() + 60000,
    JSON.stringify(q),
  );

  // ── 7. 알림 본문에 가려진 정보가 없는지 ─────────────────
  const all = await (await admin("notification_queue?select=title,body")).json();
  const leaked = all.filter((n) =>
    /검증-시간만|검증-비공개/.test(`${n.title} ${n.body}`),
  );
  check(
    "알림 본문에 가려진 일정 제목이 없다",
    "알림은 잠금화면에 뜬다. 남이 본다",
    leaked.length === 0,
    JSON.stringify(leaked),
  );

  // ── 설정 화면이 실제로 쓸 수 있는가 ──────────────────────────
  //
  // 스위치가 DB에만 있고 화면에서 못 바꾸면 통제가 반쪽이다.
  // 화면은 서버 액션을 거치지만, 그 밑의 RLS가 막혀 있으면 아무것도 안 된다.
  let res = await as(a, `notification_prefs?user_id=eq.${a.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ recv_expense_added: false, quiet_from: "22:00" }),
  });
  let row = await res.json();
  check(
    "내 알림 설정을 내가 고칠 수 있다",
    "스위치가 DB에만 있고 못 바꾸면 설정 화면이 무의미하다",
    res.ok && row[0]?.recv_expense_added === false && row[0]?.quiet_from?.startsWith("22:00"),
    `${res.status} ${JSON.stringify(row).slice(0, 150)}`,
  );

  res = await as(a, `notification_prefs?user_id=eq.${b.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ send_expense_added: false }),
  });
  row = await res.json().catch(() => []);
  check(
    "상대의 알림 설정은 못 고친다",
    "발신 설정을 상대가 만질 수 있으면 끄는 통제 자체가 무너진다",
    !Array.isArray(row) || row.length === 0,
    `${res.status} ${JSON.stringify(row).slice(0, 150)}`,
  );

  // 되돌려 놓는다. 아래 finally가 before로 다시 덮지만 명시해 둔다.
  await setPrefs(a.id, { recv_expense_added: true });
} finally {
  // 원래 설정으로 되돌린다
  for (const p of before) {
    await setPrefs(p.user_id, {
      send_event_created: p.send_event_created,
      recv_event_created: p.recv_event_created,
      quiet_from: p.quiet_from,
      quiet_to: p.quiet_to,
    });
  }
  await clearQueue();
  await admin("events?title=like.검증-*", {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
}

const failed = results.filter((r) => !r.pass).length;
console.log();
if (failed) {
  console.log(`${results.length - failed} 통과, ${failed} 실패 — 배포하지 마세요.\n`);
  process.exit(1);
}
console.log(`${results.length}개 전부 통과.`);
console.log("실기기에서 푸시가 실제로 오는지는 따로 확인해야 합니다.\n");
