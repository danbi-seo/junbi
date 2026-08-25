/**
 * 지출 · 정산 검증 — docs/20-expenses.md
 *
 * 실행: npm run verify:expenses
 *
 * 여기서 틀리면 돈 얘기가 된다. 1원 차이도 커플 사이에서는 화제가 된다.
 * 그래서 화면이 아니라 DB 함수 하나(settlement_balance)만 검사한다.
 * 계산이 두 곳에 있으면 언젠가 서로 다른 숫자가 나온다.
 *
 * 실제 지출이 이미 쌓여 있어도 안전하게 돌도록 만들었다.
 *   - 잔액은 절대값이 아니라 '검사 전후 차이'로 본다
 *   - 정산 검사는 미정산 지출이 하나도 없을 때만 한다
 *     (settle_up은 커플의 미정산 지출 전부를 정산 처리한다)
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

const rpc = (who, fn, body = {}) =>
  as(who, `rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });

const results = [];
function check(name, why, pass, detail = "") {
  results.push({ pass });
  console.log(`  ${pass ? "통과" : "실패"}  ${name}`);
  if (!pass) {
    console.log(`        ${why}`);
    if (detail) console.log(`        ${detail}`);
  }
}
function skip(name, why) {
  console.log(`  건너뜀  ${name}`);
  console.log(`        ${why}`);
}

const MARK = "검증-지출";
const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;

console.log("\n지출 · 정산 검증\n");

const a = await login(process.env.DEV_EMAIL_A);
const b = await login(process.env.DEV_EMAIL_B);

const prof = await (await as(a, `profiles?select=couple_id&id=eq.${a.id}`)).json();
const couple_id = prof[0].couple_id;

/** a 기준 부호 있는 잔액. +면 a가 받을 차례. */
async function signed() {
  const rows = await (await rpc(a, "settlement_balance")).json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || Number(row.amount) === 0) return 0;
  return row.owed_to === a.id ? Number(row.amount) : -Number(row.amount);
}

async function addExpense(actor, fields) {
  const res = await as(actor, "expenses", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      couple_id,
      payer_id: fields.payer_id ?? actor.id,
      amount: fields.amount,
      split: fields.split ?? "half",
      payer_ratio: fields.payer_ratio ?? 50,
      category: "etc",
      memo: `${MARK} ${fields.memo ?? ""}`.trim(),
      silent: fields.silent ?? false,
    }),
  });
  if (!res.ok) throw new Error(`지출 등록 실패 ${res.status} ${await res.text()}`);
  return (await res.json())[0];
}

async function cleanup() {
  const rows = await (
    await admin(`expenses?select=settlement_id&memo=like.${MARK}*`)
  ).json();
  const ids = [...new Set(rows.map((r) => r.settlement_id).filter(Boolean))];
  await admin(`expenses?memo=like.${MARK}*`, { method: "DELETE" });
  for (const id of ids) {
    await admin(`settlements?id=eq.${id}`, { method: "DELETE" });
  }
}

await cleanup();

