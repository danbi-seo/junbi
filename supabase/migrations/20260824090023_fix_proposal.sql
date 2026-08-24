-- 0023 제안 수락 오류와 알림 중복 수정
--
-- 증상 1: answer_proposal이 400
--         column "status" is of type event_status but expression is of type text
--         case 식의 결과가 text라 enum 컬럼에 그대로 못 넣는다. 캐스팅한다.
--
-- 증상 2: 제안 하나에 알림이 두 번 간다
--         events INSERT 트리거(event_created)와 propose_slot(proposal)이 모두 보낸다
--         제안은 propose_slot이 자기 문구로 보내므로 트리거는 건너뛴다.

create or replace function public.answer_proposal(p_event uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_label text; v_title text;
begin
  select title into v_title from events
   where id = p_event and couple_id = my_couple_id() and status = 'proposed';
  if v_title is null then raise exception 'NOT_FOUND'; end if;

  update events
     set status = (case when p_accept then 'confirmed' else 'declined' end)::event_status
   where id = p_event;

  v_label := partner_label(my_partner_id(), auth.uid());
  perform enqueue_partner_notification(
    'proposal_reply',
    v_label || '님이 제안을 ' || case when p_accept then '수락했어요' else '거절했어요' end,
    v_title,
    '/event/' || p_event,
    'proposal:' || p_event,
    'proposal_reply:' || p_event || ':' || case when p_accept then 'y' else 'n' end
  );
end $$;

-- 제안 상태 일정은 트리거가 알리지 않는다.
create or replace function public.notify_event_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind  text;
  v_label text;
  v_what  text;
begin
  if new.deleted_at is not null then return null; end if;

  -- 제안은 propose_slot / answer_proposal이 자기 문구로 알린다.
  -- 여기서 또 보내면 한 번에 두 개가 간다.
  if new.status <> 'confirmed' then return null; end if;

  if not (new.scope = 'shared' or new.visibility = 'full') then
    return null;
  end if;

  if new.silent then return null; end if;
  if new.source <> 'local' then return null; end if;

  v_kind := case when tg_op = 'INSERT' then 'event_created' else 'event_updated' end;

  -- 제안이 수락돼 confirmed가 된 경우도 트리거가 탄다.
  -- 그건 answer_proposal이 이미 알렸으므로 건너뛴다.
  if tg_op = 'UPDATE' and old.status = 'proposed' then return null; end if;

  if tg_op = 'UPDATE'
     and old.title = new.title
     and old.starts_at = new.starts_at
     and old.ends_at = new.ends_at then
    return null;
  end if;

  v_label := partner_label(my_partner_id(), new.owner_id);
  v_what  := coalesce(new.emoji || ' ', '') || new.title;

  perform enqueue_partner_notification(
    v_kind,
    v_label || '님이 일정을 ' || case when tg_op = 'INSERT' then '추가했어요' else '바꿨어요' end,
    v_what,
    '/event/' || new.id,
    'event:' || new.id,
    v_kind || ':' || new.id || ':' || date_trunc('hour', now())
  );

  return null;
end $$;
