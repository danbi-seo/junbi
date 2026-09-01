"use client";

import { useEffect, useRef } from "react";
import { CATEGORY, type Place } from "@/lib/places";

/**
 * 지도 — Leaflet + OpenStreetMap
 *
 * 설계서는 카카오맵 SDK를 권하지만, 2026-07 이후 무료 쿼터가
 * '개발자 계정의 첫 번째 앱'에만 적용된다. 등록을 기다리지 않고
 * 지금 동작하는 쪽을 골랐다 → docs/decisions.md
 *
 * 지도 표시는 OSM, 장소 검색은 카카오 로컬 API(선택)로 나눈다.
 *
 * Leaflet은 window에 의존해서 서버에서 돌지 않는다.
 * useEffect 안에서 동적으로 불러온다.
 */
export function PlaceMap({
  places,
  selectedId,
  onSelect,
}: {
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<Map<string, unknown>>(new Map());
  // 지도를 다시 만들지 않고 최신 콜백만 갈아끼운다.
  // ref를 렌더 중에 쓰면 안 된다 — 효과 안에서 바꾼다.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const L = (await import("leaflet")).default;
      // Leaflet CSS는 패키지에 들어 있다. 한 번만 넣는다.
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (cancelled || !boxRef.current) return;

      const withCoord = places.filter((p) => p.lat != null && p.lng != null);
      const center: [number, number] = withCoord.length
        ? [withCoord[0].lat!, withCoord[0].lng!]
        : [37.5665, 126.978]; // 서울시청

      const map = L.map(boxRef.current, {
        center,
        zoom: withCoord.length ? 13 : 11,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);

      for (const p of withCoord) {
        const c = CATEGORY[p.category];

        /*
         * 이모지를 지도 위에 맨몸으로 올리면 안 보인다.
         *
         * 지도 타일은 색이 제각각이라(초록 공원, 회색 도로, 파란 물) 어떤
         * 배경에서도 읽히는 이모지는 없다. 그림자만으로는 부족했다.
         *
         * 흰 원으로 감싸고 아래에 꼭지를 붙여 핀처럼 만든다.
         * 원이 배경을 끊어 주므로 타일 색과 무관하게 읽힌다.
         *
         * 다녀온 곳은 ✅. 색만으로 구분하지 않는다 → 설계 원칙 4
         */
        const icon = L.divIcon({
          className: "",
          html: `
            <div style="
              position:relative;width:34px;height:44px;
              filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))
            ">
              <div style="
                width:34px;height:34px;border-radius:9999px;
                background:#fff;border:2px solid #3b2b22;
                display:flex;align-items:center;justify-content:center;
                font-size:18px;line-height:1
              ">${p.visited_at ? "✅" : c.emoji}</div>
              <div style="
                position:absolute;left:50%;top:30px;transform:translateX(-50%);
                width:0;height:0;
                border-left:6px solid transparent;
                border-right:6px solid transparent;
                border-top:10px solid #3b2b22
              "></div>
            </div>`,
          iconSize: [34, 44],
          // 핀 끝이 좌표를 가리켜야 한다. 가운데를 잡으면 실제 위치보다
          // 아래를 가리키는 것처럼 보인다.
          iconAnchor: [17, 44],
        });
        const marker = L.marker([p.lat!, p.lng!], { icon, title: p.name })
          .addTo(map)
          .on("click", () => onSelectRef.current(p.id));
        markersRef.current.set(p.id, marker);
      }

      if (withCoord.length > 1) {
        map.fitBounds(
          L.latLngBounds(withCoord.map((p) => [p.lat!, p.lng!] as [number, number])),
          { padding: [40, 40] },
        );
      }

      cleanup = () => {
        map.remove();
        markersRef.current.clear();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [places]);

  // 목록에서 고르면 지도가 그 핀으로 움직이고, 그 핀이 커진다
  useEffect(() => {
    // 고른 핀만 키우고 앞으로 뺀다. 핀이 여러 개 겹치면
    // 지도가 움직여도 어느 게 그건지 알 수 없다.
    for (const [id, m] of markersRef.current) {
      const marker = m as { getElement?: () => HTMLElement | null };
      const el = marker.getElement?.();
      // 루트 요소의 transform은 Leaflet이 위치 계산에 쓴다. 건드리면 핀이
      // 엉뚱한 데로 간다. 우리가 만든 안쪽 div만 손댄다.
      const inner = el?.firstElementChild as HTMLElement | undefined;
      if (!el || !inner) continue;
      const on = id === selectedId;
      el.style.zIndex = on ? "1000" : "";
      inner.style.transformOrigin = "50% 100%";
      inner.style.transform = on ? "scale(1.25)" : "";
    }

    if (!selectedId) return;
    const p = places.find((x) => x.id === selectedId);
    const map = mapRef.current as { setView?: (c: [number, number], z: number) => void } | null;
    if (p?.lat != null && p.lng != null && map?.setView) {
      map.setView([p.lat, p.lng], 16);
    }
  }, [selectedId, places]);

  const withCoord = places.filter((p) => p.lat != null);

  return (
    <div className="relative">
      <div
        ref={boxRef}
        className="h-72 w-full overflow-hidden rounded-xl border border-line lg:h-[28rem]"
      />
      {withCoord.length === 0 && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-paper/80 text-sm text-ash">
          좌표가 있는 장소가 아직 없어요
        </p>
      )}
    </div>
  );
}
