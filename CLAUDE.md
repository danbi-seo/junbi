@AGENTS.md

# JUNBI — 커플 일정 공유 PWA

커플이 **일정 · 할 일 · 가고 싶은 곳 · 쓴 돈 · 지금 상태**를 한 곳에서 나누되,
각자 어디까지 공개할지는 본인이 정한다.

전체 설계는 `docs/`에 있다. **기능을 만들기 전에 해당 문서를 먼저 열 것.**
`docs/README.md`가 목차이고, 번호가 곧 개발 순서다.

> **`docs/01~22`와 `docs/README.md`는 커밋하지 않는다.** 예시 문구에 이름·애칭이
> 들어 있어 로컬(OneDrive 동기화)에만 둔다. 레포에 없다고 문서가 없는 게 아니다.
> `.gitignore` 참고. 커밋되는 것은 이 파일과 `docs/decisions.md`뿐이다.

판단이 갈린 지점은 `docs/decisions.md`에 한 줄씩 쌓는다. **문서와 어긋나면 그쪽이 최신이다.**

## 형태 · 스택

| | |
|---|---|
| 형태 | **PWA만.** 스토어 배포·네이티브 코드 0줄. 위젯은 `.ics` 구독으로 대체 |
| 앱 | Next.js 16 (App Router) + TypeScript + Tailwind v4 |
| 백엔드 | Supabase — Postgres · Auth · Realtime · Edge Functions · pg_cron |
| 인증 | 카카오 로그인(인증 전용) + 이메일 OTP 보조 |
| 알림 | 표준 웹 푸시(VAPID) + `.ics`의 VALARM(OS 캘린더 알림) |
| 지도 | 카카오 로컬 API + 카카오맵 JS SDK |
| 배포 | Vercel `hnd1`(도쿄) · Supabase `ap-northeast-1`(도쿄) |

**웹 푸시가 Node 런타임을 요구해서 Vercel을 쓴다.** 발송 라우트에 `export const runtime = 'nodejs'`.

### 되돌릴 수 없는 고정값 — 바꾸지 말 것

```
Supabase 리전 ap-northeast-1   생성 후 변경 불가
Vercel 리전   hnd1             Supabase와 반드시 동일 (대시보드 + vercel.json 양쪽)
VAPID 공개 키                  바꾸면 푸시 구독 전부 무효
.ics UID 규칙                  바뀌면 캘린더 앱에 중복 생성
profiles에 성별 컬럼 없음      슬롯(a/b) 방식 유지
.ics 대상 데이터는 소프트 삭제  하드 삭제하면 ETag가 과거로 되돌아감
pg_cron 주기 5분               1분 아님
```

## 알림의 두 갈래 — 이 설계의 핵심

```
.ics 구독  →  기본 캘린더 앱
              ├─ 홈·잠금화면 위젯      (위젯 대체)
              └─ 일정 임박·기념일 알림  (OS가 처리. 매우 안정적)

웹 푸시    →  등록·제안·정산·상태      (즉시성이 필요한 것)
```

일정 임박 알림은 **웹 푸시가 아니라 `.ics` VALARM**이 담당한다. 푸시가 실패해도 약속을 놓치지 않는다.

## 절대 규칙

실수하면 **유출**이다. 다른 건 회복되지만 이건 안 된다. → `docs/04-checklist.md` B

```
RLS
[ ] 새 테이블을 만들면 반드시 RLS를 켠다 (안 켜면 전면 공개)
[ ] events_visible 뷰에 security_invoker = true
[ ] events의 authenticated select 권한은 revoke
[ ] 모든 security definer 함수에 set search_path = public

짝 조회 정책이 없어야 하는 테이블
[ ] cycles              주기 원본. 파생값만 partner_health() RPC로
[ ] routines            스케줄 표. 계산된 현재 상태만
[ ] notification_prefs  발신 설정. 끄는 게 추궁 대상이 되면 안 됨

정책이 0개여야 하는 테이블 (service_role 전용)
[ ] calendar_accounts   외부 캘린더 토큰
[ ] ics_tokens
[ ] notification_queue

마스킹이 안 걸리는 세 경로 — 코드로 직접 막을 것
[ ] Realtime  events payload를 쓰지 않고 뷰에서 재조회한다
              cycles·conditions는 publication에 넣지 않는다
[ ] .ics      service_role로 돌아 RLS·뷰가 안 걸린다. 마스킹을 SQL에 직접
[ ] 알림      본문에 상대 busy 제목·건강 정보·금액을 넣지 않는다
```

### 설계 원칙 11

1. 가입만큼 나가기도 쉬워야 한다 — 연결 해제·탈퇴는 앱 안에서 끝난다
2. 한쪽 의사만으로 끊긴다 — 해제에 상대 동의를 요구하지 않는다
3. 권한은 DB에서 막는다 — 화면에서만 감춘 것은 막은 게 아니다
4. 색으로만 구분하지 않는다 — 위치·형태·이모지를 함께 쓴다
5. 성별로 코딩하지 않는다 — 색·라벨은 슬롯에, 주기 모듈은 선택 활성화로
6. 수집하지 않은 정보는 유출될 수 없다 — 성별·전화번호·GPS·사진·금융정보를 받지 않는다
7. 끄는 행위에 대가가 없어야 한다 — 공유를 끌 때 상대에게 알리지 않는다
8. 감시 도구가 될 기능은 만들지 않는다 — 자동 위치 감지, 접속 시각 노출, 상태 이력
9. 양쪽이 확인해야 연결된다 — 링크가 새어도 마지막에 막을 수 있게
10. 몸 상태로 만든 판단은 본인 화면에만 — 상대에게는 본인이 켠 것만
11. 알림은 보내는 쪽과 받는 쪽이 각각 정한다 — 둘 다 켜져야 간다

