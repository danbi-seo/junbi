/**
 * 빌드 결과물에 서버 전용 키가 섞였는지 검사한다.
 *
 * 실행: npm run build && npm run verify:bundle
 *
 * NEXT_PUBLIC_ 접두어가 곧 "공개해도 되는 것"의 기준이다.
 * 접두어가 없는 값이 .next/static에서 발견되면 그 키는 이미 브라우저로 나간
 * 것이고, 재발급 외에 대응이 없다 → docs/05-setup.md
 *
 * 서버 전용 키를 클라이언트 컴포넌트에서 실수로 import하면 여기서 잡힌다.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const STATIC = path.join(ROOT, '.next', 'static')

if (!fs.existsSync(STATIC)) {
  console.error('.next/static이 없습니다. npm run build를 먼저 실행하세요.')
  process.exit(1)
}

// 값이 짧으면 우연히 일치할 수 있다. 의미 있는 길이만 검사한다.
const MIN_LEN = 12

const secrets = []
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith('NEXT_PUBLIC_')) continue
  if (!/(KEY|SECRET|TOKEN|PASSWORD|DB_URL)$/.test(k)) continue
  const value = (v ?? '').trim()
  if (value.length < MIN_LEN) continue
  secrets.push({ key: k, value })
}

if (!secrets.length) {
  console.log('\n검사할 서버 전용 키가 .env.local에 아직 없습니다.')
  console.log('service_role · VAPID · CRON_SECRET이 채워지면 다시 실행하세요.\n')
  process.exit(0)
}

/** .next/static 아래 모든 파일 */
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}

console.log(`\n번들 검사 — 서버 전용 키 ${secrets.length}개`)

const hits = []
for (const file of walk(STATIC)) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const s of secrets) {
    if (text.includes(s.value)) hits.push({ key: s.key, file: path.relative(ROOT, file) })
  }
}

for (const s of secrets) {
  const found = hits.filter((h) => h.key === s.key)
  if (found.length) {
    console.log(`  유출  ${s.key}`)
    for (const f of found.slice(0, 3)) console.log(`        ${f.file}`)
  } else {
    console.log(`  통과  ${s.key}`)
  }
}

console.log()
if (hits.length) {
  console.log('브라우저 번들에 서버 키가 들어갔습니다. 해당 키를 전부 재발급하세요.')
  process.exit(1)
}
console.log('서버 전용 키가 번들에 없습니다.\n')
