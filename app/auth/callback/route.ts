import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 메일 링크를 눌러 돌아왔을 때 받아주는 자리.
 *
 * 기본 경로는 6자리 코드지만, 링크 방식도 살려둔다.
 * - 메일 템플릿을 아직 안 바꿨을 때
 * - 새 계정의 첫 로그인은 'Confirm signup' 템플릿이 따로 나가는데,
 *   그쪽을 안 바꾸면 링크가 온다
 *
 * 두 형식을 모두 받는다. Supabase 버전에 따라 code 또는 token_hash로 온다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = searchParams.get("next") ?? "/";

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();

  if (code) {
    // PKCE 방식. 코드를 보낸 브라우저와 같은 브라우저에서 열어야 한다.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "signup" | "email" | "recovery" | "invite",
    });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  // 실패를 사용자 잘못처럼 쓰지 않는다 → docs/21-onboarding.md
  const url = new URL("/login", origin);
  url.searchParams.set("e", "link");
  return NextResponse.redirect(url);
}
