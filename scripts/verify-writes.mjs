/**
 * 쓰기 경로 검증 — 기념일 · 체크리스트 · 장소 · 루틴 · 상태 · 알림 설정
 *
 * 실행: npm run verify:writes
 *
 * 이 파일이 생긴 이유:
 *   일정 수정이 넉 달 동안 죽어 있었는데 아무도 몰랐다. 만들기만 확인했고,
 *   실패가 오류가 아니라 '0행 변경'으로 조용히 지나갔기 때문이다.
 *
 *   그래서 여기서는 호출이 성공했는지 묻지 않는다.
 *   **바꾼 값이 실제로 들어갔는지 다시 읽어서** 확인한다.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY
const PW = process.env.DEV_PASSWORD

if (!URL_ || !KEY || !SR || !PW) {
  console.error('.env.local에 NEXT_PUBLIC_SUPABASE_* / SUPABASE_SERVICE_ROLE_KEY / DEV_PASSWORD가 필요합니다.')
  process.exit(1)
}

const TAG = '[쓰기]'

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

async function rest(w, path, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${w.token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const t = await r.text()
  let body = null
  try {
    body = t ? JSON.parse(t) : null
  } catch {
    body = t
  }
  return { status: r.status, ok: r.ok, body }
}

const one = (w, path) => rest(w, path).then((r) => (Array.isArray(r.body) ? r.body[0] : null))

/** insert 후 만들어진 행을 돌려받는다. 앱도 같은 식으로 id를 받는다. */
const add = (w, table, row) =>
  rest(w, table, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) })

const patch = (w, path, row) => rest(w, path, { method: 'PATCH', body: JSON.stringify(row) })
const del = (w, path) => rest(w, path, { method: 'DELETE' })

const results = []
function check(name, why, pass, detail) {
  results.push({ name, pass })
  console.log(`  ${pass ? '통과' : '실패'}  ${name}`)
  if (!pass) {
    console.log(`        ${why}`)
    console.log(`        ${detail}`)
  }
}

console.log('\n쓰기 경로 검증')

const A = await login(process.env.DEV_EMAIL_A)
const B = await login(process.env.DEV_EMAIL_B)
const me = await one(A, `profiles?select=couple_id&id=eq.${A.id}`)
const coupleId = me.couple_id
const admin = { apikey: SR, Authorization: `Bearer ${SR}` }

// ── 기념일 ────────────────────────────────────────────────────
{
  const made = await add(A, 'anniversaries', {
    couple_id: coupleId, title: `${TAG} 기념일`, base_date: '2026-01-01',
    emoji: '🎂', repeat: 'yearly', is_lunar: false, pinned: false,
  })
  const id = made.body?.[0]?.id
  check('기념일 만들기', '만들 수 없으면 D-day가 성립하지 않는다', !!id, `status=${made.status} ${JSON.stringify(made.body)?.slice(0, 150)}`)

  if (id) {
    const r = await patch(A, `anniversaries?id=eq.${id}`, { title: `${TAG} 고침`, pinned: true })
    const now = await one(A, `anniversaries?select=title,pinned&id=eq.${id}`)
    check('기념일 고치기', '값이 실제로 바뀌어야 한다', r.ok && now?.title === `${TAG} 고침` && now?.pinned === true, `status=${r.status} ${JSON.stringify(now)}`)

    const rb = await patch(B, `anniversaries?id=eq.${id}`, { title: `${TAG} 상대가` })
    const afterB = await one(A, `anniversaries?select=title&id=eq.${id}`)
    check('상대도 기념일을 고칠 수 있다', '기념일은 커플 공용이다', rb.ok && afterB?.title === `${TAG} 상대가`, `status=${rb.status} ${JSON.stringify(afterB)}`)

    await del(A, `anniversaries?id=eq.${id}`)
    const gone = await rest(A, `anniversaries?select=id&id=eq.${id}`)
    check('기념일 지우기', '지운 것이 남아 있으면 안 된다', gone.body?.length === 0, JSON.stringify(gone.body))
  }
}

