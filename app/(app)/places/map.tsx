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
        const icon = L.divIcon({
          className: "",
          // 다녀온 곳은 ✅. 색만으로 구분하지 않는다.
          html: `<div style="font-size:22px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${
            p.visited_at ? "✅" : c.emoji
          }</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
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

  // 목록에서 고르면 지도가 그 핀으로 움직인다
  useEffect(() => {
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
