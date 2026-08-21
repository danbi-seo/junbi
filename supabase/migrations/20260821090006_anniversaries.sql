-- 0006 기념일 · D-day
-- 근거: docs/06-data-model.md, docs/14-anniversaries.md

create type anniv_repeat as enum ('once','yearly','day_count');

create table anniversaries (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 40),
  emoji       text,
  base_date   date not null,
  repeat      anniv_repeat not null default 'yearly',
  is_lunar    boolean not null default false,
  day_step    int,                        -- day_count일 때: 100
  pinned      boolean not null default false,
  notify_days int[] not null default '{7,1,0}',
  created_at  timestamptz not null default now()
);

-- day_count는 행을 미리 만들지 않는다. 100일·200일·300일…을 전부 행으로
-- 만들면 수백 개가 쌓인다. 조회 시 계산한다 → upcoming_anniversaries()