// 사귄 날
{
  const before = await one(A, `couples?select=started_on&id=eq.${coupleId}`)
  const r = await patch(A, `couples?id=eq.${coupleId}`, { started_on: '2026-02-22' })
  const after = await one(A, `couples?select=started_on&id=eq.${coupleId}`)
  check('사귄 날 고치기', '100일 계산의 기준이다', r.ok && after?.started_on === '2026-02-22', `status=${r.status} ${JSON.stringify(after)}`)
  await patch(A, `couples?id=eq.${coupleId}`, { started_on: before?.started_on })
}

// ── 체크리스트 ────────────────────────────────────────────────
{
  const made = await add(A, 'checklists', { couple_id: coupleId, created_by: A.id, kind: 'free', title: `${TAG} 목록` })
  const listId = made.body?.[0]?.id
  check('체크리스트 만들기', '만들 수 없으면 나머지가 무의미하다', !!listId, `status=${made.status} ${JSON.stringify(made.body)?.slice(0, 150)}`)

  if (listId) {
    const item = await add(A, 'checklist_items', { checklist_id: listId, text: `${TAG} 항목`, position: 0 })
    const itemId = item.body?.[0]?.id
    check('항목 넣기', 'checklist_items는 couple_id가 없어 부모를 타고 간다', !!itemId, `status=${item.status} ${JSON.stringify(item.body)?.slice(0, 150)}`)

    if (itemId) {
      const r = await patch(B, `checklist_items?id=eq.${itemId}`, { checked_at: new Date().toISOString(), checked_by: B.id })
      const now = await one(A, `checklist_items?select=checked_at,checked_by&id=eq.${itemId}`)
      check('상대가 항목을 체크한다', '함께 쓰는 목록이라 둘 다 체크할 수 있어야 한다', r.ok && !!now?.checked_at, `status=${r.status} ${JSON.stringify(now)}`)

      const ra = await patch(A, `checklist_items?id=eq.${itemId}`, { assignee_id: B.id })
      const assigned = await one(A, `checklist_items?select=assignee_id&id=eq.${itemId}`)
      check('항목 담당자 지정', '누가 할지 나눠야 한다', ra.ok && assigned?.assignee_id === B.id, `status=${ra.status} ${JSON.stringify(assigned)}`)

      await del(A, `checklist_items?id=eq.${itemId}`)
      const gone = await rest(A, `checklist_items?select=id&id=eq.${itemId}`)
      check('항목 지우기', '지운 것이 남아 있으면 안 된다', gone.body?.length === 0, JSON.stringify(gone.body))
    }

    await del(A, `checklists?id=eq.${listId}`)
    const gone = await rest(A, `checklists?select=id&id=eq.${listId}`)
    check('체크리스트 지우기', '지운 것이 남아 있으면 안 된다', gone.body?.length === 0, JSON.stringify(gone.body))
  }
}

