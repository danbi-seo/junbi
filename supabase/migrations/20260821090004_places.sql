-- 0004 장소 위시리스트
-- 근거: docs/06-data-model.md, docs/16-shared-lists.md

create type place_category as enum
  ('restaurant','cafe','bar','activity','shopping','travel','other');

create table places (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  category    place_category not null default 'other',
  address     text,
  lat         double precision,
  lng         double precision,
  source_url  text,                       -- 붙여넣은 원본 링크
  map_url     text,                       -- 카카오/네이버 지도 링크
  memo        text check (char_length(memo) <= 500),
  added_by    uuid not null references auth.users(id) on delete cascade,
  visited_at  timestamptz,
  -- 별점을 둘로 나눈 이유: 두 사람 평가가 다를 수 있고 그 차이가 재밌다.
  -- 슬롯 기준이라 성별과 무관하다.
  rating_a    smallint check (rating_a between 1 and 5),
  rating_b    smallint check (rating_b between 1 and 5),
  created_at  timestamptz not null default now()
);

create index places_couple_idx on places (couple_id, category);

alter table events
  add constraint events_place_fk
  foreign key (place_id) references places(id) on delete set null;
