-- 0007 상태 · 루틴 · 컨디션 · 주기
-- 근거: docs/06-data-model.md, docs/15-presence.md, docs/19-health.md

-- 상태는 종류별로 하나씩. 여러 개가 동시에 뜬다.
create type status_kind as enum ('activity', 'condition', 'free');

create table statuses (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       status_kind not null,
  emoji      text not null,
  text       text check (char_length(text) <= 20),
  until      timestamptz not null default (now() + interval '4 hours'),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- 이력 테이블이 없는 것은 의도다. 상태 로그를 쌓으면 "몇 시에 집에 왔는지"가
-- 시계열로 남는다. 그건 행동 감시 기록이다. 현재 값만 덮어쓴다.

-- 루틴: 요일·시간대로 자동 상태를 만든다.
-- 행을 미리 만들지 않고 조회 시 계산한다 → current_statuses()
-- cron으로 9:30에 켜고 18:30에 끄는 방식은 실패 지점이 많다.
create table routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 12),
  emoji      text not null,
  days       smallint[] not null,        -- {1,2,3,4,5} 월~금. 0=일
  starts_at  time not null,
  ends_at    time not null,              -- ends < starts면 자정을 넘긴다
  enabled    boolean not null default true,
  priority   smallint not null default 0,
  created_at timestamptz not null default now()
);

create index routines_user on routines (user_id) where enabled;

-- 오늘 하루만 루틴 끄기 (휴가, 반차, 외근)
create table routine_overrides (
  user_id    uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null references routines(id) on delete cascade,
  on_date    date not null,
  primary key (user_id, routine_id, on_date)
);

-- 컨디션: 누구나 기록
create table conditions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  on_date    date not null,
  energy     smallint check (energy between 1 and 5),
  pain_areas text[],                      -- {'머리','허리'}
  memo       text check (char_length(memo) <= 300),
  created_at timestamptz not null default now(),
  unique (user_id, on_date)
);

-- 생리 주기: 선택 모듈. 켠 사람만.
-- 원본은 어떤 정책으로도 상대에게 나가지 않는다. 파생값만 RPC로 나간다.
create table cycles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end   date,                          -- null 허용. 종료를 자주 잊는다
  flow         smallint check (flow between 1 and 3),
  pain         smallint check (pain between 0 and 2),
  symptoms     text[],
  memo         text check (char_length(memo) <= 300),
  created_at   timestamptz not null default now(),
  unique (user_id, period_start),
  constraint end_after_start check (period_end is null or period_end >= period_start)
);

-- 공개 스위치: 전부 기본 꺼짐.
-- cycle_module_on이 성별 컬럼을 대신한다. 온보딩에서 "기록할까요?"를 묻고
-- 켠 사람만 기록 화면이 생긴다. 결과는 같은데 성별을 수집하지 않아도 된다.
create table health_sharing (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  cycle_module_on     boolean not null default false,   -- 기록 여부
  share_cycle         boolean not null default false,   -- 상대 공유
  share_condition     boolean not null default false,
  avoid_in_free_slots boolean not null default false,   -- 빈 시간 찾기에서 예상 기간 회피
  consented_at        timestamptz,                      -- 민감정보 별도 동의 시각
  updated_at          timestamptz not null default now()
);