## 코드 규약

**한 곳에만 두는 함수** — 화면마다 따로 계산하면 어딘가에서 샌다.

```ts
kindOf(event, me)        // 'shared' | 'mine' | 'partner' | 'partner_busy'
STYLE[kind]              // 렌더링에서 visibility를 직접 보지 말 것
partnerLabel(me, partner) // 내 애칭 → 상대 표시 이름 → 이름
hon(label) => `${label}님`
```

**일정은 항상 `events_visible` 뷰에서 읽는다.** 원본 `events`는 select 권한이 없다.
`couple_id` 조건을 쿼리에 넣지 않는다 — RLS가 이미 거른다.

**호칭은 `애칭 + 님` 고정.** 받침이 ㅁ으로 고정돼 조사 분기가 사라지고 이모지·영문 애칭도 깨지지 않는다.
문장에는 붙이고(`주뇨님이 일정을 추가했어요`) 라벨·칩에는 안 붙인다(`🐻 주뇨`).
실명(`name`)은 **누구와 연결돼 있는지 확인하는 자리에만** 나온다 — 페어링 확인 화면과
`설정 → 연결`의 상대 줄, 둘뿐이다. 애칭은 내가 붙인 이름이라 확인에 쓸 수 없다.
달력·알림·잠금화면·`.ics`에는 애칭만 나간다.

**자주 틀리는 계산**

```
100일   = started_on + 99      만난 날이 1일째
1주년   = 365일이 아니라 날짜 기준 (윤년)
금액    = bigint 원 단위 정수   반올림에서 1원씩 어긋남
홀수 반반 = 결제자가 더 내는 쪽으로 버림
종일 .ics = DTEND가 다음 날
배란    = 다음 예정일 − 14 (거꾸로). 앞으로 세면 틀림
루틴    = 자정을 넘기는 23:00–07:00이 동작해야 함
```

**실선 / 점선 규칙은 앱 전체가 공유한다.** 실선 = 확정·본인이 쓴 것, 점선 = 추정·마스킹.

## 디렉터리 (목표 구조)

```
app/
  (auth)/login/
  (app)/  page.tsx(메인) day/[date] month free places lists expenses dday health settings
  pair/
  api/  account · ics/[token] · push/send · google/{start,callback} · places/resolve
  manifest.ts
public/  sw.js · offline.html · icons/
components/
lib/  supabase/{client,server}.ts · events.ts · push.ts · ics.ts · lunar.ts · install.ts
supabase/  migrations/ · functions/{calendar-sync,schedule-reminders,purge}/
docs/
```

`ios/`와 `android/`는 없다. 네이티브 코드 0줄.

## Next.js 16 — 설계 문서와 다른 지점

`docs/`의 코드 예시는 Next 15 이전 기준이다. 실제 구현은 `node_modules/next/dist/docs/`를 따를 것.

| 문서 | 실제 (Next 16) |
|---|---|
| `{ params }: { params: { token: string } }` | **`params`는 Promise.** `await params` 또는 `RouteContext<'/api/ics/[token]'>` |
| `cookies()` / `headers()` 동기 접근 | **전부 async** |
| `middleware.ts` | **`proxy.ts`** + `export function proxy()`. edge 런타임 미지원 |
| `next dev --turbopack` | Turbopack이 기본 |
| `next lint` | ESLint CLI (`package.json`은 이미 `eslint`) |
| `revalidateTag('x')` | `revalidateTag('x', 'max')` — 두 번째 인자 필수 |

`export const runtime = 'nodejs'`(푸시 발송 라우트)와 `app/manifest.ts`는 그대로 유효하다.

## 개발 순서

```
0  뼈대        Supabase·Vercel·마이그레이션·SQL로 계정 두 개 연결   주말 2회
1  일정 코어   생성/수정/삭제 · 네 가지 스타일 · 이음새/월 뷰       2~3주
2  앱 밖으로   PWA 설치 · .ics 발행 + ETag                          1주   ← 핵심 가설
3  알림        VAPID · 큐 · 두 축 설정 · 고정 알림                  1~2주
4  함께 쓰는 것 D-day · 상태/루틴 · 체크리스트 · 장소                3~4주
5  계산        빈 시간 찾기(DB 함수) · 구글 캘린더 연동             3~4주
6  민감한 것   컨디션·주기 · 지출/정산                              3~4주
7  확장        카카오 로그인 · 페어링 UI · 해제/탈퇴 · 처리방침      3~4주
```

**현재 0단계 시작 전.** Next.js 스캐폴드와 `.gitignore`만 있다.

0단계에서 **페어링 UI를 만들지 않는다.** 두 계정 연결은 SQL 한 줄이다.
2단계를 앞당긴 이유는 ".ics 구독이 번거로워 아무도 안 한다"면 위젯 대체 전략 자체가 실패이고,
그걸 4개월 뒤에 알면 늦기 때문이다.

## 작업 전 확인

```
[ ] 만드는 기능의 원 문서를 읽었다 (docs/ 번호)
[ ] 새 테이블에 RLS를 켰다
[ ] 새 security definer 함수에 search_path를 고정했다
[ ] 상대에게 나가는 경로(뷰·RPC·.ics·알림·Realtime)를 전부 확인했다
[ ] 판단이 갈린 지점을 docs/decisions.md에 한 줄 남겼다
```

배포 전 점검은 `docs/04-checklist.md` D, 검증 시나리오 17개는 `docs/06-data-model.md` 마지막에 있다.
