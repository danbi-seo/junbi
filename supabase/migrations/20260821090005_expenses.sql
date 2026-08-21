-- 0005 지출 · 정산
-- 근거: docs/06-data-model.md, docs/20-expenses.md

create type split_type as enum ('half','payer_all','custom');

create table expenses (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references couples(id) on delete cascade,
  event_id      uuid references events(id) on delete set null,
  payer_id      uuid not null references auth.users(id) on delete cascade,
  -- 금액은 bigint 원 단위 정수. numeric이나 float을 쓰면 반올림에서 1원씩
  -- 어긋나고, 커플 정산에서 1원 차이는 실제로 화제가 된다.
  amount        bigint not null check (amount > 0),
  currency      char(3) not null default 'KRW',
  split         split_type not null default 'half',
  payer_ratio   smallint default 50 check (payer_ratio between 0 and 100),
  category      text,
  memo          text check (char_length(memo) <= 200),
  silent        boolean not null default false,   -- 이 건만 상대에게 알리지 않기
  occurred_at   timestamptz not null default now(),
  settlement_id uuid,                     -- 정산되면 채워진다
  created_at    timestamptz not null default now()
);

create table settlements (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples(id) on delete cascade,
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  amount     bigint not null check (amount > 0),
  settled_at timestamptz not null default now(),
  memo       text
);

alter table expenses add constraint expenses_settlement_fk
  foreign key (settlement_id) references settlements(id) on delete set null;

create index expenses_unsettled_idx
  on expenses (couple_id) where settlement_id is null;
