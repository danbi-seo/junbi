import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * 서버 컴포넌트 · 서버 액션 · 라우트 핸들러에서 쓰는 Supabase 클라이언트.
 *
 * Next.js 16에서 cookies()는 async다. 동기 접근은 완전히 제거됐다.
 * → node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // 서버 컴포넌트에서는 쿠키를 쓸 수 없다.
            // 세션 갱신은 proxy.ts가 담당하므로 여기서는 무시해도 된다.
          }
        },
      },
    }
  )
}

/**
 * 로그인한 사용자를 가져온다.
 *
 * getSession()이 아니라 getUser()를 쓴다.
 * getSession()은 쿠키를 검증 없이 그대로 읽어 위조가 가능하다.
 * → docs/07-api.md
 */
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
