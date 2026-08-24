/**
 * 장소 위시리스트 — docs/16-shared-lists.md B
 *
 * 링크 붙여넣기가 주 입력이다. 한국에서 맛집 정보는 카카오맵 링크나
 * 인스타 게시물로 오간다.
 *
 * 길찾기는 앱을 만들지 않고 넘긴다. 카카오맵·네이버지도가 이미 잘한다.
 */

export type PlaceCategory =
  | "restaurant"
  | "cafe"
  | "bar"
  | "activity"
  | "shopping"
  | "travel"
  | "other";

export type Place = {
  id: string;
  name: string;
  category: PlaceCategory;
  address: string | null;
  lat: number | null;
  lng: number | null;
  source_url: string | null;
  map_url: string | null;
  memo: string | null;
  added_by: string;
  visited_at: string | null;
  rating_a: number | null;
  rating_b: number | null;
  want_again: boolean | null;
};

export const CATEGORY: Record<PlaceCategory, { label: string; emoji: string }> = {
  restaurant: { label: "맛집", emoji: "🍽" },
  cafe: { label: "카페", emoji: "☕" },
  bar: { label: "술집", emoji: "🍺" },
  activity: { label: "액티비티", emoji: "🎨" },
  shopping: { label: "쇼핑", emoji: "🛍" },
  travel: { label: "여행", emoji: "✈️" },
  other: { label: "기타", emoji: "📍" },
};

export const CATEGORIES = Object.keys(CATEGORY) as PlaceCategory[];

/**
 * 붙여넣은 링크에서 좌표를 뽑아본다.
 *
 * 카카오맵·네이버지도 링크에는 좌표가 그대로 들어 있는 경우가 많다.
 * API 없이 처리되는 만큼은 여기서 처리한다.
 * 못 뽑으면 null을 돌려주고 사용자가 직접 입력한다 — 자동 추측은 하지 않는다.
 * 엉뚱한 곳이 저장되는 게 빈칸보다 나쁘다.
 */
export function parseMapLink(url: string): {
  name?: string;
  lat?: number;
  lng?: number;
} | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }

  const q = u.searchParams;
  const num = (v: string | null) => {
    // Number(null)과 Number("")은 0이다. 없는 값을 0으로 읽으면
    // 좌표가 (0,0)이 되어 아프리카 앞바다를 가리킨다.
    if (v == null || v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  // 네이버지도: ?lat=&lng= 또는 ?y=&x=
  const lat = num(q.get("lat")) ?? num(q.get("y"));
  const lng = num(q.get("lng")) ?? num(q.get("x"));

  // 카카오맵 공유 링크: /link/map/이름,위도,경도
  const kakao = u.pathname.match(/\/link\/(?:map|to)\/([^/]+)/);
  if (kakao) {
    const parts = decodeURIComponent(kakao[1]).split(",");
    if (parts.length >= 3) {
      const la = Number(parts[parts.length - 2]);
      const ln = Number(parts[parts.length - 1]);
      if (Number.isFinite(la) && Number.isFinite(ln)) {
        return { name: parts.slice(0, -2).join(",") || undefined, lat: la, lng: ln };
      }
    }
  }

  if (isKoreaCoord(lat, lng)) return { lat, lng };
  return null;
}

/** 한국 안의 좌표인지. 위경도가 뒤바뀐 입력을 걸러낸다. */
export function isKoreaCoord(lat?: number, lng?: number): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat > 32 &&
    lat < 40 &&
    lng > 124 &&
    lng < 132
  );
}

/**
 * 길찾기 — 앱이 깔려 있으면 앱으로, 아니면 웹으로.
 *
 * URL 스킴은 앱 업데이트로 자주 깨진다. 실패하면 조용히 웹으로 넘어간다.
 */
export function directionsUrl(p: Place): string | null {
  if (p.lat == null || p.lng == null) return null;
  return `https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lng}`;
}

export function mapViewUrl(p: Place): string | null {
  if (p.lat == null || p.lng == null) return p.map_url ?? p.source_url;
  return `https://map.kakao.com/link/map/${encodeURIComponent(p.name)},${p.lat},${p.lng}`;
}

/** 두 사람 별점을 나란히. 슬롯 기준이라 성별과 무관하다. */
export function stars(n: number | null): string {
  if (!n) return "";
  return "★".repeat(n) + "☆".repeat(5 - n);
}
