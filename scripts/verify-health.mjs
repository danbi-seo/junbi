/**
 * 컨디션 · 주기 검증 — docs/19-health.md 점검표
 *
 * 실행: npm run verify:health
 *
 * 이 앱에서 가장 민감한 데이터다. 다른 건 회복되지만 이건 안 된다.
 * 그래서 검사가 '있는 것'보다 **'없는 것'** 을 확인하는 데 집중돼 있다.
 *
 *   cycles에 짝 조회 정책이 없다
 *   예측 근거 숫자가 상대에게 안 나간다
 *   끄면 흔적 없이 사라진다
 *   주기 관련 푸시가 없다
 *
 * 기록이 이미 있으면 아무것도 하지 않고 멈춘다.
 * 실제 건강 기록을 검증 스크립트가 건드리면 안 된다.
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

/** n일 전 날짜 (YYYY-MM-DD) */
const daysAgo = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a, b) =>
  Math.round((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 86400000);

console.log("\n컨디션 · 주기 검증\n");

const a = await login(process.env.DEV_EMAIL_A);
const b = await login(process.env.DEV_EMAIL_B);

// 실제 기록이 있으면 손대지 않는다
const existing = await (await admin("cycles?select=id&limit=1")).json();
if (Array.isArray(existing) && existing.length > 0) {
  console.log("  이미 주기 기록이 있습니다. 실제 데이터를 건드리지 않으려고 멈춥니다.\n");
  process.exit(0);
}

// 시작 상태 저장 — 끝나고 되돌린다
const beforeSharing = await (
  await admin("health_sharing?select=user_id,cycle_module_on,share_cycle,share_condition,avoid_in_free_slots,consented_at")
).json();

const setSharing = (userId, patch) =>
  admin(`health_sharing?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });

async function seedCycles(userId, gaps) {
  // gaps = [28, 29, 28] → 오늘로부터 거슬러 올라가며 시작일을 만든다
  let offset = 0;
  const rows = [{ user_id: userId, period_start: daysAgo(0) }];
  for (const g of gaps) {
    offset += g;
    rows.push({ user_id: userId, period_start: daysAgo(offset) });
  }
  await admin("cycles", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
    body: JSON.stringify(rows),
  });
  return rows;
}

const wipe = async () => {
  await admin("cycles?id=not.is.null", { method: "DELETE" });
  await admin("conditions?id=not.is.null", { method: "DELETE" });
};

await wipe();

try {
  await setSharing(a.id, {
    cycle_module_on: true, share_cycle: false,
    share_condition: false, avoid_in_free_slots: false,
  });

  // ── 1. 원본은 어떤 경우에도 안 나간다 ────────────────────────
  await seedCycles(a.id, [28, 29, 28]);

  let r = await (await as(b, "cycles?select=id,period_start,flow,memo")).json();
  check(
    "짝은 cycles를 한 건도 못 읽는다",
    "원본 기록(증상·통증·메모·정확한 날짜)은 어떤 경우에도 상대에게 넘어가면 안 된다",
    Array.isArray(r) && r.length === 0,
    JSON.stringify(r).slice(0, 200),
  );

  await setSharing(a.id, { share_cycle: true });
  r = await (await as(b, "cycles?select=id")).json();
  check(
    "공유를 켜도 cycles 원본은 못 읽는다",
    "공유는 파생값만 내보내는 것이지 원본 접근 권한을 주는 게 아니다",
    Array.isArray(r) && r.length === 0,
    JSON.stringify(r).slice(0, 200),
  );

  r = await (await as(b, `health_sharing?select=user_id,share_cycle&user_id=eq.${a.id}`)).json();
  check(
    "짝은 상대의 공개 설정을 못 읽는다",
    "share_cycle = false가 보이면 끄는 행위가 추궁 대상이 된다. 스위치가 있으나 마나가 된다",
    Array.isArray(r) && r.length === 0,
    JSON.stringify(r).slice(0, 200),
  );

  let x = await rpc(b, "cycle_prediction", { p_user: a.id });
  check(
    "짝은 cycle_prediction을 직접 부를 수 없다",
    "인자로 남의 uuid를 받는 함수가 열려 있으면 예측 근거 숫자를 그대로 가져간다",
    x.status === 404 || x.status === 403 || x.status === 401,
    `status ${x.status} ${JSON.stringify(x.body).slice(0, 150)}`,
  );

  // ── 2. 예측 계산 ──────────────────────────────────────────────
  x = await rpc(a, "my_health");
  let pred = x.body?.prediction;
  check(
    "기록 4회 · 간격 28·29·28 → 예측이 나온다",
    "3회 이상이고 편차가 작으면 예측해야 한다",
    pred?.status === "ok",
    JSON.stringify(pred),
  );
  check(
    "중앙값을 쓴다 (28·29·28 → 28일)",
    "평균을 쓰면 한 번 크게 어긋난 주기가 전체를 끌고 간다",
    pred?.cycleLength === 28,
    `cycleLength=${pred?.cycleLength}`,
  );
  check(
    "예측을 날짜 하나가 아니라 구간으로 준다",
    "추정치를 하루로 특정하면 확정처럼 읽힌다",
    pred?.nextFrom && pred?.nextTo && pred.nextFrom !== pred.nextTo,
    `${pred?.nextFrom} ~ ${pred?.nextTo}`,
  );

  // 배란은 거꾸로 센다. 다음 예정일 − 14가 기준이다.
  // fertileFrom = next − 19, fertileTo = next − 11
  if (pred?.status === "ok") {
    const next = new Date(pred.nextFrom + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 2); // nextFrom = next − 2
    const nextStr = next.toISOString().slice(0, 10);
    check(
      "배란을 다음 예정일에서 거꾸로 센다 (−19 ~ −11)",
      "마지막 시작일 + 14로 앞으로 세면 틀린다. 난포기는 사람마다 달마다 크게 변한다",
      diffDays(nextStr, pred.fertileFrom) === 19 && diffDays(nextStr, pred.fertileTo) === 11,
      `next=${nextStr} fertile=${pred.fertileFrom}~${pred.fertileTo}`,
    );
    check(
      "임신 가능성 구간이 마지막 시작일 + 14가 아니다",
      "앞으로 세는 계산이 남아 있으면 구간이 통째로 어긋난다",
      diffDays(pred.fertileFrom, pred.lastStart) !== 14,
      `lastStart=${pred.lastStart} fertileFrom=${pred.fertileFrom}`,
    );
  } else {
    check("배란을 다음 예정일에서 거꾸로 센다", "예측이 안 나와 검사 불가", false, JSON.stringify(pred));
    check("임신 가능성 구간이 마지막 시작일 + 14가 아니다", "예측이 안 나와 검사 불가", false, "");
  }

  // 3회 미만
  await admin("cycles?id=not.is.null", { method: "DELETE" });
  await seedCycles(a.id, [28]); // 2회
  x = await rpc(a, "my_health");
  check(
    "기록 3회 미만이면 예측하지 않는다",
    "근거 없는 숫자를 보여주면 과신한다",
    x.body?.prediction?.status === "insufficient",
    JSON.stringify(x.body?.prediction),
  );

  // 편차 큰 경우
  await admin("cycles?id=not.is.null", { method: "DELETE" });
  await seedCycles(a.id, [21, 40, 24, 45]);
  x = await rpc(a, "my_health");
  check(
    "편차가 7일 이상이면 예측하지 않는다",
    "틀린 예측을 주는 것보다 없는 게 낫다",
    x.body?.prediction?.status === "irregular",
    JSON.stringify(x.body?.prediction),
  );

  // ── 3. 상대에게 나가는 것 ─────────────────────────────────────
  await admin("cycles?id=not.is.null", { method: "DELETE" });
  await seedCycles(a.id, [28, 29, 28]);
  await admin("cycles?user_id=eq." + a.id + "&period_start=eq." + daysAgo(0), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ flow: 2, pain: 2, symptoms: ["두통", "부종"], memo: "비밀 메모" }),
  });

  await setSharing(a.id, { share_cycle: false, share_condition: false });
  x = await rpc(b, "partner_health");
  const offJson = JSON.stringify(x.body ?? {});
  check(
    "공유를 끄면 상대에게 아무것도 안 나간다",
    "끄면 조용히 사라져야 한다. '중단했어요'가 아니라 그냥 없는 것처럼 보여야 한다",
    !offJson.includes("periods") && !offJson.includes("periodActive") &&
      !offJson.includes("fertile") && !offJson.includes("condition"),
    offJson.slice(0, 200),
  );

  await setSharing(a.id, { share_cycle: true });
  x = await rpc(b, "partner_health");
  const onJson = JSON.stringify(x.body ?? {});
  check(
    "공유를 켜면 생리 구간과 진행 중 여부가 나간다",
    "켠 사람이 기대하는 것이 안 나가면 스위치가 무의미하다",
    Boolean(x.body?.periods) && x.body?.periodActive === true,
    onJson.slice(0, 200),
  );

  for (const [field, why] of [
    ["flow", "생리량"],
    ["pain", "통증 정도"],
    ["symptoms", "증상"],
    ["비밀 메모", "메모"],
    ["cycleLength", "주기 길이"],
    ["variance", "편차"],
    ["recentGaps", "최근 간격"],
    ["lastStart", "마지막 시작일"],
    ["delayDays", "지연 여부"],
  ]) {
    check(
      `공유를 켜도 나가지 않는다 — ${why}`,
      "상대가 보는 건 시작·끝 구간, 임신 가능성 구간, 진행 중 여부뿐이다",
      !onJson.includes(field),
      onJson.slice(0, 250),
    );
  }

  // ── 4. 컨디션 ────────────────────────────────────────────────
  await rpc(a, "save_condition", {
    p_energy: 2, p_pain_areas: ["어깨"], p_memo: "컨디션 비밀 메모",
  });

  await setSharing(a.id, { share_condition: false });
  x = await rpc(b, "partner_health");
  check(
    "컨디션 공유를 끄면 상대에게 안 나간다",
    "스위치를 끄면 즉시 0건이 돼야 한다",
    !JSON.stringify(x.body ?? {}).includes("energy"),
    JSON.stringify(x.body).slice(0, 200),
  );

  await setSharing(a.id, { share_condition: true });
  x = await rpc(b, "partner_health");
  check(
    "컨디션 공유를 켜면 기운과 아픈 곳이 나간다",
    "켠 항목은 보여야 한다",
    x.body?.condition?.energy === 2,
    JSON.stringify(x.body?.condition),
  );
  check(
    "컨디션을 켜도 메모는 나가지 않는다",
    "기운과 아픈 곳만이다. 메모는 본인 것이다",
    !JSON.stringify(x.body ?? {}).includes("컨디션 비밀 메모"),
    JSON.stringify(x.body?.condition),
  );

  // ── 5. 알림 ──────────────────────────────────────────────────
  await admin("notification_queue?id=not.is.null", { method: "DELETE" });

  // 컨디션이 나쁜 날 알림을 줄인다 (b가 기운 2로 기록 → a의 지출이 b에게 안 감)
  await rpc(b, "save_condition", { p_energy: 1 });
  const prof = await (await as(a, `profiles?select=couple_id&id=eq.${a.id}`)).json();
  await as(a, "expenses", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      couple_id: prof[0].couple_id, payer_id: a.id, amount: 5000,
      split: "half", category: "etc", memo: "검증-건강",
    }),
  });
  let q = await (await admin(`notification_queue?select=kind&user_id=eq.${b.id}`)).json();
  check(
    "기운이 낮은 날은 지출 알림이 가지 않는다",
    "이유는 상대에게 알리지 않는다. 그냥 덜 간다",
    q.length === 0,
    JSON.stringify(q),
  );

  await admin("conditions?id=not.is.null", { method: "DELETE" });
  await admin("notification_queue?id=not.is.null", { method: "DELETE" });
  await admin("expenses?memo=like.검증-건강*", { method: "DELETE" });

  // 주기 기록에 알림이 붙지 않는다
  await rpc(a, "log_period_start", {});
  q = await (await admin("notification_queue?select=kind,title,body")).json();
  check(
    "주기를 기록해도 알림이 생기지 않는다",
    "잠금화면에 뜨고 매달 특정 날짜에 알림이 오는 건 그 자체로 압박이 된다",
    q.length === 0,
    JSON.stringify(q),
  );

  // ── 5-2. 소급 입력 ───────────────────────────────────────────
  //
  // 시작일을 놓치는 일이 잦다. 달력에서 지난 날짜를 눌러 넣을 수 있어야 한다.
  await admin("cycles?id=not.is.null", { method: "DELETE" });

  x = await rpc(a, "log_period_start", { p_date: daysAgo(40) });
  check(
    "지난 날짜로 시작을 기록할 수 있다",
    "시작일을 놓치면 그 주기가 통째로 빠지고 평균이 망가진다",
    x.status === 200 && typeof x.body === "string",
    `status ${x.status} ${JSON.stringify(x.body)}`,
  );

  x = await rpc(a, "log_period_start", { p_date: daysAgo(-1) });
  check(
    "앞으로의 날짜는 기록할 수 없다",
    "아직 오지 않은 날을 기록하면 예측이 미래 기준으로 어긋난다",
    x.status >= 400,
    `status ${x.status}`,
  );

  // 하루 차이로 두 번 누르는 건 오타로 본다
  await rpc(a, "log_period_start", { p_date: daysAgo(39) });
  r = await (await admin(`cycles?select=period_start&user_id=eq.${a.id}`)).json();
  check(
    "하루 차이로 다시 누르면 기록이 늘지 않고 날짜만 옮겨진다",
    "이틀짜리 유령 주기가 생기면 간격이 반토막 나고 예측이 무너진다",
    r.length === 1 && r[0].period_start === daysAgo(39),
    JSON.stringify(r),
  );

  // 열린 기록이 둘일 때 오늘 '끝났어요'가 옛것까지 닫으면 안 된다
  await rpc(a, "log_period_start", { p_date: daysAgo(2) });
  await rpc(a, "log_period_end", {});
  r = await (
    await admin(`cycles?select=period_start,period_end&user_id=eq.${a.id}&order=period_start`)
  ).json();
  check(
    "오늘 종료가 지난달 기록까지 닫지 않는다",
    "소급 입력을 붙이면 열린 기록이 둘이 될 수 있다. 그때 둘 다 닫히면 기간이 통째로 틀어진다",
    r.length === 2 && r[0].period_end === null && r[1].period_end === daysAgo(0),
    JSON.stringify(r),
  );

  await admin("cycles?id=not.is.null", { method: "DELETE" });
  await seedCycles(a.id, [28, 29, 28]);
  await setSharing(a.id, { share_cycle: true });

  // ── 6. 끄면 파기 ─────────────────────────────────────────────
  let before = await (await admin(`cycles?select=id&user_id=eq.${a.id}`)).json();
  await rpc(a, "set_health_sharing", { p_module: false });
  let after = await (await admin(`cycles?select=id&user_id=eq.${a.id}`)).json();
  check(
    "모듈을 끄면 기록이 즉시 파기된다",
    "30일 유예를 두지 않는다. 헤어진 뒤에도 주기 데이터가 서버에 남아 있다는 사실의 무게가 크다",
    before.length > 0 && after.length === 0,
    `끄기 전 ${before.length}건 → 끈 뒤 ${after.length}건`,
  );

  const sharing = (
    await (await admin(`health_sharing?select=share_cycle,avoid_in_free_slots&user_id=eq.${a.id}`)).json()
  )[0];
  check(
    "모듈을 끄면 공유 스위치도 같이 내려간다",
    "기록이 없는데 공유가 켜져 있으면 다시 켤 때 의도치 않게 바로 나간다",
    sharing?.share_cycle === false && sharing?.avoid_in_free_slots === false,
    JSON.stringify(sharing),
  );

  x = await rpc(b, "partner_health");
  check(
    "끈 뒤 상대 화면에서 흔적 없이 사라진다",
    "'중단했어요'가 보이면 끄는 행위가 추궁 대상이 된다",
    !JSON.stringify(x.body ?? {}).includes("periods"),
    JSON.stringify(x.body).slice(0, 200),
  );

  // ── 7. 문구 ──────────────────────────────────────────────────
  //
  // '안전'이 들어간 표현이 가장 위험하다. 달력법으로는 안전한 날을 식별할
  // 수 없고, 정자 생존 기간 때문에 계산 구간 밖에서도 임신이 가능하다.
  {
    const fs2 = await import("node:fs");
    const src = ["lib/health.ts", "app/(app)/health/health-view.tsx",
                 "app/(app)/page.tsx", "app/(app)/free/free-view.tsx"]
      .map((f) => fs2.readFileSync(f, "utf8")).join("\n");
    // 주석에 적힌 '쓰지 말 것' 목록은 제외하고 실제 화면 문구만 본다
    const shown = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");

    for (const [word, why] of [
      ["가임기", "임상 용어라 확정적으로 읽힌다"],
      ["안전기", "달력법으로는 안전한 날을 식별할 수 없다"],
      ["안전한 날", "같은 이유로 쓰지 않는다"],
      ["임신 가능성 낮음", "낮음 라벨을 붙이면 비교 대상이 화면에 생긴다"],
      ["배란일", "하루로 특정하면 추정 위에 쌓은 추정이 확정처럼 보인다"],
    ]) {
      check(
        `화면 문구에 '${word}'이 없다`,
        why,
        !shown.includes(word),
        "",
      );
    }

    check(
      "disclaimer가 코드에 있다",
      "범례 바로 아래 상시 노출돼야 한다. 상세 화면에만 넣으면 안 본다",
      src.includes("피임이나 임신 계획의 근거로 쓰지 마세요"),
      "",
    );
  }

  // ── 8. .ics에 건강 정보가 없다 ───────────────────────────────
  {
    const fs2 = await import("node:fs");
    const ics = fs2.readFileSync("lib/ics.ts", "utf8")
      + fs2.readFileSync("app/api/ics/[token]/route.ts", "utf8");
    check(
      ".ics 코드가 cycles·conditions를 읽지 않는다",
      ".ics는 기본 캘린더 앱에 저장돼 위젯과 잠금화면에 뜬다. 남이 본다",
      !/cycles|conditions|partner_health/.test(ics),
      "",
    );
  }

  // ── 7. Realtime 제외 ─────────────────────────────────────────
  const pub = await (
    await admin("rpc/exec_sql", { method: "POST", body: JSON.stringify({}) })
  ).json().catch(() => null);
  // PostgREST로 pg_publication_tables를 직접 못 읽으므로 마이그레이션 파일로 확인한다
  const fs = await import("node:fs");
  const realtime = fs.readFileSync("supabase/migrations/20260821090012_realtime.sql", "utf8");
  check(
    "cycles·conditions가 Realtime publication에 없다",
    "Realtime 페이로드에는 마스킹이 적용되지 않는다. 원본이 그대로 나간다",
    !/add table (cycles|conditions)/.test(realtime),
    pub ? "" : "",
  );
} finally {
  await wipe();
  await admin("notification_queue?id=not.is.null", { method: "DELETE" });
  await admin("expenses?memo=like.검증-건강*", { method: "DELETE" });
  for (const s of beforeSharing) {
    await setSharing(s.user_id, {
      cycle_module_on: s.cycle_module_on,
      share_cycle: s.share_cycle,
      share_condition: s.share_condition,
      avoid_in_free_slots: s.avoid_in_free_slots,
      consented_at: s.consented_at,
    });
  }
}

const failed = results.filter((r) => !r.pass).length;
console.log();
if (failed) {
  console.log(`${results.length - failed} 통과, ${failed} 실패 — 배포하지 마세요.\n`);
  process.exit(1);
}
console.log(`${results.length}개 전부 통과.\n`);
