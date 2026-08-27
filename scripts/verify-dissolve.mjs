/**
 * 연결 해제 · 파기 · 탈퇴 검증 — docs/08-auth-pairing.md 5~7
 *
 * 실행: npm run verify:dissolve
 *
 * ⚠ 실제 커플을 건드리면 안 된다. 이 검증은 매번 **임시 계정 두 개를 새로
 *   만들어** 짝을 지어 놓고, 그 커플로만 해제·파기·탈퇴를 돌린다.
 *   끝나면 임시 계정을 지운다.
 *
 * 여기서 확인하는 것은 '사라졌는가'다.
 *   건강 기록이 유예 없이 즉시 지워지는가
 *   ics_token이 즉시 무효화되는가  (안 하면 상대 캘린더로 계속 흘러간다)
 *   미사용 초대 코드가 죽는가       (안 하면 옛 코드로 제3자가 들어온다)
 *   상대 동의 없이 끊기는가
 *   탈퇴 cascade에 고아 레코드가 안 남는가
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY || !SRV) {
  console.error(".env.local에 SUPABASE 키들이 필요합니다.");
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

const authAdmin = (path, init = {}) =>
  fetch(`${URL_}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: SRV,
      Authorization: `Bearer ${SRV}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

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

const rpc = async (who, fn, body = {}) => {
  const r = await as(who, `rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const results = [];
function check(name, why, pass, detail = "") {
  results.push({ pass });
  console.log(`  ${pass ? "통과" : "실패"}  ${name}`);
  if (!pass) {
    console.log(`        ${why}`);
    if (detail) console.log(`        ${detail}`);
  }
}

const STAMP = process.env.VERIFY_STAMP ?? String(process.hrtime.bigint());
const PW = `verify-${STAMP}-pw`;

async function makeUser(tag) {
  const email = `verify-${tag}-${STAMP}@junbi.invalid`;
  const res = await authAdmin("users", {
    method: "POST",
    body: JSON.stringify({ email, password: PW, email_confirm: true }),
  });
  const b = await res.json();
  if (!res.ok) throw new Error(`임시 계정 생성 실패: ${JSON.stringify(b)}`);

  const t = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  const tb = await t.json();
  return { id: b.id, email, token: tb.access_token };
}

const created = [];
async function cleanup() {
  for (const u of created) {
    await authAdmin(`users/${u.id}`, { method: "DELETE" }).catch(() => {});
  }
  await admin(`couples?id=eq.${couple ?? "00000000-0000-0000-0000-000000000000"}`, {
    method: "DELETE",
  }).catch(() => {});
}

console.log("\n연결 해제 · 파기 · 탈퇴 검증\n");

let couple = null;

try {
  // ── 임시 커플 한 쌍 ─────────────────────────────────────────
  const a = await makeUser("a");
  const b = await makeUser("b");
  created.push(a, b);

  const c = await (
    await admin("couples", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "active", started_on: "2020-01-01" }),
    })
  ).json();
  couple = c[0].id;

  await admin("profiles", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      { id: a.id, name: "검증A", birth_date: "1990-01-01", emoji_key: "🐰",
        couple_id: couple, member_slot: "a" },
      { id: b.id, name: "검증B", birth_date: "1990-01-02", emoji_key: "🐻",
        couple_id: couple, member_slot: "b" },
    ]),
  });
  await admin("notification_prefs", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
    body: JSON.stringify([{ user_id: a.id }, { user_id: b.id }]),
  });
  {
    const r = await admin("health_sharing", {
      method: "POST",
      headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      // PostgREST 벌크 삽입은 모든 객체의 키가 같아야 한다 (PGRST102)
      body: JSON.stringify([
        { user_id: a.id, cycle_module_on: true, share_cycle: true },
        { user_id: b.id, cycle_module_on: false, share_cycle: false },
      ]),
    });
    if (!r.ok) console.log("        [진단] health_sharing 삽입:", r.status, await r.text());
  }

  // 지울 것들을 채워 넣는다
  await admin("cycles", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ user_id: a.id, period_start: "2026-08-01" }]),
  });
  await admin("conditions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ user_id: a.id, on_date: "2026-08-20", energy: 3 }]),
  });
  await admin("statuses", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      { user_id: a.id, kind: "activity", emoji: "💼", text: "검증" },
    ]),
  });
  await admin("events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      { couple_id: couple, owner_id: a.id, title: "검증-함께", scope: "shared",
        visibility: "full", starts_at: "2026-09-01T01:00:00Z",
        ends_at: "2026-09-01T02:00:00Z" },
      { couple_id: couple, owner_id: a.id, title: "검증-개인", scope: "personal",
        visibility: "busy", starts_at: "2026-09-02T01:00:00Z",
        ends_at: "2026-09-02T02:00:00Z" },
    ]),
  });
  await admin("invites", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      { code: `V${STAMP.slice(-5)}`, couple_id: couple, created_by: a.id,
        expires_at: "2030-01-01T00:00:00Z" },
    ]),
  });
  await rpc(a, "issue_ics_token");
  await rpc(b, "issue_ics_token");

  // ── 확인 화면 숫자 ──────────────────────────────────────────
  let x = await rpc(a, "dissolve_summary");
  check(
    "해제 전에 숫자를 세어 보여준다",
    "'모든 데이터가 삭제됩니다'로는 판단이 안 된다. 개수가 있어야 한다",
    x.body?.sharedEvents === 1 && x.body?.myEvents === 1 && x.body?.cycles === 1,
    JSON.stringify(x.body),
  );

  // ── 해제 ────────────────────────────────────────────────────
  x = await rpc(a, "dissolve_couple", { p_purge_now: false });
  check(
    "한쪽이 누르면 상대 동의 없이 끊긴다",
    "승인 대기를 만들면 그 사이 상대가 계속 내 일정과 상태를 본다. 안전 문제다",
    x.status < 400,
    `status ${x.status} ${JSON.stringify(x.body)}`,
  );

  let rows = await (await admin(`cycles?select=id&user_id=eq.${a.id}`)).json();
  check(
    "건강 기록이 유예 없이 즉시 지워진다",
    "헤어진 뒤에도 상대의 주기 데이터가 서버에 남아 있다는 사실의 무게가 크다",
    rows.length === 0,
    `${rows.length}건 남음`,
  );

  rows = await (await admin(`conditions?select=id&user_id=eq.${a.id}`)).json();
  const st = await (await admin(`statuses?select=user_id&user_id=eq.${a.id}`)).json();
  check(
    "컨디션과 지금 상태도 즉시 지워진다",
    "상태는 '지금 어디 있나'에 가까운 정보다. 관계가 끝나면 남을 이유가 없다",
    rows.length === 0 && st.length === 0,
    `컨디션 ${rows.length} 상태 ${st.length}`,
  );

  const hs = await (
    await admin(`health_sharing?select=cycle_module_on,share_cycle&user_id=eq.${a.id}`)
  ).json();
  check(
    "건강 공유 스위치가 전부 내려간다",
    "기록이 없는데 스위치가 켜져 있으면 재결합 시 의도치 않게 바로 나간다",
    hs[0]?.cycle_module_on === false && hs[0]?.share_cycle === false,
    JSON.stringify(hs),
  );

  const tok = await (
    await admin(`ics_tokens?select=revoked_at&user_id=in.(${a.id},${b.id})`)
  ).json();
  check(
    "캘린더 구독 주소가 즉시 무효화된다",
    "빠뜨리면 상대 캘린더 앱으로 내 일정이 계속 흘러간다. .ics는 RLS가 안 걸린다",
    tok.length > 0 && tok.every((t) => t.revoked_at),
    JSON.stringify(tok),
  );

  const inv = await (await admin(`invites?select=used_at&couple_id=eq.${couple}`)).json();
  check(
    "미사용 초대 코드가 죽는다",
    "빠뜨리면 헤어진 뒤 옛 코드로 제3자가 들어온다",
    inv.length > 0 && inv.every((i) => i.used_at),
    JSON.stringify(inv),
  );

  const prof = await (
    await admin(`profiles?select=couple_id,member_slot,previous_couple_id&id=eq.${a.id}`)
  ).json();
  check(
    "관계가 끊기고 previous_couple_id에 남는다",
    "couple_id가 null이면 my_couple_id()가 null이라 모든 조회가 한 번에 막힌다",
    prof[0]?.couple_id === null && prof[0]?.member_slot === null &&
      prof[0]?.previous_couple_id === couple,
    JSON.stringify(prof),
  );

  // 해제된 뒤에는 상대 데이터가 한 건도 안 보여야 한다
  const seen = await (await as(b, "events_visible?select=id")).json();
  check(
    "해제 후 상대 일정이 0건이 된다",
    "status만 바꿔도 my_couple_id()가 null이라 정책을 고치지 않아도 막혀야 한다",
    Array.isArray(seen) && seen.length === 0,
    JSON.stringify(seen).slice(0, 150),
  );

  const q = await (
    await admin(`notification_queue?select=kind,title&user_id=eq.${b.id}&kind=eq.dissolved`)
  ).json();
  check(
    "상대에게 해제 알림이 간다",
    "조용히 끊으면 상대가 영문을 모른 채 남는다. 이 알림은 끌 수 없다",
    q.length === 1 && q[0].title.includes("해제"),
    JSON.stringify(q),
  );
  check(
    "해제 알림에 누가 눌렀는지 없다",
    "누가 왜 눌렀는지는 앱이 다룰 영역이 아니다",
    q.length === 1 && !/검증A|검증B/.test(`${q[0].title} ${q[0].body ?? ""}`),
    JSON.stringify(q),
  );

  // ── 복구 ────────────────────────────────────────────────────
  x = await rpc(a, "request_restore");
  check(
    "유예 기간 중 다시 연결하자고 청할 수 있다",
    "30일 안에는 되돌릴 수 있어야 한다",
    x.status < 400,
    `status ${x.status} ${JSON.stringify(x.body)}`,
  );

  x = await rpc(a, "accept_restore");
  check(
    "청한 사람이 혼자 되돌릴 수는 없다",
    "끊는 건 혼자, 잇는 건 둘이. 방향이 다르다",
    x.status >= 400,
    `status ${x.status} ${JSON.stringify(x.body)}`,
  );

  x = await rpc(b, "accept_restore");
  const back = await (await admin(`couples?select=status&id=eq.${couple}`)).json();
  check(
    "상대가 수락하면 다시 연결된다",
    "복구는 양쪽 동의로만 된다",
    x.status < 400 && back[0]?.status === "active",
    `status ${x.status} ${JSON.stringify(back)}`,
  );

  const cyc = await (await admin(`cycles?select=id&user_id=eq.${a.id}`)).json();
  check(
    "복구해도 건강 기록은 돌아오지 않는다",
    "즉시 파기한 것이 되살아나면 '즉시 파기'가 거짓말이 된다",
    cyc.length === 0,
    `${cyc.length}건`,
  );

  // ── 즉시 삭제 ───────────────────────────────────────────────
  x = await rpc(a, "dissolve_couple", { p_purge_now: true });
  if (x.status >= 400) console.log("        [진단] 즉시삭제 오류:", JSON.stringify(x.body));
  const gone = await (await admin(`couples?select=id&id=eq.${couple}`)).json();
  check(
    "'지금 바로 모두 삭제'가 유예 없이 지운다",
    "30일을 기다리고 싶지 않은 사람이 있고, 그게 권리다",
    x.status < 400 && gone.length === 0,
    `status ${x.status} couples ${gone.length}건`,
  );

  const ev = await (await admin(`events?select=id&couple_id=eq.${couple}`)).json();
  const pl = await (await admin(`places?select=id&couple_id=eq.${couple}`)).json();
  check(
    "couples를 지우면 일정·장소가 cascade로 따라간다",
    "고아 레코드가 남는 사고가 흔하다",
    ev.length === 0 && pl.length === 0,
    `events ${ev.length} places ${pl.length}`,
  );

  const stillProf = await (await admin(`profiles?select=id&id=eq.${a.id}`)).json();
  check(
    "커플을 지워도 계정과 프로필은 남는다",
    "관계가 끝나도 계정은 남아야 한다. profiles는 set null이다",
    stillProf.length === 1,
    JSON.stringify(stillProf),
  );

  // ── 탈퇴 cascade ────────────────────────────────────────────
  await admin("push_subscriptions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      { user_id: a.id, endpoint: `https://verify.invalid/${STAMP}`,
        p256dh: "x", auth: "y" },
    ]),
  });

  const del = await authAdmin(`users/${a.id}`, { method: "DELETE" });
  const orphans = {};
  for (const table of [
    "profiles", "push_subscriptions", "ics_tokens",
    "notification_prefs", "health_sharing", "notification_queue",
  ]) {
    const r = await (await admin(`${table}?select=user_id&user_id=eq.${a.id}`)).json();
    orphans[table] = Array.isArray(r) ? r.length : -1;
  }
  // profiles는 id 컬럼이라 따로 센다
  const pr = await (await admin(`profiles?select=id&id=eq.${a.id}`)).json();
  orphans.profiles = pr.length;

  check(
    "탈퇴하면 고아 레코드가 안 남는다",
    "나중에 추가한 테이블(push_subscriptions·ics_tokens·health_sharing)이 특히 잘 빠진다",
    del.ok && Object.values(orphans).every((n) => n === 0),
    JSON.stringify(orphans),
  );
  if (del.ok) created.splice(created.indexOf(a), 1);
} finally {
  await cleanup();
}

const failed = results.filter((r) => !r.pass).length;
console.log();
if (failed) {
  console.log(`${results.length - failed} 통과, ${failed} 실패 — 배포하지 마세요.\n`);
  process.exit(1);
}
console.log(`${results.length}개 전부 통과.\n`);
