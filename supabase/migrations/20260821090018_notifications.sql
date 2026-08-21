-- 0018 알림 큐에 넣는 규칙
--
-- 판정 순서가 이 기능의 전부다 → docs/13-notifications.md
--
--   1. 마스킹 규칙      시간만·비공개 일정 → 무조건 안 감
--   2. 직접 상호작용    제안·수락·해제 → 무조건 감
--   3. 발신 설정        내가 끄면 안 감
--   4. 수신 설정        상대가 끄면 안 감
--   5. 조용한 시간      미룸
--   6. 컨디션 감소      기운 1~2면 일부 건너뜀
--
-- 1번과 2번이 설정보다 위에 있는 게 핵심이다.
-- 마스킹은 규칙이지 취향이 아니고, 제안하는 행위가 곧 알리겠다는 의사다.

-- 조용한 시간을 지나 보낼 수 있는 가장 이른 시각.
-- 버리지 않고 미룬다. 아침에 묶어서 하나로 나간다.
create or replace function public.next_sendable_time(p_user uuid)
returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz   text;
  v_from time;
  v_to   time;
  v_now  timestamp;
begin
  select coalesce(p.timezone, 'Asia/Seoul') into v_tz
    from profiles p where p.id = p_user;

  select n.quiet_from, n.quiet_to into v_from, v_to
    from notification_prefs n where n.user_id = p_user;

  if v_from is null then return now(); end if;

  v_now := now() at time zone v_tz;

  -- 자정을 넘기는 구간(23:00–08:00)을 처리한다
  if (v_from < v_to  and v_now::time >= v_from and v_now::time < v_to)
  or (v_from >= v_to and (v_now::time >= v_from or v_now::time < v_to)) then
    -- 조용한 시간 안이다. 끝나는 시각으로 미룬다.
    if v_now::time >= v_from and v_from >= v_to then
      return ((v_now::date + 1) + v_to) at time zone v_tz;   -- 자정을 넘긴 경우
    end if;
    return (v_now::date + v_to) at time zone v_tz;
  end if;

  return now();
end $$;

-- 상대에게 보낼 알림을 큐에 넣는다.
--
-- 판정을 '큐에 넣는 시점'에 한다. 발송 시점이 아니다.
-- 발송 때 거르면 안 갈 알림이 쌓이고, 나중에 설정을 켜면 과거 알림이 한꺼번에 터진다.
create or replace function public.enqueue_partner_notification(
  p_kind   text,
  p_title  text,
  p_body   text,
  p_url    text default '/',
  p_tag    text default null,
  p_dedupe text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_to   uuid := my_partner_id();
  v_send boolean;
  v_recv boolean;
begin
  if v_to is null then return; end if;

  -- 끌 수 없는 알림은 설정을 보지 않는다.
  -- 제안을 보내놓고 알림이 안 가면 제안 자체가 무의미하다.
  if p_kind in ('proposal', 'proposal_reply', 'dissolved') then
    null;

  -- 나머지는 kind가 곧 notification_prefs의 컬럼 접미사다.
  -- format %I에 임의 문자열이 들어가지 않도록 화이트리스트로 막는다.
  elsif p_kind in ('event_created','event_updated','expense_added','settlement',
                   'status_changed','checklist_done','condition') then
    execute format('select %I from notification_prefs where user_id = $1',
                   'send_' || p_kind) into v_send using auth.uid();
    execute format('select %I from notification_prefs where user_id = $1',
                   'recv_' || p_kind) into v_recv using v_to;
    if not coalesce(v_send, true) or not coalesce(v_recv, true) then
      return;
    end if;

  else
    raise exception 'UNKNOWN_KIND: %', p_kind;
  end if;

  -- 컨디션이 나쁜 날은 일부 알림을 건너뛴다.
  -- 이유를 알리지 않는다. 그냥 덜 간다. share_condition이 꺼져 있어도 동작한다.
  -- 일정 관련과 정산은 줄이지 않는다. 놓치면 안 되는 것들이다.
  if p_kind in ('expense_added','checklist_done','status_changed')
     and exists (
       select 1 from conditions c
       where c.user_id = v_to and c.on_date = current_date and c.energy <= 2
     ) then
    return;
  end if;

  insert into notification_queue (user_id, kind, title, body, url, tag, send_at, dedupe_key)
  values (v_to, p_kind, p_title, p_body, p_url, p_tag,
          next_sendable_time(v_to), p_dedupe)
  on conflict (dedupe_key) where sent_at is null and dedupe_key is not null
  do nothing;
end $$;

-- ── 일정이 생기거나 바뀌면 알린다 ───────────────────────────────
--
-- 마스킹 규칙이 설정보다 위다. 개인 일정의 '시간만'·'비공개'는 알림을 보내지 않는다.
-- 달력에서 제목을 가려도 알림이 시각을 알려주면 가린 의미가 절반 사라진다.
create or replace function public.notify_event_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind  text;
  v_label text;
  v_what  text;
begin
  -- 소프트 삭제는 알리지 않는다. 지운 걸 알리는 건 참견이다.
  if new.deleted_at is not null then return null; end if;

  -- 함께 일정이거나 전체 공개인 개인 일정만.
  if not (new.scope = 'shared' or new.visibility = 'full') then
    return null;
  end if;

  -- 이 건만 알리지 않기
  if new.silent then return null; end if;

  -- 구글에서 가져온 일정은 사용자가 만든 게 아니다
  if new.source <> 'local' then return null; end if;

  v_kind := case when tg_op = 'INSERT' then 'event_created' else 'event_updated' end;

  if tg_op = 'UPDATE'
     and old.title = new.title
     and old.starts_at = new.starts_at
     and old.ends_at = new.ends_at then
    return null;   -- 내용이 안 바뀌었으면 조용히
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

create trigger events_notify_ins
  after insert on events
  for each row execute function notify_event_change();

create trigger events_notify_upd
  after update on events
  for each row
  when (old.deleted_at is null and new.deleted_at is null)
  execute function notify_event_change();
