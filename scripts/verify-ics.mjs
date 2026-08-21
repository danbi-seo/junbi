/**
 * .ics 피드 검증 — docs/12-ics-feed.md 점검 항목
 *
 * 실행: npm run verify:ics            (기본 http://localhost:3000)
 *       npm run verify:ics -- <주소>   (배포본)
 *
 * 이 파일은 상대 기기의 캘린더 앱에 저장되고 잠금화면에 뜬다.
 * 상대의 가려진 일정 제목이 여기 들어가면 최악의 유출 경로가 된다.
 *
 * service_role로 도는 라우트라 RLS도 뷰도 걸리지 않는다.
 * 마스킹이 코드로 제대로 걸렸는지는 실제 응답을 뜯어보는 수밖에 없다.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = process.env.DEV_PASSWORD;

if (!URL_ || !KEY || !PASSWORD) {
  console.error(".env.local에 NEXT_PUBLIC_SUPABASE_* 와 DEV_PASSWORD가 필요합니다.");
  process.exit(1);
}

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

/** 그 계정의 .ics 토큰을 발급받는다 */
async function issueToken(who) {
  const res = await fetch(`${URL_}/rest/v1/rpc/issue_ics_token`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${who.token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const b = await res.json();
  if (!res.ok) throw new Error(`토큰 발급 실패: ${JSON.stringify(b)}`);
  return b;
}

const results = [];
function check(name, why, pass, detail = "") {
  results.push({ pass });
  console.log(`  ${pass ? "통과" : "실패"}  ${name}`);
  if (!pass) {
    console.log(`        ${why}`);
    if (detail) console.log(`        ${detail}`);
  }
}

console.log(`\n.ics 피드 검증 — ${BASE}\n`);

const a = await login(process.env.DEV_EMAIL_A);
const b = await login(process.env.DEV_EMAIL_B);

// 테스트 일정의 주인을 찾아 소유자 / 상대를 정한다
const probe = await fetch(
  `${URL_}/rest/v1/events_visible?select=owner_id,title&title=like.%5B테스트%5D*`,
  { headers: { apikey: KEY, Authorization: `Bearer ${a.token}` } },
);
const rows = await probe.json();
const ownerId = rows.find((r) => r.title)?.owner_id;
const owner = ownerId === a.id ? a : b;
const partner = owner === a ? b : a;

console.log(`소유자: ${owner.email}`);
console.log(`상대  : ${partner.email}\n`);

// 상대 계정의 피드를 본다. 소유자의 일정이 어떻게 실렸는지가 관건이다.
const token = await issueToken(partner);
const feedUrl = `${BASE}/api/ics/${token}.ics`;

const res = await fetch(feedUrl);
const body = await res.text();

check("피드가 응답한다", "토큰이 유효하면 200이어야 한다", res.ok, `status=${res.status} ${body.slice(0, 120)}`);

if (!res.ok) {
  console.log("\n응답이 실패해 나머지 검사를 건너뜁니다.\n");
  process.exit(1);
}

// ── 유출 검사 — 가장 중요 ────────────────────────────────────
check(
  "상대의 '시간만' 일정 제목이 없다",
  "제목이 실리면 잠금화면에 그대로 뜬다",
  !body.includes("병원 예약"),
  "'[테스트] 병원 예약'이 발견됨",
);
check(
  "상대의 '시간만' 일정이 '일정 있음'으로 실린다",
  "행 자체는 있어야 바쁜 시간이 전달된다",
  /일정 있음/.test(body),
);
check(
  "상대의 비공개 일정이 아예 없다",
  "비공개는 발행하지 않는다",
  !body.includes("선물 사러"),
  "'[테스트] 선물 사러'가 발견됨",
);
check(
  "함께 일정에 [함께] 접두어가 붙는다",
  "캘린더 앱에는 색이 없어 접두어가 유일한 구분 수단이다",
  body.includes("[함께]"),
);
check(
  "상대의 전체공개 일정에 애칭 접두어가 붙는다",
  "누구 일정인지 구분돼야 한다",
  /SUMMARY:\[[^\]]+\] .*팀 회의/.test(body.replace(/\r\n /g, "")),
);

// ── 형식 검사 ────────────────────────────────────────────────
check("줄바꿈이 CRLF다", "LF만 쓰면 일부 캘린더가 파일을 거부한다", body.includes("\r\n"));
check("VCALENDAR로 감싸여 있다", "형식이 깨지면 구독 자체가 안 된다",
  body.startsWith("BEGIN:VCALENDAR") && body.trimEnd().endsWith("END:VCALENDAR"));
check("UID가 일정마다 있다", "UID가 바뀌면 캘린더에 중복이 생긴다", /UID:evt-/.test(body));
check("알림(VALARM)이 들어 있다", "OS 캘린더 알림이 이 앱 알림 전략의 핵심이다",
  body.includes("BEGIN:VALARM"));

const long = body.split("\r\n").find((l) => Buffer.byteLength(l, "utf8") > 75);
check("모든 줄이 75옥텟 이하다", "한글이 들어가면 금방 넘긴다. 접기가 필요하다",
  !long, long ? `${Buffer.byteLength(long ?? "", "utf8")}옥텟: ${long?.slice(0, 60)}` : "");

// ── ETag ─────────────────────────────────────────────────────
const etag = res.headers.get("etag");
check("ETag를 반환한다", "없으면 두 사람만 써도 첫 달에 무료 한도를 넘긴다", !!etag, `etag=${etag}`);

if (etag) {
  const again = await fetch(feedUrl, { headers: { "If-None-Match": etag } });
  const againBody = await again.text();
  check("If-None-Match에 304로 답한다", "안 바뀐 파일을 하루 190번 새로 보내면 안 된다",
    again.status === 304, `status=${again.status}`);
  check("304 응답의 본문이 0바이트다", "본문을 보내면 304의 의미가 없다",
    againBody.length === 0, `${againBody.length}바이트`);
}

check("Cache-Control이 private이다", "공유 캐시에 저장되면 안 되는 데이터다",
  (res.headers.get("cache-control") ?? "").includes("private"));

// ── 토큰 무효화 ──────────────────────────────────────────────
await issueToken(partner); // 재발급하면 이전 토큰은 즉시 무효
const revoked = await fetch(feedUrl);
check("재발급 후 이전 주소가 404다", "주소가 새어나갔을 때 유일한 대응 수단이다",
  revoked.status === 404, `status=${revoked.status}`);

const failed = results.filter((r) => !r.pass).length;
console.log();
if (failed) {
  console.log(`${results.length - failed} 통과, ${failed} 실패 — 구독하지 마세요.\n`);
  process.exit(1);
}
console.log(`${results.length}개 전부 통과.`);
console.log("사양대로 만들어도 클라이언트마다 해석이 다릅니다.");
console.log("아이폰·구글 캘린더에서 실제로 구독해 눈으로 확인하세요.\n");