// ── 장소 ──────────────────────────────────────────────────────
{
  const made = await add(A, 'places', {
    couple_id: coupleId, added_by: A.id, name: `${TAG} 장소`,
    category: 'restaurant', address: '성남시', lat: 37.3835, lng: 127.1324,
  })
  const id = made.body?.[0]?.id
  check('장소 만들기', '카카오 검색 결과를 저장하는 자리다', !!id, `status=${made.status} ${JSON.stringify(made.body)?.slice(0, 150)}`)

  if (id) {
    const r = await patch(A, `places?id=eq.${id}`, { visited_at: new Date().toISOString() })
    const now = await one(A, `places?select=visited_at&id=eq.${id}`)
    check('다녀온 곳 표시', '지도 핀이 ✅로 바뀐다', r.ok && !!now?.visited_at, `status=${r.status} ${JSON.stringify(now)}`)

    // 별점은 슬롯별로 나뉘어 있다(rating_a / rating_b). 두 사람 점수가
    // 다를 수 있고 그 차이가 재밌어서 나눠 뒀다. 성별과 무관하다.
    const rr = await patch(B, `places?id=eq.${id}`, { rating_b: 5, want_again: true, memo: `${TAG} 좋았어요` })
    const rated = await one(A, `places?select=rating_a,rating_b,want_again,memo&id=eq.${id}`)
    check(
      '상대가 별점을 준다',
      '함께 쓰는 목록이다. 내 칸(rating_a)은 비어 있어야 한다',
      rr.ok && rated?.rating_b === 5 && rated?.want_again === true && rated?.rating_a === null,
      `status=${rr.status} ${JSON.stringify(rated)}`,
    )

    const overRange = await patch(A, `places?id=eq.${id}`, { rating_a: 6 })
    check('별점은 1–5를 벗어날 수 없다', '범위를 벗어나면 별이 이상하게 그려진다', !overRange.ok, `status=${overRange.status}`)

    const bad = await patch(A, `places?id=eq.${id}`, { category: '없는갈래' })
    check('없는 갈래는 거부된다', 'enum이 아닌 값이 들어가면 화면이 깨진다', !bad.ok, `status=${bad.status}`)

    // lib/places.ts의 갈래와 DB enum이 어긋나면, 그 갈래를 고른 사람만
    // 저장에 실패한다. 화면에는 버튼이 멀쩡히 보이므로 원인을 알 수 없다.
    const APP_CATEGORIES = [
      'restaurant', 'cafe', 'bar', 'sports', 'culture', 'nature',
      'activity', 'shopping', 'stay', 'travel', 'date_course', 'other',
    ]
    const rejected = []
    for (const c of APP_CATEGORIES) {
      const r = await patch(A, `places?id=eq.${id}`, { category: c })
      if (!r.ok) rejected.push(c)
    }
    check(
      '앱의 12개 갈래를 DB가 모두 받는다',
      'lib/places.ts와 place_category enum이 어긋나면 그 갈래만 저장이 안 된다',
      rejected.length === 0,
      `거부된 갈래: ${rejected.join(', ') || '없음'}`,
    )

    await del(A, `places?id=eq.${id}`)
    const gone = await rest(A, `places?select=id&id=eq.${id}`)
    check('장소 지우기', '지운 것이 남아 있으면 안 된다', gone.body?.length === 0, JSON.stringify(gone.body))
  }
}

// ── 루틴 ──────────────────────────────────────────────────────
{
  const made = await add(A, 'routines', {
    user_id: A.id, label: `${TAG} 야근`, emoji: '🏢',
    days: [1, 2, 3], starts_at: '23:00', ends_at: '07:00',
  })
  const id = made.body?.[0]?.id
  check('루틴 만들기 (자정을 넘김)', '23:00–07:00이 저장돼야 한다', !!id, `status=${made.status} ${JSON.stringify(made.body)?.slice(0, 150)}`)

  if (id) {
    const r = await patch(A, `routines?id=eq.${id}`, { enabled: false })
    const now = await one(A, `routines?select=enabled&id=eq.${id}`)
    check('루틴 끄기', '끄면 상태 칩이 사라져야 한다', r.ok && now?.enabled === false, `status=${r.status} ${JSON.stringify(now)}`)

    const rb = await patch(B, `routines?id=eq.${id}`, { enabled: true })
    const afterB = await one(A, `routines?select=enabled&id=eq.${id}`)
    check('상대는 내 루틴을 못 건드린다', '루틴 원본은 본인만 본다 (설계 원칙)', afterB?.enabled === false, `status=${rb.status} ${JSON.stringify(afterB)}`)

    const skip = await rest(A, 'rpc/skip_routine_today', { method: 'POST', body: JSON.stringify({ p_routine: id }) })
    check('오늘만 끄기', '다음 날 자동으로 풀려야 한다', skip.ok, `status=${skip.status} ${JSON.stringify(skip.body)?.slice(0, 120)}`)

    await del(A, `routines?id=eq.${id}`)
    const gone = await rest(A, `routines?select=id&id=eq.${id}`)
    check('루틴 지우기', '지운 것이 남아 있으면 안 된다', gone.body?.length === 0, JSON.stringify(gone.body))
  }
}

