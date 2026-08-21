-- 0002 일정
-- 근거: docs/06-data-model.md, docs/09-ui-spec.md

create type event_scope      as enum ('shared', 'personal');
create type event_visibility as enum ('full', 'busy', 'private');
create type event_status     as enum ('confirmed', 'proposed', 'declined');
create type event_source     as enum ('local', 'google', 'ics');

create table events (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,

  scope       event_scope      not null default 'personal',
  visibility  event_visibility not null default 'busy',
  status      event_status     not null default 'confirmed',

  title       text not null check (char_length(title) between 1 and 100),
  memo        text check (char_length(memo) <= 1000),
  emoji       text check (char_length(emoji) <= 8),
  place_id    uuid,                       -- FK는 0004에서 건다
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  all_day     boolean not null default false,

  -- 외부 연동
  source        event_source not null default 'local',
  external_id   text,
  external_etag text,
  read_only     boolean not null default false,

  -- 빈 시간 계산에서 제외 (예: 종일 기념일이 하루를 통째로 막지 않게)
  blocks_time boolean not null default true,
  -- 이 일정만 상대에게 알리지 않음 (일회성 예외)
  silent      boolean not null default false,

  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint ends_after_starts check (ends_at >= starts_at),
  constraint shared_is_always_full
    check (scope = 'personal' or visibility = 'full'),
  constraint proposed_is_shared
    check (status = 'confirmed' or scope = 'shared')
);

create index events_couple_time_idx
  on events (couple_id, starts_at) where deleted_at is null;
create unique index events_external_uniq
  on events (owner_id, source, external_id)
  where external_id is not null;

-- .ics의 ETag가 max(updated_at)에 걸려 있다. update마다 자동으로 올린다.
-- 소프트 삭제(deleted_at 채우기)도 update이므로 이 트리거가 함께 처리한다.
-- 이게 없으면 지운 일정이 상대 캘린더 앱에 계속 남는다 → docs/12-ics-feed.md
create or replace function events_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger events_touch_trg
  before update on events
  for each row execute function events_touch();
