/**
 * 계산 · 입력 검증 — 앱 안쪽 순수 함수들
 *
 * 실행: npm run verify:inputs
 *
 * 다른 검증 스크립트는 전부 DB를 두드린다. 그래서 **앱 코드 안에서만 도는
 * 계산**은 아무도 확인하지 않았다.
 *
 * 실제로 그 틈에서 사고가 났다. 날짜 검사 정규식에서 역슬래시가 빠져
 * `\d{4}` 가 `d{4}` 가 됐고, 모든 날짜가 형식 오류로 걸려 일정 저장이
 * 통째로 막혔다. 문법은 멀쩡한 정규식이라 빌드도 lint도 잡지 못했다.
 *
 * 여기서 확인하는 것은 CLAUDE.md가 '자주 틀리는 계산'으로 꼽은 것들이다.
 * 프레임워크에 기대지 않는 순수 함수만 다루므로 노드가 바로 부를 수 있다.
 */

import { badWhen, DATE_FORMAT, TIME_FORMAT } from "../lib/events.ts";
import { wallToInstant, instantToWall, formatDay, todayIn } from "../lib/time.ts";
import { otherOwes, won } from "../lib/expenses.ts";
import {
  upcomingAnniversaries,
  dayCountDate,
  ddayLabel,
  lunarLabel,
} from "../lib/anniversary.ts";

const results: { name: string; pass: boolean }[] = [];

function check(name: string, why: string, pass: boolean, detail: string) {
  results.push({ name, pass });
  console.log(`  ${pass ? "통과" : "실패"}  ${name}`);
  if (!pass) {
    console.log(`        ${why}`);
    console.log(`        ${detail}`);
  }
}

console.log("\n계산 · 입력 검증");

// ── 날짜·시각 형식 ────────────────────────────────────────────
{
  const good = ["2026-09-10", "1999-01-01", "2024-02-29"];
  const bad = ["", "2026-9-10", "dddd-dd-dd", "26-09-10", "2026/09/10", "오늘"];

  check(
    "정상 날짜를 받아들인다",
    "이게 깨지면 일정 저장이 통째로 막힌다. 실제로 그런 적이 있다",
    good.every((d) => DATE_FORMAT.test(d)),
    `거부된 것: ${good.filter((d) => !DATE_FORMAT.test(d)).join(", ")}`,
  );

  check(
    "잘못된 날짜를 거른다",
    "형식 검사가 헐거우면 Invalid Date가 서버까지 간다",
    bad.every((d) => !DATE_FORMAT.test(d)),
    `통과해 버린 것: ${bad.filter((d) => DATE_FORMAT.test(d)).join(", ")}`,
  );

  check(
    "정상 시각을 받아들인다",
    "시각 검사도 같은 실수가 날 수 있는 자리다",
    ["09:00", "23:59", "00:00"].every((t) => TIME_FORMAT.test(t)),
    "",
  );

  check(
    "잘못된 시각을 거른다",
    "빈 시각이 통과하면 wallToInstant가 Invalid Date를 만든다",
    ["", "9:00", "dd:dd", "밤"].every((t) => !TIME_FORMAT.test(t)),
    "",
  );
}

// ── 일정 폼 판정 ──────────────────────────────────────────────
{
  const base = {
    date: "2026-09-10",
    endDate: "2026-09-10",
    startTime: "19:00",
    endTime: "20:00",
    allDay: false,
  };

  check("온전한 입력은 통과", "평범한 일정 하나도 못 넣으면 앱이 죽은 것이다", badWhen(base) === null, `${badWhen(base)}`);
  check("빈 날짜는 NO_DATE", "안 막으면 서버 액션이 예외로 죽고 화면엔 아무 말도 안 뜬다", badWhen({ ...base, date: "" }) === "NO_DATE", `${badWhen({ ...base, date: "" })}`);
  check("빈 끝날짜도 NO_DATE", "끝날짜만 비어도 같은 일이 벌어진다", badWhen({ ...base, endDate: "" }) === "NO_DATE", `${badWhen({ ...base, endDate: "" })}`);
  check("빈 시각은 NO_TIME", "시각 칸을 지우고 저장하면 조용히 죽던 자리다", badWhen({ ...base, startTime: "" }) === "NO_TIME", `${badWhen({ ...base, startTime: "" })}`);
  check(
    "종일이면 시각을 묻지 않는다",
    "종일 일정은 시각 칸이 화면에 없다. 요구하면 저장이 불가능해진다",
    badWhen({ ...base, allDay: true, startTime: "", endTime: "" }) === null,
    `${badWhen({ ...base, allDay: true, startTime: "", endTime: "" })}`,
  );
}

