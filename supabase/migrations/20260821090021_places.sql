-- 0021 장소 위시리스트 보강
--
-- 근거: docs/16-shared-lists.md B
--
-- places 테이블 자체는 0004에 있다. 여기서는 화면에 필요한 것만 더한다.

-- 다녀온 뒤 '또 가고 싶어요'. 별점과 별개다 —
-- 맛있었지만 멀어서 다시 안 갈 곳이 있다.
alter table places add column if not exists want_again boolean;

-- 지도 핀이 30개를 넘으면 필터 없이는 못 쓴다. 카테고리로 거른다.
create index if not exists places_visited_idx
  on places (couple_id, visited_at);

-- 실시간 신호에 장소를 추가한다.
-- 상대가 장소를 저장하면 내 화면에도 바로 뜬다.
create or replace function public.bump_signal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid;
  v_user   uuid;
begin
  if tg_table_name in ('checklists', 'anniversaries', 'places') then
    v_couple := coalesce(new.couple_id, old.couple_id);
  elsif tg_table_name = 'checklist_items' then
    select c.couple_id into v_couple from checklists c
     where c.id = coalesce(new.checklist_id, old.checklist_id);
  elsif tg_table_name = 'statuses' then
    v_user := coalesce(new.user_id, old.user_id);
    select p.couple_id into v_couple from profiles p where p.id = v_user;
  end if;

  if v_couple is null then return null; end if;

  insert into couple_signals as s (couple_id, events_at, checklists_at, statuses_at)
  values (v_couple, now(), now(), now())
  on conflict (couple_id) do update set
    checklists_at = case when tg_table_name in ('checklists','checklist_items','places')
                         then now() else s.checklists_at end,
    statuses_at   = case when tg_table_name = 'statuses'
                         then now() else s.statuses_at end,
    events_at     = case when tg_table_name = 'anniversaries'
                         then now() else s.events_at end;

  return null;
end $$;

drop trigger if exists places_signal on places;
create trigger places_signal
  after insert or update or delete on places
  for each row execute function bump_signal();
