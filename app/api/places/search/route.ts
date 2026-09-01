import { createClient } from "@/lib/supabase/server";

// 외부 API를 부르므로 Node 런타임에서 돈다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type KakaoDoc = {
  place_name: string;
  address_name: string;
  road_address_name: string;
  category_group_name: string;
  place_url: string;
  x: string; // 경도
  y: string; // 위도
};

export type PlaceHit = {
  name: string;
  address: string;
  category: string;
  url: string;
  lat: number;
  lng: number;
};

/**
 * 장소 검색 — 카카오 로컬 API
 *
 * ⚠ 반드시 서버에서 부른다. KAKAO_REST_KEY는 서버 전용이다.
 *   클라이언트에서 부르면 키가 번들에 들어가고, 누구나 우리 할당량을 쓴다.
 *   npm run verify:bundle이 그걸 잡는다.
 *
 * 이게 없을 때는 지도 링크를 붙여넣어 좌표를 뽑는 것이 유일한 방법이었는데,
 * 카카오맵 단축 링크(kko.to/...)에는 좌표가 안 들어 있어 대부분 실패했다.
 * 이름으로 찾는 쪽이 실제로 쓰는 방식이다.
 *
 * 로그인한 사람만 부를 수 있게 막는다. 안 막으면 우리 키로 아무나
 * 장소 검색을 돌릴 수 있다.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ hits: [] });

  const key = process.env.KAKAO_REST_KEY?.trim();
  if (!key) {
    return Response.json(
      { error: "missing_env", missing: ["KAKAO_REST_KEY"] },
      { status: 500 },
    );
  }

  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", q);
  url.searchParams.set("size", "10");

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
  });

  if (!res.ok) {
    // 키가 틀렸는지 할당량인지 구별할 수 있게 상태만 넘긴다.
    // 카카오 응답 본문은 그대로 흘리지 않는다.
    return Response.json({ error: "kakao", status: res.status }, { status: 502 });
  }

  const body = (await res.json()) as { documents: KakaoDoc[] };

  const hits: PlaceHit[] = (body.documents ?? []).map((d) => ({
    name: d.place_name,
    // 도로명이 있으면 그쪽이 읽기 쉽다
    address: d.road_address_name || d.address_name,
    category: d.category_group_name,
    url: d.place_url,
    // x가 경도, y가 위도다. 순서를 뒤집으면 지도에서 바다로 간다.
    lat: Number(d.y),
    lng: Number(d.x),
  }));

  return Response.json({ hits });
}