// ── 상태 ──────────────────────────────────────────────────────
{
  const set = await rest(A, 'rpc/set_status', {
    method: 'POST',
    body: JSON.stringify({ p_kind: 'activity', p_emoji: '💼', p_text: `${TAG} 일하는 중`, p_hours: 0.5 }),
  })
  const now = await rest(A, 'rpc/current_statuses', { method: 'POST', body: JSON.stringify({ p_user: A.id }) })
  const mine = (Array.isArray(now.body) ? now.body : []).find((s) => s.kind === 'activity')
  check('상태 켜기', '상태를 못 바꾸면 메인 화면이 죽는다', set.ok && !!mine, `status=${set.status} ${JSON.stringify(now.body)?.slice(0, 150)}`)

  if (mine) {
    // 30분(0.5)이 1시간으로 반올림되던 버그가 있었다
    const mins = Math.round((new Date(mine.until) - Date.now()) / 60000)
    check('30분이 30분으로 저장된다', 'p_hours가 int면 0.5가 1시간이 된다', mins > 20 && mins <= 35, `${mins}분 뒤에 끝남`)
  }

  const theirs = await rest(B, 'rpc/current_statuses', { method: 'POST', body: JSON.stringify({ p_user: A.id }) })
  check('상대가 내 상태를 본다', '계산된 지금 상태는 짝이 읽는다', Array.isArray(theirs.body) && theirs.body.some((s) => s.kind === 'activity'), JSON.stringify(theirs.body)?.slice(0, 150))

  // 루틴에서 나온 자동 상태는 남아 있는 게 맞다. 지운 건 수동 상태다.
  // is_auto를 안 보면 검증용 루틴 때문에 헛되이 실패한다.
  const clear = await rest(A, 'rpc/clear_status', { method: 'POST', body: JSON.stringify({ p_kind: 'activity' }) })
  const after = await rest(A, 'rpc/current_statuses', { method: 'POST', body: JSON.stringify({ p_user: A.id }) })
  const stillManual = (Array.isArray(after.body) ? after.body : []).filter((s) => s.kind === 'activity' && !s.is_auto)
  check('상태 지우기', '지운 상태가 남으면 거짓말이 된다', clear.ok && stillManual.length === 0, `status=${clear.status} ${JSON.stringify(after.body)?.slice(0, 200)}`)

  // 컨디션은 '컨디션' 화면으로 옮겼다. 상태 칩으로는 새면 안 된다.
  const cond = await rest(A, 'rpc/set_status', {
    method: 'POST',
    body: JSON.stringify({ p_kind: 'condition', p_emoji: '🤒', p_text: '아픔', p_hours: 4 }),
  })
  check('상태 칩으로 컨디션을 못 만든다', '공개 스위치를 우회하는 두 번째 경로가 되면 안 된다', !cond.ok, `status=${cond.status} ${JSON.stringify(cond.body)?.slice(0, 150)}`)
}

// ── 알림 설정 ─────────────────────────────────────────────────
{
  const before = await one(A, `notification_prefs?select=*&user_id=eq.${A.id}`)
  check('알림 설정 행이 있다', '가입할 때 만들어져야 한다', !!before, JSON.stringify(before)?.slice(0, 120))

  if (before) {
    const r = await patch(A, `notification_prefs?user_id=eq.${A.id}`, { quiet_from: '23:30', quiet_to: '07:30' })
    const now = await one(A, `notification_prefs?select=quiet_from,quiet_to&user_id=eq.${A.id}`)
    check('조용한 시간 바꾸기', '못 바꾸면 밤에 알림이 온다', r.ok && now?.quiet_from?.startsWith('23:30'), `status=${r.status} ${JSON.stringify(now)}`)

    const rb = await patch(B, `notification_prefs?user_id=eq.${A.id}`, { quiet_from: '01:00' })
    const afterB = await one(A, `notification_prefs?select=quiet_from&user_id=eq.${A.id}`)
    check('상대는 내 알림 설정을 못 건드린다', '발신 설정을 남이 켜면 스위치가 무의미하다', afterB?.quiet_from?.startsWith('23:30'), `status=${rb.status} ${JSON.stringify(afterB)}`)

    await patch(A, `notification_prefs?user_id=eq.${A.id}`, {
      quiet_from: before.quiet_from, quiet_to: before.quiet_to,
    })
  }
}

// ── 뒷정리 ────────────────────────────────────────────────────
for (const t of ['anniversaries?title', 'places?name', 'checklists?title']) {
  const [table, col] = t.split('?')
  await fetch(`${URL_}/rest/v1/${table}?${col}=like.${encodeURIComponent(TAG)}*`, { method: 'DELETE', headers: admin })
}
await fetch(`${URL_}/rest/v1/routines?label=like.${encodeURIComponent(TAG)}*`, { method: 'DELETE', headers: admin })

const failed = results.filter((r) => !r.pass).length
console.log(`\n  ${results.length}개 중 ${results.length - failed}개 통과`)
process.exit(failed ? 1 : 0)
