import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * 요청마다 세션을 갱신한다.
 *
 * Next.js 16에서 middleware가 proxy로 이름이 바뀌었다.
 * 파일명도 함수명도 proxy여야 한다. edge 런타임은 지원하지 않는다.
 * → node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 *
 * 서버 컴포넌트는 쿠키를 쓸 수 없으므로, 만료가 임박한 토큰을 새로 발급받아
 * 쿠키에 심는 일은 여기서만 할 수 있다. 이게 없으면 한 시간쯤 뒤에
 * 조용히 로그아웃된다.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // getUser()를 호출해야 토큰 갱신이 일어난다. 호출 자체가 목적이다.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 로그인하지 않았으면 로그인 화면으로. 로그인 화면 자신은 예외다.
  const { pathname } = request.nextUrl
  // /auth/callback은 세션을 '만드는' 자리라 반드시 열려 있어야 한다.
  // 막으면 메일 링크가 로그인 화면으로 튕기고 영영 로그인할 수 없다.
  // /api/*는 각자 자기 방식으로 인증한다.
  //   /api/ics    비밀 토큰 (캘린더 앱은 로그인을 못 한다)
  //   /api/push   CRON_SECRET (cron이 부른다)
  // 세션 검사로 막으면 둘 다 동작하지 않는다.
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/')

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    // 초대 링크(/j/ABCDEF)로 들어온 사람은 로그인 뒤 그리로 돌아가야 한다.
    // 안 그러면 코드가 사라져서 링크를 다시 받아야 한다.
    if (pathname !== '/') {
      url.searchParams.set('next', pathname + request.nextUrl.search)
    }
    return NextResponse.redirect(url)
  }

  if (user && pathname.startsWith('/login')) {
    const next = request.nextUrl.searchParams.get('next')
    const url = request.nextUrl.clone()
    // 열린 리다이렉트를 막는다. 우리 앱 안의 경로만 따라간다.
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
    const [path, query] = safe.split('?')
    url.pathname = path
    url.search = query ? `?${query}` : ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // 정적 파일과 이미지 최적화 요청은 건너뛴다.
    // 매 요청마다 세션을 확인하면 느려지고, 어차피 보호할 대상이 아니다.
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
