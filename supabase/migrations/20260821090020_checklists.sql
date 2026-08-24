-- 0020 체크리스트 · 실시간 신호 확장 · 큐 정리
--
-- 근거: docs/16-shared-lists.md
--
-- 체크리스트는 두 사람이 '동시에 보면서 쓰는' 유일한 화면이다.
-- 마트에서 각자 다른 통로를 돌며 체크하는 게 실제 사용 시나리오다.

-- ── 실시간 신호 확장 ────────────────────────────────────────────
-- 지금까지 events만 신호를 올렸다. 상태·기념일·체크리스트가 바뀌어도
-- 상대 화면이 저절로 갱신되지 않았다.
--
-- 신호 테이블에는 "바뀌었다"는 사실과 시각뿐이라 샐 것이 없다.
-- 실제 데이터는 각 화면이 권한이 걸린 경로로 다시 읽는다.

create or replace function public.bump_signal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid;
  v_user   uuid;
begin
  -- 커플 공용 테이블은 couple_id를, 개인 테이블은 user_id를 갖는다.
  if tg_table_name in ('checklists', 'anniversaries') then
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
    checklists_at = case when tg_table_name in ('checklists','checklist_items')
                         then now() else s.checklists_at end,
    statuses_at   = case when tg_table_name = 'statuses'
                         then now() else s.statuses_at end,
    -- 기념일은 달력·D-day와 함께 보이므로 events 신호를 같이 올린다
    events_at     = case when tg_table_name = 'anniversaries'
                         then now() else s.events_at end;

  return null;
end $$;

create trigger checklists_signal
  after insert or update or delete on checklists
  for each row execute function bump_signal();

create trigger checklist_items_signal
  after insert or update or delete on checklist_items
  for each row execute function bump_signal();

create trigger statuses_signal
  after insert or update or delete on statuses
  for each row execute function bump_signal();

create trigger anniversaries_signal
  after insert or update or delete on anniversaries
  for each row execute function bump_signal();

-- ── 체크리스트 전체 완료 알림 ───────────────────────────────────
--
-- 켤 만한 건 '모든 항목 완료' 하나뿐이다.
-- 마트에서 상대가 체크할 때마다 울리면 미친다. 기본도 꺼져 있다.
create or replace function public.notify_checklist_done() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_list  checklists%rowtype;
  v_total int;
  v_done  int;
begin
  if new.checked_at is null then return null; end if;

  select * into v_list from checklists where id = new.checklist_id;
  if v_list.id is null then return null; end if;

  select count(*), count(checked_at) into v_total, v_done
    from checklist_items where checklist_id = new.checklist_id;

  -- 마지막 하나를 체크한 순간에만
  if v_total = 0 or v_done < v_total then return null; end if;

  perform enqueue_partner_notification(
    'checklist_done',
    partner_label(my_partner_id(), auth.uid()) || '님이 ' || v_list.title || '을(를) 모두 체크했어요',
    v_total || '개 항목 완료',
    '/lists/' || v_list.id,
    'checklist:' || v_list.id,
    'checklist_done:' || v_list.id || ':' || date_trunc('hour', now())
  );

  return null;
end $$;

create trigger checklist_items_done
  after update of checked_at on checklist_items
  for each row
  when (old.checked_at is null and new.checked_at is not null)
  execute function notify_checklist_done();

-- ── 데이트 준비물 자동 보관 ─────────────────────────────────────
--
-- 일정이 끝나고 24시간 뒤에 접는다.
-- 안 하면 지난 데이트 목록이 계속 쌓인다.
create or replace function public.archive_finished_checklists()
returns void
language sql security definer set search_path = public as $$
  update checklists c
     set archived_at = now()
    from events e
   where c.event_id = e.id
     and c.kind = 'date_prep'
     and c.archived_at is null
     and e.ends_at < now() - interval '24 hours';
$$;

-- ── 알림 큐 정리 ────────────────────────────────────────────────
--
-- 발송된 알림은 sent_at만 채워지고 행이 남는다. 계속 쌓인다.
create or replace function public.purge_notification_queue()
returns void
language sql security definer set search_path = public as $$
  delete from notification_queue
   where sent_at is not null and sent_at < now() - interval '7 days';
$$;

revoke execute on function public.archive_finished_checklists() from public, anon, authenticated;
revoke execute on function public.purge_notification_queue() from public, anon, authenticated;
