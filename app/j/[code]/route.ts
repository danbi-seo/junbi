import { NextResponse, type NextRequest } from "next/server";

/**
 * 초대 링크 — https://junbi.vercel.app/j/ABCDEF
 *
 * 짧아야 카카오톡에서 잘 보이고, 불러줄 수도 있다.
 * 코드를 쿼리로 옮겨 /pair로 넘긴다. 로그인이 필요하면 proxy가 가로채고,
 * 로그인 뒤 이 주소로 돌아오면 코드가 그대로 유지된다.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/j/[code]">,
) {
  const { code } = await ctx.params;
  const url = new URL("/pair", request.nextUrl.origin);
  url.searchParams.set("code", code.toUpperCase());
  return NextResponse.redirect(url);
}
