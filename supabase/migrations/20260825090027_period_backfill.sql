-- 0027 소급 입력 보정
--
-- 달력에서 지난 날짜를 눌러 기록할 수 있게 되면서 종료 처리가 헐거워졌다.
--
-- 기존 log_period_end는 "열려 있고 30일 안에 시작한 기록" 전부를 닫았다.
-- 기록이 하나뿐일 때는 문제가 없었는데, 과거를 소급 입력하면 열린 기록이
-- 둘이 될 수 있다. 그러면 오늘 '끝났어요'를 눌렀을 때 지난달 기록까지
-- 같이 닫힌다.
--
-- 그 날짜 이전에 시작한 것 중 **가장 최근 하나**만 닫는다.

create or replace function public.log_period_end(p_date date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_d  date := coalesce(p_date, current_date);
  v_id uuid;
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if v_d > current_date then raise exception 'FUTURE_DATE'; end if;

  -- 열린 기록이 없으면 이미 닫힌 기록의 끝을 옮기는 것으로 본다.
  -- 날짜를 잘못 눌렀을 때 고칠 길이 있어야 한다.
  select id into v_id from cycles
   where user_id = v_me and period_start <= v_d
     and (period_end is null or period_end >= v_d - 10)
   order by (period_end is null) desc, period_start desc
   limit 1;

  if v_id is null then return; end if;

  update cycles set period_end = v_d, ongoing_asked = true where id = v_id;
end $$;

-- 소급 입력한 시작일이 앞 기록과 겹치면 예측이 망가진다.
-- 같은 날 두 번 누르는 것은 unique (user_id, period_start)가 막지만,
-- 하루 차이로 두 번 시작하는 건 못 막는다. 3일 안쪽은 오타로 본다.
create or replace function public.log_period_start(p_date date default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_d  date := coalesce(p_date, current_date);
  v_id uuid;
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from health_sharing
                 where user_id = v_me and cycle_module_on) then
    raise exception 'MODULE_OFF';
  end if;
  if v_d > current_date then raise exception 'FUTURE_DATE'; end if;

  -- 3일 안쪽에 이미 시작 기록이 있으면 새로 만들지 않고 그 날짜를 옮긴다.
  select id into v_id from cycles
   where user_id = v_me and abs(period_start - v_d) <= 3
   order by abs(period_start - v_d)
   limit 1;

  if v_id is not null then
    update cycles set period_start = v_d where id = v_id;
    return v_id;
  end if;

  insert into cycles (user_id, period_start) values (v_me, v_d)
  returning id into v_id;

  return v_id;
end $$;
