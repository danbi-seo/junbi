import { createBrowserClient } from '@supabase/ssr'

/**
 * 브라우저에서 쓰는 Supabase 클라이언트.
 *
 * anon 키만 들고 간다. 이 키로는 아무것도 못 읽는다 —
 * 방어선은 RLS다 (supabase/migrations/*_rls.sql).
 *
 * 세션은 쿠키에 저장돼 서버 컴포넌트와 공유된다.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
