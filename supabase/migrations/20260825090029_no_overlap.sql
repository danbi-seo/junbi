-- 0029 겹치는 기록을 만들지 않는다
--
-- 소급 입력의 가장 흔한 쓰임은 "8월 10일로 적었는데 실은 12일이었다"다.
-- 3일 규칙이 그걸 잡아 주지만, 5일 어긋나면 규칙 밖이라 새 기록이 생긴다.
-- 그러면 8/10~8/14와 8/15~ 두 기록이 겹쳐 놓인다.
--
-- 겹치면 간격이 5일짜리로 잡히고, 15~60일 필터가 그걸 버린다.
-- 예측이 죽지는 않지만 기록 목록이 엉망이 되고 본인이 뭘 고쳐야 할지 모른다.
--
-- 이미 기록된 기간 안의 날짜를 시작으로 누르면
-- **새로 만들지 않고 그 기록의 시작일을 옮긴다.**
-- 화면에서도 그 칸의 버튼을 비활성으로 두지만, 서버가 최종 방어선이다.

create or replace function public.log_period_start(p_date date default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := auth.uid();
  v_d   date := coalesce(p_date, current_date);
  v_dur int;
  v_id  uuid;
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from health_sharing
                 where user_id = v_me and cycle_module_on) then
    raise exception 'MODULE_OFF';
  end if;
  if v_d > current_date then raise exception 'FUTURE_DATE'; end if;

  v_dur := period_duration(v_me);

  -- 1. 이미 기록된 기간 안이면 그 기록의 시작을 옮긴다.
  --    끝을 안 눌렀으면 본인 평균 기간까지를 그 기록으로 본다.
  select id into v_id from cycles
   where user_id = v_me
     and v_d between period_start and coalesce(period_end, period_start + (v_dur - 1))
   order by period_start desc
   limit 1;

  -- 2. 아니면 3일 안쪽의 시작 기록을 오타로 보고 옮긴다.
  if v_id is null then
    select id into v_id from cycles
     where user_id = v_me and abs(period_start - v_d) <= 3
     order by abs(period_start - v_d)
     limit 1;
  end if;

  if v_id is not null then
    -- 시작이 끝을 넘어가면 안 된다. 넘어가면 끝을 비운다 —
    -- 잘못 눌렀을 때 기록이 사라지는 것보다 열린 채로 두는 게 낫다.
    update cycles
       set period_start = v_d,
           period_end = case when period_end < v_d then null else period_end end
     where id = v_id;
    return v_id;
  end if;

  insert into cycles (user_id, period_start) values (v_me, v_d)
  returning id into v_id;

  return v_id;
end $$;
