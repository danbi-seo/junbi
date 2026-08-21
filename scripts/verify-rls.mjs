/**
 * 접근 권한 검증 — 로그인하지 않은 외부인(docs/06-data-model.md 시나리오 1)
 *
 * 실행: npm run verify:rls
 *
 * 정책을 읽어보는 것과 실제로 뚫어보는 것은 다르다.
 * 이 스크립트는 앱과 똑같은 경로(PostgREST + anon 키)로 접근해서
 * 데이터가 나오는지 직접 확인한다.
 *
 * 두 계정(A·B)이 필요한 시나리오 2~17은 로그인이 붙은 뒤에 추가한다.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!URL_ || !KEY) {
  console.error('.env.local에 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY가 필요합니다.')
  console.error('실행: node --env-file=.env.local scripts/verify-rls.mjs')
  process.exit(1)
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

/** 응답을 세 갈래로 분류한다. */
async function probe(pathname, init = {}) {
  const res = await fetch(`${URL_}/rest/v1/${pathname}`, { ...init, headers: { ...H, ...init.headers } })
  let body
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (res.status === 401 || res.status === 403) return { kind: 'denied', res, body }
  if (!res.ok) return { kind: 'error', res, body }
  if (Array.isArray(body)) return { kind: body.length ? 'rows' : 'empty', res, body }
  return { kind: 'ok', res, body }
}

/** 안전한 결과인가. 행이 하나라도 나오면 실패다. */
const SAFE = new Set(['denied', 'empty', 'error'])

const checks = [
  {
    name: 'events 원본 직접 조회',
    why: '뷰를 건너뛰고 원본을 읽으면 마스킹이 무의미해진다',
    want: 'denied',
    run: () => probe('events?select=id,title'),
  },
  {
    name: 'events_visible 뷰 조회',
    why: '로그인 없이는 아무것도 안 보여야 한다',
    want: 'denied|empty',
    run: () => probe('events_visible?select=id'),
  },
  {
    name: 'cycles (주기 원본)',
    why: '가장 민감한 데이터. 짝에게도 안 나가는 테이블이다',
    want: 'denied|empty',
    run: () => probe('cycles?select=id'),
  },
  {
    name: 'conditions (컨디션)',
    why: '건강 정보',
    want: 'denied|empty',
    run: () => probe('conditions?select=id'),
  },
  {
    name: 'calendar_accounts (외부 캘린더 토큰)',
    why: '정책 0개. 구글 refresh token이 들어 있다',
    want: 'denied|empty',
    run: () => probe('calendar_accounts?select=id'),
  },
  {
    name: 'ics_tokens (.ics 비밀 URL)',
    why: '정책 0개. 새면 일정이 통째로 노출된다',
    want: 'denied|empty',
    run: () => probe('ics_tokens?select=token'),
  },
  {
    name: 'notification_queue',
    why: '정책 0개. 알림 본문이 들어 있다',
    want: 'denied|empty',
    run: () => probe('notification_queue?select=id'),
  },
  {
    name: 'notification_prefs (발신 설정)',
    why: '짝 조회 정책이 없어야 한다',
    want: 'denied|empty',
    run: () => probe('notification_prefs?select=user_id'),
  },
  {
    name: 'routines (루틴 원본)',
    why: '주 단위 스케줄 전체가 보이면 대조가 가능해진다',
    want: 'denied|empty',
    run: () => probe('routines?select=id'),
  },
  {
    name: 'profiles (이름·생일)',
    why: '실명이 들어 있다',
    want: 'denied|empty',
    run: () => probe('profiles?select=id,name'),
  },
  {
    name: 'partner_label() 직접 호출',
    why: 'security definer 함수. 아무 uuid나 넣어 실명을 뽑을 수 있으면 안 된다',
    want: 'denied|error',
    run: () =>
      probe('rpc/partner_label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_viewer: '00000000-0000-0000-0000-000000000000',
          p_owner: '00000000-0000-0000-0000-000000000000',
        }),
      }),
  },
  {
    name: 'events 무단 생성',
    why: '쓰기도 막혀야 한다',
    want: 'denied|error',
    run: () =>
      probe('events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couple_id: '00000000-0000-0000-0000-000000000000',
          owner_id: '00000000-0000-0000-0000-000000000000',
          title: 'QA 침입 시도',
          starts_at: new Date().toISOString(),
          ends_at: new Date().toISOString(),
        }),
      }),
  },
]

console.log('\n접근 권한 검증 — 로그인하지 않은 외부인')
console.log(`대상: ${URL_}\n`)

let failed = 0

for (const c of checks) {
  let r
  try {
    r = await c.run()
  } catch (e) {
    console.log(`  ?  ${c.name}\n     요청 실패: ${e.message}`)
    failed++
    continue
  }

  const wanted = c.want.split('|')
  const pass = SAFE.has(r.kind) && wanted.includes(r.kind)

  if (pass) {
    console.log(`  통과  ${c.name.padEnd(36)} ${r.kind} (${r.res.status})`)
  } else {
    failed++
    console.log(`  실패  ${c.name.padEnd(36)} ${r.kind} (${r.res.status})`)
    console.log(`        ${c.why}`)
    console.log(`        기대: ${c.want} / 실제: ${JSON.stringify(r.body).slice(0, 160)}`)
  }
}

console.log()
if (failed) {
  console.log(`${checks.length - failed} 통과, ${failed} 실패 — 배포하지 마세요.`)
  process.exit(1)
}
console.log(`${checks.length}개 전부 통과.`)
console.log('로그인이 붙으면 두 계정(A·B) 시나리오 2~17을 추가한다 → docs/06-data-model.md\n')
