-- 0032 파기할 때 신호 트리거가 되살아나는 것을 막는다
--
-- 증상: '지금 바로 모두 삭제'와 야간 파기가 23503으로 실패한다.
--
--   insert or update on table "couple_signals" violates foreign key constraint
--   Key (couple_id)=(…) is not present in table "couples"
--
-- 원인:
--   delete from couples → FK cascade로 events·expenses·places…가 지워진다
--   그 삭제가 after delete 트리거를 깨우고, 트리거는 couple_signals에
--   insert … on conflict do update를 한다
--   그런데 부모 couples 행은 같은 트랜잭션에서 이미 사라졌으므로 FK가 막는다
--
-- 즉 **지우는 행위가 지워진 커플의 신호 행을 되살리려 한다.**
-- 파기 경로 전체가 이것 하나로 막혀 있었다. 검증을 안 짰으면 못 봤을 것이다.
--
-- 고치는 법: 신호를 올리기 전에 커플이 아직 있는지 본다.
-- 없으면 조용히 넘어간다 — 사라지는 커플에게 알릴 화면이 없다.

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
  -- 파기 중이면 부모가 이미 없다. 되살리지 않는다.
  if not exists (select 1 from couples where id = v_couple) then return null; end if;

  insert into couple_signals (couple_id, events_at)
  values (v_couple, now())
  on conflict (couple_id) do update set events_at = now();

  return null;
end $$;

create or replace function public.bump_signal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid;
  v_user   uuid;
begin
  if tg_table_name in ('checklists', 'anniversaries', 'places', 'expenses', 'settlements') then
    v_couple := coalesce(new.couple_id, old.couple_id);
  elsif tg_table_name = 'checklist_items' then
    select c.couple_id into v_couple from checklists c
     where c.id = coalesce(new.checklist_id, old.checklist_id);
  elsif tg_table_name = 'statuses' then
    v_user := coalesce(new.user_id, old.user_id);
    select p.couple_id into v_couple from profiles p where p.id = v_user;
  end if;

  if v_couple is null then return null; end if;
  -- 파기 중이면 부모가 이미 없다. 되살리지 않는다.
  if not exists (select 1 from couples where id = v_couple) then return null; end if;

  insert into couple_signals as s (couple_id, events_at, checklists_at, statuses_at, expenses_at)
  values (v_couple, now(), now(), now(), now())
  on conflict (couple_id) do update set
    checklists_at = case when tg_table_name in ('checklists','checklist_items','places')
                         then now() else s.checklists_at end,
    statuses_at   = case when tg_table_name = 'statuses'
                         then now() else s.statuses_at end,
    expenses_at   = case when tg_table_name in ('expenses','settlements')
                         then now() else s.expenses_at end,
    events_at     = case when tg_table_name = 'anniversaries'
                         then now() else s.events_at end;

  return null;
end $$;
