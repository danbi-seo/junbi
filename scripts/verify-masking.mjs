/**
 * 접근 권한 검증 — 로그인한 두 계정 (docs/06-data-model.md 시나리오 2~17)
 *
 * 실행: npm run verify:masking
 *
 * .env.local에 개발 계정 정보가 필요하다.
 *   DEV_EMAIL_A / DEV_EMAIL_B / DEV_PASSWORD
 *
 * 어느 쪽이 슬롯 a인지 가정하지 않는다. 테스트 일정의 주인을 찾아
 * '소유자'와 '상대'로 나눈다. 계정을 다시 만들어 순서가 바뀌어도 동작한다.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const EMAIL_A = process.env.DEV_EMAIL_A
const EMAIL_B = process.env.DEV_EMAIL_B
const PASSWORD = process.env.DEV_PASSWORD

if (!URL_ || !KEY || !EMAIL_A || !EMAIL_B || !PASSWORD) {
  console.error('.env.local에 NEXT_PUBLIC_SUPABASE_* 와 DEV_EMAIL_A / DEV_EMAIL_B / DEV_PASSWORD가 필요합니다.')
  process.exit(1)
}

async function login(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${email} 로그인 실패: ${body.msg ?? body.error_description}`)
  return { token: body.access_token, id: body.user.id, email }
}

async function q(who, pathname) {
  const res = await fetch(`${URL_}/rest/v1/${pathname}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${who.token}` },
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body, denied: res.status === 401 || res.status === 403 }
}

const results = []
function check(name, why, pass, detail) {
  results.push({ name, why, pass, detail })
  console.log(`  ${pass ? '통과' : '실패'}  ${name}`)
  if (!pass) {
    console.log(`        ${why}`)
    console.log(`        ${detail}`)
  }
}

console.log('\n접근 권한 검증 — 로그인한 두 계정')

const one = await login(EMAIL_A)
const two = await login(EMAIL_B)

// 테스트 일정의 주인이 누구인지 찾아 역할을 정한다.
const probe = await q(one, 'events_visible?select=owner_id,title&title=like.%5B테스트%5D*')
const ownerId = probe.body?.find((e) => e.title)?.owner_id
const owner = ownerId === one.id ? one : two
const partner = owner === one ? two : one

console.log(`소유자: ${owner.email}`)
console.log(`상대  : ${partner.email}\n`)

// ── 시나리오 2·3 — 일정 마스킹 ────────────────────────────────
const mine = await q(owner, `events_visible?select=title,emoji,visibility,is_masked&owner_id=eq.${owner.id}`)
// 상대가 '소유자의' 일정을 어떻게 보는지만 확인한다.
// 자기 비공개 일정은 당연히 자기에게 보인다 — 그걸 유출로 잡으면 안 된다.
const theirs = await q(
  partner,
  `events_visible?select=title,emoji,visibility,is_masked,owner_id&owner_id=eq.${owner.id}&order=starts_at`,
)

check(
  '소유자는 자기 일정에 마스킹이 걸리지 않는다',
  '자기 일정은 제목이 항상 보여야 한다',
  (mine.body?.length ?? 0) > 0 && mine.body.every((e) => e.title && !e.is_masked),
  `${mine.body?.length}건 / ${JSON.stringify(mine.body)?.slice(0, 200)}`,
)

const seen = theirs.body ?? []
// 개수로 검사하지 않는다. 실제로 쓰다 보면 일정이 늘어나 매번 깨진다.
// 지켜야 하는 건 "비공개가 한 건도 없다"는 불변식이다.
check(
  '상대에게 비공개 일정이 보이지 않는다 (시나리오 2)',
  '비공개는 행 자체가 나가면 안 된다',
  seen.length > 0 && !seen.some((e) => e.visibility === 'private'),
  `소유자 일정 ${seen.length}건 중 비공개 ${seen.filter((e) => e.visibility === 'private').length}건 — ${JSON.stringify(seen.filter((e) => e.visibility === 'private'))}`,
)

const masked = seen.find((e) => e.is_masked)
check(
  "상대에게 '시간만' 일정의 제목이 가려진다 (시나리오 3)",
  '행은 보이되 제목은 null이어야 한다',
  !!masked && masked.title === null,
  `masked=${JSON.stringify(masked)}`,
)

check(
  '가려진 일정에 이모지가 붙지 않는다',
  '제목을 가려도 🏥가 보이면 병원 간다는 게 드러난다',
  !!masked && masked.emoji === null,
  `emoji=${masked?.emoji}`,
)

// ── 시나리오 4 — 원본 테이블 우회 ─────────────────────────────
const raw = await q(partner, 'events?select=id,title')
check(
  '상대가 events 원본을 직접 읽을 수 없다 (시나리오 4)',
  '뷰를 건너뛰면 마스킹이 무의미해진다',
  raw.denied,
  `status=${raw.status} ${JSON.stringify(raw.body)?.slice(0, 120)}`,
)

// ── 시나리오 5·6·7c·7d·13 — 짝 조회 정책이 없어야 하는 것 ──────
const cases = [
  ['cycles', '주기 원본은 짝에게도 안 나간다 (시나리오 5)', 'cycles?select=id'],
  ['calendar_accounts', '외부 캘린더 토큰 (시나리오 6)', 'calendar_accounts?select=id'],
  ['ics_tokens', '.ics 비밀 URL (시나리오 13)', 'ics_tokens?select=token'],
  ['notification_queue', '알림 본문', 'notification_queue?select=id'],
]
for (const [name, why, p] of cases) {
  const r = await q(partner, p)
  check(`상대가 ${name}를 읽을 수 없다`, why, r.denied || (Array.isArray(r.body) && r.body.length === 0), `status=${r.status} ${JSON.stringify(r.body)?.slice(0, 120)}`)
}

// 본인 것만 보여야 하는 것 — 0건이 아니라 '내 것 1건'이 정답이다.
for (const [name, why, p] of [
  ['notification_prefs', '상대의 발신 설정이 보이면 끄는 게 추궁 대상이 된다 (시나리오 7c)', 'notification_prefs?select=user_id'],
  ['routines', '주 단위 스케줄이 보이면 대조가 가능해진다 (시나리오 7d)', 'routines?select=id,user_id'],
]) {
  const r = await q(partner, p)
  const rows = Array.isArray(r.body) ? r.body : []
  check(
    `${name}에 내 것만 보인다`,
    why,
    rows.every((row) => row.user_id === partner.id),
    `${rows.length}건 / ${JSON.stringify(rows).slice(0, 160)}`,
  )
}

// ── 상태 · 루틴 (docs/15-presence.md) ────────────────────────
{
  const rpc = async (who, fn, body) => {
    const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }

  // 루틴 원본은 짝에게 나가지 않는다
  const raw = await q(partner, `routines?select=id,user_id`)
  const rows = Array.isArray(raw.body) ? raw.body : []
  check(
    '루틴 원본에 내 것만 보인다',
    '주 단위 스케줄이 보이면 "화요일 8시에 왜 집에 없어?" 같은 대조가 가능해진다',
    rows.every((r) => r.user_id === partner.id),
    JSON.stringify(rows).slice(0, 160),
  )

  // 계산된 상태는 짝에게 나간다
  const ok = await rpc(partner, 'current_statuses', { p_user: owner.id })
  check(
    '계산된 지금 상태는 짝이 읽을 수 있다',
    '루틴 원본은 숨기고 결과만 보여준다',
    ok.status === 200 && Array.isArray(ok.body),
    `status=${ok.status}`,
  )

  // 남의 상태는 못 읽는다
  const nope = await rpc(partner, 'current_statuses', {
    p_user: '00000000-0000-0000-0000-000000000000',
  })
  check(
    '짝이 아닌 사람의 상태는 0건이다',
    '본인과 짝만 조회할 수 있어야 한다',
    Array.isArray(nope.body) && nope.body.length === 0,
    JSON.stringify(nope.body),
  )

  // 상태 이력 테이블이 없어야 한다
  const hist = await q(partner, 'status_history?select=id')
  check(
    '상태 이력 테이블이 없다',
    '상태 로그를 쌓으면 "몇 시에 집에 왔는지"가 시계열로 남는다. 행동 감시 기록이다',
    hist.status === 404 || hist.status === 400,
    `status=${hist.status}`,
  )
}

// ── 시나리오 17 — 애칭은 보여도 무해 ──────────────────────────
const prof = await q(partner, 'profiles?select=id,name,pet_name_for_partner')
check(
  '짝 프로필을 읽을 수 있다 (시나리오 17)',
  '애칭 표시와 페어링 확인에 필요하다. 실명은 화면에 쓰지 않는 것으로 다룬다',
  Array.isArray(prof.body) && prof.body.length === 2,
  `${prof.body?.length}건`,
)

// ── 결과 ─────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass).length
console.log()
if (failed) {
  console.log(`${results.length - failed} 통과, ${failed} 실패 — 배포하지 마세요.`)
  process.exit(1)
}
console.log(`${results.length}개 전부 통과.\n`)
