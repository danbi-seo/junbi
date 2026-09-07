/**
 * 일정 쓰기 검증 — 만들기 · 고치기 · 지우기 (docs/06-data-model.md)
 *
 * 실행: npm run verify:events
 *
 * 이 파일이 생긴 이유:
 *   events에서 select 권한을 뺀 탓에 `update ... where id = $1`이 42501로
 *   죽었다. 만들기만 확인하고 있어서 아무도 몰랐다.
 *   쓰기는 세 갈래(생성·수정·삭제)를 모두 두드려야 한다.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.DEV_PASSWORD

if (!URL_ || !KEY || !SR || !PW) {
  console.error('.env.local에 NEXT_PUBLIC_SUPABASE_* / SUPABASE_SERVICE_ROLE_KEY / DEV_PASSWORD가 필요합니다.')
  process.exit(1)
}

async function login(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  })
  const b = await r.json()
  if (!r.ok) throw new Error(`${email} 로그인 실패: ${JSON.stringify(b)}`)
  return { token: b.access_token, id: b.user.id, email }
}

const H = (w) => ({ apikey: KEY, Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' })

async function rest(w, path, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H(w), ...init.headers } })
  const t = await r.text()
  let body = null
  try {
    body = t ? JSON.parse(t) : null
  } catch {
    body = t
  }
  return { status: r.status, ok: r.ok, body }
}

const rpc = (w, fn, args) => rest(w, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })

const results = []
function check(name, why, pass, detail) {
  results.push({ name, pass })
  console.log(`  ${pass ? '통과' : '실패'}  ${name}`)
  if (!pass) {
    console.log(`        ${why}`)
    console.log(`        ${detail}`)
  }
}

console.log('\n일정 쓰기 검증')

const A = await login(process.env.DEV_EMAIL_A)
const B = await login(process.env.DEV_EMAIL_B)
const { body: prof } = await rest(A, `profiles?select=couple_id&id=eq.${A.id}`)
const coupleId = prof[0].couple_id

const T = (h) => new Date(Date.now() + h * 3600000).toISOString()
// dev-fixtures.mjs의 '[검증]'과 겹치면 안 된다.
// 겹쳤을 때 이 파일의 뒷정리가 예시 데이터를 통째로 지웠고, 그 뒤에 도는
// 마스킹 검증이 볼 게 없어서 실패했다. 접두사를 따로 쓴다.
const TAG = `[쓰기검증] ${Date.now()}`
const admin = { apikey: SR, Authorization: `Bearer ${SR}` }

// ── 만들기 ────────────────────────────────────────────────────
const made = await rest(A, 'events', {
  method: 'POST',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({
    couple_id: coupleId, owner_id: A.id, scope: 'personal', visibility: 'full',
    title: TAG, starts_at: T(24), ends_at: T(25), all_day: false,
  }),
})
check('일정 만들기', '만들 수 없으면 앱이 성립하지 않는다', made.status === 201, `status=${made.status} ${JSON.stringify(made.body)}`)

const { body: rows } = await rest(A, `events_visible?select=id&title=eq.${encodeURIComponent(TAG)}`)
const id = rows?.[0]?.id
check('만든 일정이 뷰에 보인다', '원본은 못 읽으니 뷰로 확인한다', !!id, JSON.stringify(rows))
if (!id) process.exit(1)

/** 앱 폼이 보내는 것과 같은 전체 필드 */
const full = (over = {}) => ({
  p_id: id, p_scope: 'personal', p_visibility: 'full', p_title: TAG,
  p_emoji: null, p_memo: null, p_all_day: false, p_silent: false,
  p_starts_at: T(24), p_ends_at: T(25), ...over,
})

// ── 고치기 ────────────────────────────────────────────────────
const r1 = await rpc(A, 'update_event', full({ p_title: `${TAG} 고침`, p_emoji: '🍰', p_memo: '메모' }))
check('내 일정 고치기', '이게 42501로 죽던 것이 이번 버그다', r1.ok, `status=${r1.status} ${JSON.stringify(r1.body)}`)

const { body: after } = await rest(A, `events_visible?select=title,emoji,memo&id=eq.${id}`)
check(
  '고친 값이 실제로 들어갔다',
  '오류 없이 0행만 바뀌면 조용히 실패한다',
  after?.[0]?.title === `${TAG} 고침` && after?.[0]?.emoji === '🍰' && after?.[0]?.memo === '메모',
  JSON.stringify(after),
)

const r2 = await rpc(A, 'update_event', full({ p_scope: 'shared', p_title: `${TAG} 함께` }))
check('개인 → 함께로 바꾸기', '폼에서 누구나 하는 조작이다', r2.ok, `status=${r2.status} ${JSON.stringify(r2.body)}`)