// ── 시간대 ────────────────────────────────────────────────────
{
  const at = wallToInstant("2026-09-10", "19:00", "Asia/Seoul");
  check(
    "한국 19시는 UTC 10시",
    "시간대를 잘못 다루면 약속이 아홉 시간 밀린다",
    at.toISOString() === "2026-09-10T10:00:00.000Z",
    at.toISOString(),
  );

  const back = instantToWall(at.toISOString(), "Asia/Seoul");
  check(
    "되돌리면 그대로",
    "왕복에서 어긋나면 일정을 열 때마다 시각이 밀린다",
    back.date === "2026-09-10" && back.time === "19:00",
    JSON.stringify(back),
  );

  // 여행 갔을 때. 같은 시점을 다른 시간대에서 보면 날짜가 달라진다.
  const jp = instantToWall(at.toISOString(), "America/New_York");
  check(
    "다른 시간대에서는 다른 벽시계 값",
    "시간대를 무시하고 문자열만 잘라 쓰면 이게 안 맞는다",
    jp.date === "2026-09-10" && jp.time === "06:00",
    JSON.stringify(jp),
  );

  check("요일 표기", "달력과 our Day가 같은 요일을 말해야 한다", formatDay("2026-09-10") === "9월 10일 목", formatDay("2026-09-10"));
  check("todayIn이 날짜 형식을 지킨다", "여기서 어긋나면 오늘 표시가 통째로 틀어진다", DATE_FORMAT.test(todayIn("Asia/Seoul")), todayIn("Asia/Seoul"));
}

// ── 기념일 ────────────────────────────────────────────────────
{
  // 100일 = 만난 날 + 99. 만난 날이 1일째다.
  check(
    "100일은 만난 날 + 99",
    "한국에서 만난 날이 1일째다. +100으로 세면 하루 늦는다",
    dayCountDate("2026-01-01", 100) === "2026-04-10",
    dayCountDate("2026-01-01", 100),
  );
  check("1일째는 만난 날 그 자체", "기준이 어긋나면 모든 날짜가 하루씩 밀린다", dayCountDate("2026-01-01", 1) === "2026-01-01", dayCountDate("2026-01-01", 1));

  // 1주년은 365일이 아니라 날짜 기준. 윤년이 끼면 366일이다.
  const leap = upcomingAnniversaries({
    startedOn: "2023-06-14",
    rows: [],
    today: "2024-06-01",
    within: 400,
  });
  const first = leap.find((o) => o.title.includes("1주년"));
  check(
    "1주년은 날짜 기준 (윤년 포함)",
    "365를 더하면 2024년처럼 윤년이 끼었을 때 하루 어긋난다",
    first?.date === "2024-06-14",
    `${first?.title} ${first?.date}`,
  );

  check("D-0은 '오늘'", "D-0이라고 쓰면 오늘인지 내일인지 헷갈린다", ddayLabel(0) === "오늘", ddayLabel(0));
  check("지난 것은 D+", "지난 기념일에 D-3이 뜨면 방향을 알 수 없다", ddayLabel(-3) === "D+3", ddayLabel(-3));

  // 음력은 규칙이 아니라 천문 계산이다. 라이브러리가 살아 있는지 본다.
  const lunar = lunarLabel("2026-09-10");
  check("음력 변환이 동작한다", "라이브러리가 죽으면 음력 기념일이 전부 사라진다", !!lunar && lunar.startsWith("음력"), `${lunar}`);
}

// ── 금액 ──────────────────────────────────────────────────────
{
  const half = (amount: number) =>
    otherOwes({ amount, split: "half", payer_ratio: null } as never);

  check("반반은 절반", "가장 흔한 경우다", half(10000) === 5000, `${half(10000)}`);
  check(
    "홀수 반반은 결제자가 더 낸다",
    "반대로 하면 '네가 1원 더 냈네'가 된다 → docs/20-expenses.md",
    half(10001) === 5000,
    `${half(10001)}`,
  );
  check(
    "금액은 정수로만 나온다",
    "소수점이 생기면 원 단위 정수 규칙이 깨진다",
    Number.isInteger(half(10001)) && Number.isInteger(half(33333)),
    `${half(33333)}`,
  );
  check(
    "결제자 전액이면 상대는 0원",
    "0이 아니면 '내가 살게'가 정산에 잡힌다",
    otherOwes({ amount: 30000, split: "payer_all", payer_ratio: null } as never) === 0,
    "",
  );
  check("금액 표기에 쉼표", "1234567원은 읽을 수 없다", won(1234567) === "1,234,567원", won(1234567));
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n  ${results.length}개 중 ${results.length - failed}개 통과`);
process.exit(failed ? 1 : 0);
