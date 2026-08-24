-- 0019 상태 · 루틴 계산
--
-- 근거: docs/15-presence.md
--
-- 관통하는 원칙:
--   루틴 원본은 상대에게 보이지 않는다. 계산된 '지금 상태'만 나간다.
--   주 단위 스케줄 전체가 보이면 "화요일 8시에 왜 집에 없어?" 같은 대조가 가능해진다.
--
-- 루틴 상태를 테이블에 쓰지 않는다. cron으로 9:30에 켜고 18:30에 끄는 방식은
-- 실패 지점이 많고 루틴을 바꿔도 반영이 늦다. 조회할 때 계산하면 항상 정확하다.

create or replace function public.current_statuses(p_user uuid)
returns table (
  kind    status_kind,
  emoji   text,
  label   text,
  is_auto boolean,
  until   timestamptz
)
language sql stable security definer set search_path = public as $$
  with allowed as (
    -- 본인과 짝만. 남의 상태를 조회할 수 없다.
    select p_user as uid
    where p_user = auth.uid() or p_user = my_partner_id()
  ),
  tz as (
    select coalesce(pr.timezone, 'Asia/Seoul') as z
    from profiles pr join allowed a on a.uid = pr.id
  ),
  nowl as (
    select (now() at time zone (select z from tz)) as t
  ),
  -- 루틴에서 활동 상태 하나를 뽑는다
  auto as (
    select
      'activity'::status_kind as kind,
      r.emoji,
      r.label,
      true as is_auto,
      -- 종료 시각. 자정을 넘기는 루틴은 다음 날로 넘긴다.
      (case
         when r.ends_at > r.starts_at then (select t from nowl)::date + r.ends_at
         when (select t from nowl)::time <= r.ends_at then (select t from nowl)::date + r.ends_at
         else ((select t from nowl)::date + 1) + r.ends_at
       end) at time zone (select z from tz) as until
    from routines r
    join allowed a on a.uid = r.user_id
    where r.enabled
      and extract(dow from (select t from nowl))::smallint = any(r.days)
      and (
        -- 같은 날 안에서 끝나는 경우
        (r.ends_at > r.starts_at
         and (select t from nowl)::time >= r.starts_at
         and (select t from nowl)::time <  r.ends_at)
        -- 자정을 넘기는 경우 (예: 23:00–07:00)
        -- 이 조건을 빠뜨리면 야간 루틴이 아예 안 뜬다
        or (r.ends_at <= r.starts_at
         and ((select t from nowl)::time >= r.starts_at
           or (select t from nowl)::time <  r.ends_at))
      )
      -- 오늘만 끄기 (휴가·반차·외근)
      and not exists (
        select 1 from routine_overrides o
        where o.routine_id = r.id
          and o.on_date = (select t from nowl)::date
      )
    -- 겹치면 priority가 높은 하나만. '일하는 중'과 '통학 중'이 겹칠 때.
    order by r.priority desc, r.starts_at
    limit 1
  ),
  manual as (
    select s.kind, s.emoji, s.text as label, false as is_auto, s.until
    from statuses s
    join allowed a on a.uid = s.user_id
    where s.until > now()
  )
  -- 수동이 있는 종류는 자동을 버린다.
  -- 20시에 '야근 중'을 쓰면 루틴의 '일하는 중'은 사라진다.
  select * from manual
  union all
  select * from auto a
  where not exists (select 1 from manual m where m.kind = a.kind)
  order by kind;
$$;

-- 수동 상태 설정.
--
-- 루틴 전환에는 알림을 보내지 않는다. 루틴은 이 함수를 거치지 않으므로
-- 구조가 자동으로 보장한다. 하루 두 번 예측 가능한 시각에 오는 알림은
-- 정보가 아니고, 틀릴 수 있는 추정을 밀어주면 오해를 만든다.
create or replace function public.set_status(
  p_kind  status_kind,
  p_emoji text,
  p_text  text default null,
  p_hours int default 4
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  insert into statuses (user_id, kind, emoji, text, until, updated_at)
  values (auth.uid(), p_kind, p_emoji, nullif(btrim(coalesce(p_text,'')), ''),
          now() + (greatest(p_hours, 1) || ' hours')::interval, now())
  on conflict (user_id, kind) do update set
    emoji = excluded.emoji,
    text  = excluded.text,
    until = excluded.until,
    updated_at = now();

  -- 알림은 enqueue_partner_notification이 판정한다.
  -- dedupe_key에 시각을 넣어 한 시간에 한 번만 알린다.
  -- 상태를 다섯 번 바꿔도 알림은 하나다.
  perform enqueue_partner_notification(
    'status_changed',
    partner_label(my_partner_id(), auth.uid()) || '님의 상태가 바뀌었어요',
    p_emoji || coalesce(' ' || nullif(btrim(coalesce(p_text,'')), ''), ''),
    '/',
    'status',
    'status_changed:' || auth.uid() || ':' || date_trunc('hour', now())
  );
end $$;

-- 상태 지우기
create or replace function public.clear_status(p_kind status_kind)
returns void
language sql security definer set search_path = public as $$
  delete from statuses where user_id = auth.uid() and kind = p_kind;
$$;

-- 오늘만 루틴 끄기.
--
-- 휴가나 반차 때 루틴 전체를 껐다가 다시 켜는 건 번거롭고, 다시 켜는 걸 잊는다.
-- 하루짜리 예외를 둔다. 다음 날 자동으로 풀린다.
create or replace function public.skip_routine_today(p_routine uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tz text; v_date date;
begin
  select coalesce(timezone, 'Asia/Seoul') into v_tz from profiles where id = auth.uid();
  v_date := (now() at time zone v_tz)::date;

  -- 내 루틴만. RLS가 막지만 여기서도 확인한다.
  if not exists (select 1 from routines where id = p_routine and user_id = auth.uid()) then
    raise exception 'NOT_MINE';
  end if;

  insert into routine_overrides (user_id, routine_id, on_date)
  values (auth.uid(), p_routine, v_date)
  on conflict do nothing;
end $$;

create or replace function public.unskip_routine_today(p_routine uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tz text;
begin
  select coalesce(timezone, 'Asia/Seoul') into v_tz from profiles where id = auth.uid();
  delete from routine_overrides
   where user_id = auth.uid() and routine_id = p_routine
     and on_date = (now() at time zone v_tz)::date;
end $$;

-- 지난 예외는 쌓일 필요가 없다. 매일 새벽에 치운다.
-- pg_cron 설정은 scripts/setup-cron.sql에서 함께 건다.
create or replace function public.purge_routine_overrides()
returns void
language sql security definer set search_path = public as $$
  delete from routine_overrides where on_date < current_date - 7;
$$;

revoke execute on function public.purge_routine_overrides() from public, anon, authenticated;
