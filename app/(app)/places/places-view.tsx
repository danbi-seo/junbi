"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPlace,
  deletePlace,
  markVisited,
  ratePlace,
} from "@/app/actions/places";
import {
  CATEGORY,
  CATEGORIES,
  parseMapLink,
  directionsUrl,
  stars,
  type Place,
  type PlaceCategory,
} from "@/lib/places";

// Leaflet은 window에 의존한다. 서버 렌더링을 건너뛴다.
const PlaceMap = dynamic(() => import("./map").then((m) => m.PlaceMap), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full animate-pulse rounded-xl border border-line bg-card lg:h-[28rem]" />
  ),
});

type Slot = "a" | "b";

export function PlacesView({
  places,
  mySlot,
  myEmoji,
  partnerEmoji,
}: {
  places: Place[];
  mySlot: Slot | null;
  myEmoji: string;
  partnerEmoji: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<PlaceCategory | "all">("all");
  // 위시리스트가 다녀온 곳으로 가득 차면 원래 목적을 잃는다.
  const [showVisited, setShowVisited] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const shown = useMemo(
    () =>
      places.filter(
        (p) =>
          (filter === "all" || p.category === filter) &&
          (showVisited ? true : !p.visited_at),
      ),
    [places, filter, showVisited],
  );

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {/* 필터 — 핀이 30개를 넘으면 필터 없이는 지도를 못 쓴다 */}
      <div className="flex flex-wrap gap-1.5 text-sm">
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>
          전체
        </Pill>
        {CATEGORIES.map((c) => (
          <Pill key={c} active={filter === c} onClick={() => setFilter(c)}>
            {CATEGORY[c].emoji}
          </Pill>
        ))}
        <Pill active={showVisited} onClick={() => setShowVisited((v) => !v)}>
          {showVisited ? "다녀온 곳 포함" : "안 가본 곳만"}
        </Pill>
      </div>

      <PlaceMap places={shown} selectedId={selected} onSelect={setSelected} />

      {/* lg 이상에서 좌측 목록 + 우측 지도가 이상적이지만,
          지금은 세로로 쌓고 목록에서 핀을 고르면 지도가 움직인다 */}
      {shown.length === 0 ? (
        <p className="text-ash">
          {places.length === 0
            ? "아직 저장한 곳이 없어요. 가보고 싶은 곳을 넣어보세요."
            : "이 조건에 맞는 곳이 없어요."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((p) => {
            const c = CATEGORY[p.category];
            const mine = mySlot === "a" ? p.rating_a : p.rating_b;
            const theirs = mySlot === "a" ? p.rating_b : p.rating_a;
            const dir = directionsUrl(p);
            return (
              <li
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`rounded-xl border bg-card p-4 ${
                  selected === p.id ? "border-slot-a" : "border-line"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">{p.visited_at ? "✅" : c.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{p.name}</div>
                    {p.address && (
                      <div className="truncate text-xs text-ash">{p.address}</div>
                    )}
                    {p.memo && (
                      <div className="mt-1 text-xs text-ash">{p.memo}</div>
                    )}
                    {p.lat == null && (
                      <div className="mt-1 text-xs text-ash">
                        좌표가 없어 지도에는 안 떠요
                      </div>
                    )}
                  </div>
                </div>

                {/* 다녀온 곳 — 두 사람 별점을 나란히. 다른 게 재밌다. */}
                {p.visited_at && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <RateRow
                      emoji={myEmoji}
                      value={mine}
                      onPick={(n) => act(() => ratePlace(p.id, n, null))}
                      editable
                    />
                    <RateRow emoji={partnerEmoji} value={theirs} />
                    <label className="flex items-center gap-1.5 text-xs text-ash">
                      <input
                        type="checkbox"
                        checked={p.want_again ?? false}
                        onChange={(e) =>
                          act(() => ratePlace(p.id, mine, e.target.checked))
                        }
                        className="size-4"
                      />
                      또 가고 싶어요
                    </label>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  {dir && (
                    <a
                      href={dir}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-lg border border-line px-3 py-1.5"
                    >
                      길찾기
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={(e) => {
                      e.stopPropagation();
                      act(() => markVisited(p.id, !p.visited_at));
                    }}
                    className="rounded-lg border border-line px-3 py-1.5"
                  >
                    {p.visited_at ? "안 갔음으로" : "다녀왔어요"}
                  </button>
                  {p.source_url && (
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-ash underline underline-offset-4"
                    >
                      원본 링크
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!confirm("이 장소를 지울까요?")) return;
                      act(() => deletePlace(p.id));
                    }}
                    className="ml-auto text-ash underline underline-offset-4"
                  >
                    지우기
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <AddForm onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg border border-line bg-card px-4 py-3 text-sm"
        >
          ＋ 장소 추가
        </button>
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 ${
        active ? "border-slot-a bg-slot-a-bg" : "border-line text-ash"
      }`}
    >
      {children}
    </button>
  );
}

function RateRow({
  emoji,
  value,
  onPick,
  editable,
}: {
  emoji: string;
  value: number | null;
  onPick?: (n: number) => void;
  editable?: boolean;
}) {
  if (!editable) {
    return (
      <span className="text-ash">
        {emoji} {value ? stars(value) : "—"}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <span>{emoji}</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPick?.(n);
          }}
          className={value && n <= value ? "text-ink" : "text-line"}
        >
          ★
        </button>
      ))}
    </span>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [link, setLink] = useState("");
  const [coord, setCoord] = useState<{ lat?: number; lng?: number }>({});
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onLink(value: string) {
    setLink(value);
    const parsed = parseMapLink(value);
    if (parsed) {
      setCoord({ lat: parsed.lat, lng: parsed.lng });
      if (parsed.name && !name) setName(parsed.name);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const form = new FormData(e.currentTarget);
        if (coord.lat) form.set("lat", String(coord.lat));
        if (coord.lng) form.set("lng", String(coord.lng));
        start(async () => {
          const res = await addPlace(form);
          if (!res.ok) {
            setError(res.message);
            return;
          }
          onDone();
          router.refresh();
        });
      }}
      className="flex flex-col gap-4 rounded-xl border border-line bg-card p-5"
    >
      {/* 링크 붙여넣기가 주 입력이다. 한국에서 맛집 정보는 링크로 오간다. */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ash">지도 링크 붙여넣기 (선택)</span>
        <input
          name="source_url"
          value={link}
          onChange={(e) => onLink(e.target.value)}
          placeholder="카카오맵 · 네이버지도 링크"
          className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
        />
      </label>

      {coord.lat ? (
        <p className="text-xs text-ok">
          좌표를 찾았어요 ({coord.lat.toFixed(4)}, {coord.lng?.toFixed(4)}) — 지도에
          표시됩니다.
        </p>
      ) : link ? (
        <p className="text-xs leading-5 text-ash">
          이 링크에서는 좌표를 못 찾았어요. 이름만 저장하고 지도에는 안 떠요.
          아래에 좌표를 직접 넣어도 됩니다.
        </p>
      ) : null}

      <input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="이름 (예: 어니언 성수)"
        maxLength={80}
        required
        className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
      />

      <select
        name="category"
        defaultValue="restaurant"
        className="rounded-lg border border-line bg-paper px-3 py-2"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY[c].emoji} {CATEGORY[c].label}
          </option>
        ))}
      </select>

      <input
        name="address"
        placeholder="주소 (선택)"
        className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
      />

      <div className="flex gap-2">
        <input
          type="number"
          step="any"
          placeholder="위도"
          value={coord.lat ?? ""}
          onChange={(e) => setCoord((c) => ({ ...c, lat: Number(e.target.value) }))}
          className="tnum w-full rounded-lg border border-line bg-paper px-3 py-2"
        />
        <input
          type="number"
          step="any"
          placeholder="경도"
          value={coord.lng ?? ""}
          onChange={(e) => setCoord((c) => ({ ...c, lng: Number(e.target.value) }))}
          className="tnum w-full rounded-lg border border-line bg-paper px-3 py-2"
        />
      </div>

      <textarea
        name="memo"
        placeholder="메모 (선택)"
        rows={2}
        maxLength={500}
        className="rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-slot-a"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="flex-1 rounded-lg bg-slot-a px-4 py-3 font-medium text-white disabled:opacity-40"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-line px-4 py-3 text-sm"
        >
          취소
        </button>
      </div>
    </form>
  );
}
