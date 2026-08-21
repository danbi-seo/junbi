-- 0015 실시간 신호 테이블
--
-- 문제 1: events는 authenticated에게 select 권한이 없다(마스킹 때문).
--         Realtime도 같은 권한을 보므로 변경 알림이 아예 전달되지 않는다.
--
-- 문제 2: Realtime 페이로드에는 마스킹이 적용되지 않는다. 원본 그대로 나간다.
--         설계서는 "신호로만 쓰고 뷰에서 다시 읽으라"고 하지만,
--         payload.new.title을 쓰는 건 한 줄이면 되고 아무도 못 막는다.
--         → docs/07-api.md
--
-- 해결: 내용이 없는 신호 테이블을 따로 둔다.
--       "우리 커플에게 뭔가 바뀌었다"는 사실과 시각만 담는다.
--       페이로드에 샐 것이 구조적으로 없다.

create table couple_signals (
  couple_id     uuid primary key references couples(id) on delete cascade,
  events_at     timestamptz not null default now(),
  checklists_at timestamptz,
  statuses_at   timestamptz,
  expenses_at   timestamptz
);

alter table couple_signals enable row level security;

create policy "내 커플 신호" on couple_signals
  for select using (couple_id = my_couple_id());

grant select on couple_signals to authenticated;

-- 일정이 바뀌면 신호를 올린다.
-- statement 단위로 돌아 여러 행을 한 번에 고쳐도 한 번만 발생한다.
create or replace function bump_events_signal() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_couple uuid;
begin
  if tg_op = 'DELETE' then
    select couple_id into v_couple from old_rows limit 1;
  else
    select couple_id into v_couple from new_rows limit 1;
  end if;

  if v_couple is null then return null; end if;

  insert into couple_signals (couple_id, events_at)
  values (v_couple, now())
  on conflict (couple_id) do update set events_at = now();

  return null;
end $$;

create trigger events_signal_ins
  after insert on events
  referencing new table as new_rows
  for each statement execute function bump_events_signal();

create trigger events_signal_upd
  after update on events
  referencing new table as new_rows
  for each statement execute function bump_events_signal();

create trigger events_signal_del
  after delete on events
  referencing old table as old_rows
  for each statement execute function bump_events_signal();

-- 이미 있는 커플에 신호 행을 만들어 둔다.
insert into couple_signals (couple_id)
select id from couples on conflict do nothing;

-- events는 publication에서 뺀다. 권한이 없어 어차피 전달되지 않고,
-- 나중에 권한이 열리면 마스킹 없는 원본이 그대로 나가는 위험만 남는다.
alter publication supabase_realtime drop table events;
alter publication supabase_realtime add table couple_signals;
