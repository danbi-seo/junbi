import { createClient } from "@supabase/supabase-js";

/**
 * service_role 클라이언트 — 모든 RLS를 무시한다.
 *
 * ⚠ 서버 코드에서만 import할 것. 클라이언트 컴포넌트에서 부르면
 *   마스터 키가 브라우저 번들에 들어간다. npm run verify:bundle이 그걸 잡는다.
 *
 * 쓰는 곳은 인증이 불가능한 자리뿐이다.
 *   - .ics 라우트 (캘린더 앱은 로그인을 못 한다)
 *   - 탈퇴 (auth.users 삭제)
 *   - 알림 발송 (cron이 부른다)
 * 여기서는 RLS도 뷰도 안 걸리므로 마스킹을 코드에서 직접 해야 한다.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY가 없습니다. .env.local과 Vercel 환경변수를 확인하세요.",
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
