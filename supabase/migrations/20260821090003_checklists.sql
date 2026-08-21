-- 0003 공유 체크리스트
-- 근거: docs/06-data-model.md, docs/16-shared-lists.md

create type checklist_kind as enum ('date_prep','grocery','todo','free');

create table checklists (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  event_id    uuid references events(id) on delete set null,
  kind        checklist_kind not null default 'free',
  title       text not null check (char_length(title) between 1 and 60),
  emoji       text,
  archived_at timestamptz,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- 체크 상태를 boolean이 아니라 checked_at + checked_by로 두는 이유:
-- "누가 언제 체크했는지"를 보여주기 위해서다. 장보기에서 특히 유용하다.
create table checklist_items (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists(id) on delete cascade,
  text         text not null check (char_length(text) between 1 and 120),
  qty          text,                      -- '2팩', '500g' 같은 자유 표기
  assignee_id  uuid references auth.users(id) on delete set null,
  position     int not null default 0,
  checked_at   timestamptz,
  checked_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index checklist_items_list_idx on checklist_items (checklist_id, position);