try {
  const base = await signed();

  // settle_up은 커플의 미정산 지출을 전부 정산 처리한다.
  // 실제 지출이 남아 있으면 검증이 그걸 정산해 버리므로 그때는 건너뛴다.
  const existing = await (
    await admin(
      `expenses?select=id&couple_id=eq.${couple_id}&settlement_id=is.null`,
    )
  ).json();
  const clean = existing.length === 0;

  // ── 분담 계산 ────────────────────────────────────────────
  //
  // 잔액은 '상대가 갚아야 할 몫'의 차액이다.
  // a가 10,000원을 반반으로 내면 b가 5,000원을 갚아야 한다 → a 기준 +5,000

  let e = await addExpense(a, { amount: 10000, split: "half", memo: "짝수반반" });
  let got = (await signed()) - base;
  check(
    "반반 · 짝수 — 10,000원을 내면 5,000원을 받는다",
    "반반이 절반으로 갈리지 않으면 나머지가 전부 어긋난다",
    got === 5000,
    `기대 +5000, 실제 ${got}`,
  );
  await admin(`expenses?id=eq.${e.id}`, { method: "DELETE" });

  e = await addExpense(a, { amount: 33333, split: "half", memo: "홀수반반" });
  got = (await signed()) - base;
  check(
    "반반 · 홀수 — 33,333원이면 상대는 16,666원 (결제자가 1원 더)",
    "반올림 방향이 반대면 '네가 1원 더 냈네'가 된다. 결제한 쪽이 손해 보는 방향이 안전하다",
    got === 16666,
    `기대 +16666, 실제 ${got} (결제자 부담 ${won(33333 - got)})`,
  );
  await admin(`expenses?id=eq.${e.id}`, { method: "DELETE" });

  e = await addExpense(a, { amount: 50000, split: "payer_all", memo: "내가다" });
  got = (await signed()) - base;
  check(
    "'내가 다' — 잔액이 움직이지 않는다",
    "선물이나 한턱이 정산 목록에 올라오면 마음이 상한다",
    got === 0,
    `기대 0, 실제 ${got}`,
  );
  await admin(`expenses?id=eq.${e.id}`, { method: "DELETE" });

  e = await addExpense(a, {
    amount: 10000,
    split: "custom",
    payer_ratio: 70,
    memo: "직접70",
  });
  got = (await signed()) - base;
  check(
    "'직접' 70% — 결제자가 7,000, 상대가 3,000",
    "비율이 뒤집히면 많이 낸 쪽이 더 갚는 이상한 결과가 된다",
    got === 3000,
    `기대 +3000, 실제 ${got}`,
  );
  await admin(`expenses?id=eq.${e.id}`, { method: "DELETE" });

  // ── 한쪽만 결제한 초기 상태 ─────────────────────────────
  //
  // per_expense를 group by 하면 행이 하나뿐이라 desc와 asc가 같은 행을 집고
  // 잔액이 0으로 나온다. 실제로 났던 버그다 → docs/20-expenses.md
  await addExpense(a, { amount: 20000, split: "half", memo: "한쪽만" });
  got = (await signed()) - base;
  check(
    "한쪽만 결제한 초기 상태에서도 잔액이 나온다",
    "행이 하나일 때 잔액이 0이 되는 버그가 있었다. 첫 지출이 정산에서 사라진다",
    got === 10000,
    `기대 +10000, 실제 ${got}`,
  );

  // ── 양쪽 결제 — 차액만 남는다 ───────────────────────────
  const e2 = await addExpense(b, { amount: 6000, split: "half", memo: "상대결제" });
  got = (await signed()) - base;
  check(
    "양쪽이 내면 차액만 남는다 (10,000 − 3,000 = 7,000)",
    "각자 낸 걸 따로 세면 서로 갚아야 할 돈이 두 줄로 남는다",
    got === 7000,
    `기대 +7000, 실제 ${got}`,
  );

  const mine = await (await as(a, `expenses?select=id&id=eq.${e2.id}`)).json();
  check(
    "상대가 등록한 지출도 내 목록에 보인다",
    "지출은 커플 공용이다. 한쪽만 보이면 정산을 맞출 수 없다",
    mine.length === 1,
    `${mine.length}건`,
  );

  // ── 정산 ────────────────────────────────────────────────
  if (!clean) {
    skip(
      "정산 완료 · 되돌리기",
      "정산되지 않은 실제 지출이 있습니다. settle_up은 전부를 정산 처리하므로 건너뜁니다",
    );
  } else {
    const owed = await signed();
    const settlementId = await (await rpc(a, "settle_up", { p_memo: null })).json();

    let now = await signed();
    check(
      "정산하면 잔액이 0이 된다",
      "정산 후에도 금액이 남으면 두 번 갚게 된다",
      now === 0,
      `실제 ${now}`,
    );

    const s = (
      await (
        await as(a, `settlements?select=from_id,to_id,amount&id=eq.${settlementId}`)
      ).json()
    )[0];
    check(
      "정산 방향이 맞다 — 받을 사람이 to_id",
      "방향이 뒤집히면 이력이 거짓말을 한다",
      Boolean(s) && s.to_id === a.id && s.from_id === b.id && Number(s.amount) === owed,
      JSON.stringify(s),
    );

    const still = await (
      await as(a, `expenses?select=id&settlement_id=is.null&memo=like.${MARK}*`)
    ).json();
    check(
      "정산된 지출은 미정산 목록에서 빠진다",
      "남아 있으면 다음 정산에 또 더해진다",
      still.length === 0,
      `${still.length}건 남음`,
    );

    await rpc(a, "undo_settlement", { p_id: settlementId });
    now = await signed();
    check(
      "되돌리면 잔액이 원래대로 돌아온다",
      "잘못 눌렀을 때 되돌릴 수 없으면 기록을 손으로 고치게 된다",
      now === owed,
      `기대 ${owed}, 실제 ${now}`,
    );
  }

  // ── 알림 ────────────────────────────────────────────────
  await admin("notification_queue?id=not.is.null", { method: "DELETE" });

  await addExpense(a, { amount: 4000, split: "half", silent: true, memo: "조용히" });
  let q = await (
    await admin(
      `notification_queue?select=kind,body&user_id=eq.${b.id}&kind=eq.expense_added`,
    )
  ).json();
  check(
    "🔕 지출은 알림이 가지 않는다",
    "끄는 행위에 대가가 없어야 한다. 조용히 적은 게 알림으로 새면 끌 이유가 사라진다",
    q.length === 0,
    JSON.stringify(q),
  );

  await admin("notification_queue?id=not.is.null", { method: "DELETE" });
  await addExpense(a, { amount: 7000, memo: "묶기1" });
  await addExpense(a, { amount: 8000, memo: "묶기2" });
  await addExpense(a, { amount: 9000, memo: "묶기3" });
  q = await (
    await admin(
      `notification_queue?select=kind,body&user_id=eq.${b.id}&kind=eq.expense_added`,
    )
  ).json();
  check(
    "연달아 등록해도 알림은 한 건으로 묶인다",
    "데이트 하루에 지출이 다섯 번 생긴다. 그때마다 울리면 알림을 꺼 버린다",
    q.length === 1,
    `${q.length}건: ${JSON.stringify(q)}`,
  );
  check(
    "묶인 알림 본문에 합계가 들어간다",
    "마지막 한 건만 알리면 앞의 지출을 놓친다",
    q.length === 1 && String(q[0].body).includes("건 · 총"),
    q[0]?.body ?? "",
  );
} finally {
  await cleanup();
  await admin("notification_queue?id=not.is.null", { method: "DELETE" });
}

const failed = results.filter((r) => !r.pass).length;
console.log();
if (failed) {
  console.log(`${results.length - failed} 통과, ${failed} 실패 — 배포하지 마세요.\n`);
  process.exit(1);
}
console.log(`${results.length}개 전부 통과.\n`);
