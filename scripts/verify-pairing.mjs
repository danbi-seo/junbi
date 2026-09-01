/**
 * 가입 · 페어링 검증 — docs/08-auth-pairing.md 1~4
 *
 * 실행: npm run verify:pairing
 *
 * ⚠ 임시 계정을 새로 만들어 돌린다. 실제 커플은 건드리지 않는다.
 *
 * 핵심은 **3단계 확인**이다.
 *   B가 수락해도 A가 확정하기 전까지 데이터가 한 건도 안 보여야 한다.
 *   링크가 새어도 마지막에 막을 수 있어야 한다 → 설계 원칙 9
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
      apikey: SRV, Authorization: `Bearer ${SRV}`,
      "Content-Type": "application/json", ...init.headers,
    },
  });

const authAdmin = (path, init = {}) =>
  fetch(`${URL_}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: SRV, Authorization: `Bearer ${SRV}`,
      "Content-Type": "application/json", ...init.headers,
    },
  });

const as = (who, path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY, Authorization: `Bearer ${who.token}`,
      "Content-Type": "application/json", ...init.headers,
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

const STAMP = String(process.hrtime.bigint());
const PW = `verify-${STAMP}-pw`;
const created = [];

async function makeUser(tag) {
  const email = `pair-${tag}-${STAMP}@junbi.invalid`;
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
  const u = { id: b.id, email, token: (await t.json()).access_token };
  created.push(u);
  return u;
}

console.log("\n가입 · 페어링 검증\n");

const couples = [];
try {
  const a = await makeUser("a");
  const b = await makeUser("b");
  const c = await makeUser("c"); // 제3자

  // ── 1. 프로필 ────────────────────────────────────────────────
  let x = await rpc(a, "create_my_profile", {
    p_name: "검증가", p_birth: "1996-03-15", p_emoji: "🐰",
  });
  check(
    "프로필을 앱에서 만들 수 있다",
    "0단계에는 SQL로 넣었다. 남에게 열려면 화면에서 돼야 한다",
    x.status < 400,
    `status ${x.status} ${JSON.stringify(x.body)}`,
  );

  x = await rpc(a, "create_my_profile", { p_name: "검증가", p_birth: "2999-01-01" });
  check(
    "앞으로의 생년월일은 거부한다",
    "오타를 그대로 받으면 확인 화면이 이상해진다",
    x.status >= 400,
    `status ${x.status}`,
  );

  await rpc(b, "create_my_profile", {
    p_name: "검증나", p_birth: "1997-08-03", p_emoji: "🐻",
  });
  await rpc(c, "create_my_profile", {
    p_name: "검증다", p_birth: "1998-01-01", p_emoji: "🐱",
  });

  // ── 2. 초대 ──────────────────────────────────────────────────
  x = await rpc(a, "create_invite");
  const code = x.body?.code;
  check(
    "초대 코드는 6자리이고 헷갈리는 글자가 없다",
    "불러줄 상황이 생기고 그때 0/O·1/I가 반드시 헷갈린다",
    typeof code === "string" && code.length === 6 && !/[01OI]/.test(code),
    String(code),
  );

  const first = code;
  x = await rpc(a, "create_invite");
  const second = x.body?.code;
  let old = await (await admin(`invites?select=used_at&code=eq.${first}`)).json();
  check(
    "새 코드를 만들면 이전 코드는 즉시 죽는다",
    "여러 개가 살아 있으면 '어느 코드였지'가 생기고, 옛 코드로 남이 들어온다",
    old[0]?.used_at !== null,
    JSON.stringify(old),
  );

  // ── 3. 확인 (아직 연결 아님) ─────────────────────────────────
  x = await rpc(b, "preview_invite", { p_code: second });
  check(
    "코드로 상대의 이름과 생일을 확인할 수 있다",
    "이름만으로는 동명이인이 헷갈린다. 생일이 붙어야 확실해진다",
    x.body?.name === "검증가" && x.body?.birthDate === "1996-03-15",
    JSON.stringify(x.body),
  );

  let seen = await (await as(b, "events_visible?select=id")).json();
  check(
    "확인만 해서는 아무것도 연결되지 않는다",
    "확인 전에 연결되면 잘못 전달된 코드로 남과 이어진다",
    Array.isArray(seen) && seen.length === 0,
    JSON.stringify(seen).slice(0, 120),
  );

  x = await rpc(a, "preview_invite", { p_code: second });
  check(
    "내가 만든 코드는 내가 쓸 수 없다",
    "혼자 커플이 되는 상태를 만들면 안 된다",
    x.status >= 400 && JSON.stringify(x.body).includes("OWN_CODE"),
    `status ${x.status} ${JSON.stringify(x.body).slice(0, 100)}`,
  );

  x = await rpc(b, "preview_invite", { p_code: first });
  check(
    "죽은 코드는 확인 단계에서 걸린다",
    "'이미 사용된 코드예요'를 확인 화면에서 알려줘야 한다",
    x.status >= 400 && JSON.stringify(x.body).includes("USED"),
    `status ${x.status}`,
  );

  // ── 4. 수락 — 그래도 pending ─────────────────────────────────
  x = await rpc(b, "accept_invite", { p_code: second });
  check(
    "수락하면 슬롯 b를 차지한다",
    "수락 자체는 돼야 A가 확정할 대상이 생긴다",
    x.status < 400,
    `status ${x.status} ${JSON.stringify(x.body)}`,
  );

  const couple = (
    await (await admin(`profiles?select=couple_id&id=eq.${b.id}`)).json()
  )[0]?.couple_id;
  couples.push(couple);
  const st = await (await admin(`couples?select=status&id=eq.${couple}`)).json();
  check(
    "수락해도 status는 pending이다",
    "여기서 active가 되면 3단계 확인이 2단계가 된다",
    st[0]?.status === "pending",
    JSON.stringify(st),
  );

  // 이게 이 검증의 핵심이다
  seen = await (await as(b, "events_visible?select=id")).json();
  const pl = await (await as(b, "places?select=id")).json();
  check(
    "확정 전에는 일정도 장소도 0건이다",
    "my_couple_id()가 active만 반환하므로 정책을 안 고쳐도 막혀야 한다",
    seen.length === 0 && pl.length === 0,
    `events ${seen.length} places ${pl.length}`,
  );

  x = await rpc(b, "confirm_pair", {});
  check(
    "수락한 쪽이 스스로 확정할 수는 없다",
    "그게 되면 초대한 사람의 마지막 확인이 무의미해진다",
    x.status >= 400 && JSON.stringify(x.body).includes("NOT_INVITER"),
    `status ${x.status} ${JSON.stringify(x.body).slice(0, 100)}`,
  );

  x = await rpc(c, "accept_invite", { p_code: second });
  check(
    "세 번째 사람은 들어올 수 없다",
    "코드가 새면 제3자가 끼어든다. 화면이 아니라 DB에서 막아야 한다",
    x.status >= 400,
    `status ${x.status} ${JSON.stringify(x.body).slice(0, 100)}`,
  );

  // ── 5. 확정 ──────────────────────────────────────────────────
  x = await rpc(a, "confirm_pair", { p_started_on: "2026-04-20" });
  check(
    "초대한 쪽이 확정하면 연결된다",
    "이 순간 두 사람의 데이터가 서로에게 열린다",
    x.status < 400,
    `status ${x.status} ${JSON.stringify(x.body)}`,
  );

  const cp = await (
    await admin(`couples?select=status,started_on&id=eq.${couple}`)
  ).json();
  check(
    "확정하면서 사귄 날이 함께 저장된다",
    "D-day 기준이다. 나중에 또 물으면 안 넣는다",
    cp[0]?.status === "active" && cp[0]?.started_on === "2026-04-20",
    JSON.stringify(cp),
  );

  const inv = await (
    await admin(`invites?select=used_at&couple_id=eq.${couple}&used_at=is.null`)
  ).json();
  check(
    "확정 뒤 남은 코드가 없다",
    "살아 있으면 확정 뒤에도 제3자가 들어올 수 있다",
    inv.length === 0,
    JSON.stringify(inv),
  );

  // ── 6. 애칭 ──────────────────────────────────────────────────
  await rpc(a, "set_pet_name", { p_name: "담비" });
  await rpc(b, "set_pet_name", { p_name: "주뇨" });
  const names = await (
    await admin(`profiles?select=id,pet_name_for_partner&id=in.(${a.id},${b.id})`)
  ).json();
  check(
    "애칭은 각자 따로 정한다",
    "내 화면의 상대와 상대 화면의 나는 서로 달라도 된다",
    names.find((n) => n.id === a.id)?.pet_name_for_partner === "담비" &&
      names.find((n) => n.id === b.id)?.pet_name_for_partner === "주뇨",
    JSON.stringify(names),
  );

  // ── 7. 이미 연결된 사람 ──────────────────────────────────────
  x = await rpc(a, "create_invite");
  check(
    "이미 연결된 사람은 초대를 만들 수 없다",
    "두 커플에 동시에 속하면 데이터가 섞인다",
    x.status >= 400 && JSON.stringify(x.body).includes("ALREADY_PAIRED"),
    `status ${x.status} ${JSON.stringify(x.body).slice(0, 100)}`,
  );
} finally {
  for (const u of created) {
    await authAdmin(`users/${u.id}`, { method: "DELETE" }).catch(() => {});
  }
  for (const id of couples) {
    if (id) await admin(`couples?id=eq.${id}`, { method: "DELETE" }).catch(() => {});
  }
  // 빈 pending 커플이 남았을 수 있다
  await admin("couples?status=eq.pending&started_on=is.null", { method: "DELETE" })
    .catch(() => {});
}

const failed = results.filter((r) => !r.pass).length;
console.log();
if (failed) {
  console.log(`${results.length - failed} 통과, ${failed} 실패 — 배포하지 마세요.\n`);
  process.exit(1);
}
console.log(`${results.length}개 전부 통과.\n`);