const r3 = await rpc(B, 'update_event', full({ p_scope: 'shared', p_title: `${TAG} B가 고침` }))
check('상대가 함께 일정을 고친다', '함께 일정은 둘 다 편집할 수 있어야 한다', r3.ok, `status=${r3.status} ${JSON.stringify(r3.body)}`)

const r4 = await rpc(A, 'update_event', full({ p_scope: 'personal', p_title: `${TAG} 내것으로` }))
check('함께 → 개인으로 되돌리기', '소유자는 되돌릴 수 있어야 한다', r4.ok, `status=${r4.status} ${JSON.stringify(r4.body)}`)

// ── 막혀야 하는 것 ────────────────────────────────────────────
const r5 = await rpc(B, 'update_event', full({ p_title: `${TAG} 훔치기` }))
check(
  '상대가 내 개인 일정을 못 고친다',
  '고칠 수 있으면 개인 일정이 아니다',
  !r5.ok && JSON.stringify(r5.body).includes('NOT_ALLOWED'),
  `status=${r5.status} ${JSON.stringify(r5.body)}`,
)

const r6 = await rest(A, `events?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ title: '뚫기' }) })
check('테이블 직접 수정은 여전히 막힌다', 'RPC를 열었다고 원본이 열리면 안 된다', r6.status === 403, `status=${r6.status} ${JSON.stringify(r6.body)}`)

const r7 = await rest(A, 'events?select=id,title')
check('events 원본 조회는 여전히 막힌다', '마스킹은 뷰에서만 통과해야 한다', r7.status === 403 || r7.status === 401, `status=${r7.status}`)

const ghost = await rpc(A, 'update_event', full({ p_id: '00000000-0000-0000-0000-000000000000' }))
check(
  '없는 일정은 NOT_ALLOWED',
  '조용히 성공하면 실패를 알 수 없다',
  !ghost.ok && JSON.stringify(ghost.body).includes('NOT_ALLOWED'),
  `status=${ghost.status} ${JSON.stringify(ghost.body)}`,
)

// ── ETag 밀기 ─────────────────────────────────────────────────
const { body: before } = await rest(A, `events_visible?select=updated_at&id=eq.${id}`)
await new Promise((r) => setTimeout(r, 60))
const r8 = await rpc(A, 'touch_my_events', {})
const { body: bumped } = await rest(A, `events_visible?select=updated_at&id=eq.${id}`)
check(
  'ETag 밀기',
  '임박 알림 시각을 바꾸면 .ics가 갱신돼야 한다',
  r8.ok && bumped?.[0]?.updated_at > before?.[0]?.updated_at,
  `status=${r8.status} ${before?.[0]?.updated_at} → ${bumped?.[0]?.updated_at}`,
)

// ── 지우기 ────────────────────────────────────────────────────
const r9 = await rpc(B, 'delete_event', { p_id: id })
check(
  '상대가 내 개인 일정을 못 지운다',
  '지울 수 있으면 개인 일정이 아니다',
  !r9.ok && JSON.stringify(r9.body).includes('NOT_ALLOWED'),
  `status=${r9.status} ${JSON.stringify(r9.body)}`,
)

const r10 = await rpc(A, 'delete_event', { p_id: id })
check('내 일정 지우기', '이것도 같은 이유로 죽어 있었다', r10.ok, `status=${r10.status} ${JSON.stringify(r10.body)}`)

const { body: goneView } = await rest(A, `events_visible?select=id&id=eq.${id}`)
check('지운 일정은 뷰에서 사라진다', '소프트 삭제도 화면에서는 사라져야 한다', goneView?.length === 0, JSON.stringify(goneView))

const { 0: raw } = await (await fetch(`${URL_}/rest/v1/events?select=deleted_at&id=eq.${id}`, { headers: admin })).json()
check('행은 남아 있다 (소프트 삭제)', '하드 삭제하면 .ics ETag가 과거로 되돌아간다', !!raw?.deleted_at, JSON.stringify(raw))

const r11 = await rpc(A, 'delete_event', { p_id: id })
check(
  '이미 지운 일정은 다시 못 지운다',
  '두 번 지워지면 updated_at이 계속 흔들린다',
  !r11.ok && JSON.stringify(r11.body).includes('NOT_ALLOWED'),
  `status=${r11.status} ${JSON.stringify(r11.body)}`,
)

// 뒷정리 — 이 검증이 만든 그 한 행만 지운다.
// 접두사로 지우면 다른 검증 데이터까지 쓸어 간다.
await fetch(`${URL_}/rest/v1/events?id=eq.${id}`, { method: 'DELETE', headers: admin })

const failed = results.filter((r) => !r.pass).length
console.log(`\n  ${results.length}개 중 ${results.length - failed}개 통과`)
process.exit(failed ? 1 : 0)
