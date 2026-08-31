-- 0033 주기 모듈은 커플에서 한 사람만
--
-- 문제: 모듈이 순수한 개인 스위치라 양쪽 다 켤 수 있었다.
--       기록이 새지는 않는다 — cycles는 user_id 단위이고 짝 조회 정책이 없다.
--       하지만 안 쓰는 쪽 화면에 주기 달력이 뜨고, 거기에 기록을 넣을 수 있다.
--
-- 성별 컬럼으로 잠그지 않는다. profiles에 성별 컬럼 없음은 되돌릴 수 없는
-- 고정값이고, 성별은 민감정보라 받는 순간 수집 항목이 하나 늘어난다.
-- 대신 **커플에서 한 사람만 켤 수 있게** 한다. 결과는 같다.
--
-- 막히는 쪽 화면에는 안내문을 띄우지 않는다. **카드 자체를 안 그린다.**
--   "이미 한 사람이 쓰고 있어요"라고 적으면 그게 곧 상대에 대한 고지가 된다.
--   안 쓰는 사람에게는 애초에 없는 기능이면 된다.
--   cycleTakenByPartner는 화면이 '안 그리기'를 판단하는 데만 쓴다.
--
-- 이 규칙은 커플 두 사람 모두가 주기를 기록하고 싶은 경우에는 맞지 않는다.
-- 그때는 이 마이그레이션만 되돌리면 된다 — 다른 곳은 건드리지 않았다.

create or replace function public.set_health_sharing(
  p_module    boolean default null,
  p_cycle     boolean default null,
  p_condition boolean default null,
  p_avoid     boolean default null,
  p_consent   boolean default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := auth.uid();
  v_was boolean;
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;

  -- 짝이 이미 쓰고 있으면 켤 수 없다.
  -- my_couple_id()가 null이면(짝이 없으면) 아무도 안 걸린다.
  if p_module is true and exists (
    select 1 from health_sharing h
    join profiles p on p.id = h.user_id
    where p.couple_id = my_couple_id()
      and h.user_id <> v_me
      and h.cycle_module_on
  ) then
    raise exception 'MODULE_TAKEN';
  end if;

  select cycle_module_on into v_was from health_sharing where user_id = v_me;

  insert into health_sharing (user_id) values (v_me)
  on conflict (user_id) do nothing;

  update health_sharing set
    cycle_module_on     = coalesce(p_module,    cycle_module_on),
    share_cycle         = coalesce(p_cycle,     share_cycle),
    share_condition     = coalesce(p_condition, share_condition),
    avoid_in_free_slots = coalesce(p_avoid,     avoid_in_free_slots),
    -- 민감정보 별도 동의 시각. 철회하면 지운다.
    consented_at = case
      when p_consent is true  then coalesce(consented_at, now())
      when p_consent is false then null
      else consented_at end,
    updated_at = now()
  where user_id = v_me;

  -- 모듈을 껐다 → 즉시 파기. 공유 스위치도 같이 내린다.
  if p_module is false and coalesce(v_was, false) then
    delete from cycles where user_id = v_me;
    update health_sharing
       set share_cycle = false, avoid_in_free_slots = false
     where user_id = v_me;
  end if;

  -- 동의를 철회했다 → 건강 정보 전체 파기
  if p_consent is false then
    delete from cycles     where user_id = v_me;
    delete from conditions where user_id = v_me;
    update health_sharing set
      cycle_module_on = false, share_cycle = false,
      share_condition = false, avoid_in_free_slots = false
    where user_id = v_me;
  end if;

  return my_health();
end $$;

/**
 * 화면이 '켤 수 없음'을 미리 알 수 있게 한다.
 *
 * health_sharing을 직접 읽게 열어주지 않는다. 그 테이블에는 공유 스위치가
 * 같이 들어 있어서, 열면 상대가 무엇을 껐는지까지 보인다.
 * my_health()가 필요한 사실 하나만 계산해 내보낸다.
 */
create or replace function public.my_health()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_s     health_sharing%rowtype;
  v_pred  json;
  v_open  cycles%rowtype;
  v_cur   cycles%rowtype;
  v_cond  conditions%rowtype;
  v_dur   int;
  v_delay int;
  v_taken boolean;
begin
  if v_me is null then return null; end if;

  select * into v_s from health_sharing where user_id = v_me;
  -- 행이 없으면 전부 꺼진 것으로 답한다. 여기서 만들지 않는다.
  if not found then
    v_s.cycle_module_on := false;
    v_s.share_cycle := false;
    v_s.share_condition := false;
    v_s.avoid_in_free_slots := false;
  end if;

  -- 짝이 이미 쓰고 있는가. 내가 켜져 있으면 물어볼 필요가 없다.
  if not v_s.cycle_module_on then
    select exists (
      select 1 from health_sharing h
      join profiles p on p.id = h.user_id
      where p.couple_id = my_couple_id()
        and h.user_id <> v_me
        and h.cycle_module_on
    ) into v_taken;
  end if;

  select * into v_cond from conditions
   where user_id = v_me and on_date = current_date;

  if v_s.cycle_module_on then
    v_pred := cycle_prediction(v_me);
    v_dur  := period_duration(v_me);

    select * into v_open from cycles
     where user_id = v_me and period_end is null
       and period_start > current_date - 30
     order by period_start desc limit 1;

    select * into v_cur from cycles
     where user_id = v_me
       and current_date between period_start
           and coalesce(period_end, period_start + (v_dur - 1))
     order by period_start desc limit 1;

    if v_pred->>'status' = 'ok' and v_open.id is null then
      v_delay := nullif(greatest(0, current_date - (v_pred->>'nextTo')::date), 0);
    end if;
  end if;

  return json_strip_nulls(json_build_object(
    'cycleModuleOn',    v_s.cycle_module_on,
    'shareCycle',       v_s.share_cycle,
    'shareCondition',   v_s.share_condition,
    'avoidInFreeSlots', v_s.avoid_in_free_slots,
    'consentedAt',      v_s.consented_at,
    'periodDuration',   v_dur,
    -- 짝이 이미 쓰고 있어 켤 수 없다. 이 사실 하나만 나간다.
    'cycleTakenByPartner', case when v_taken then true end,
    'today', case when v_cond.user_id is not null or v_cur.id is not null then
      json_build_object(
        'energy',    v_cond.energy,
        'painAreas', v_cond.pain_areas,
        'memo',      v_cond.memo,
        'flow',      v_cur.flow,
        'pain',      v_cur.pain,
        'symptoms',  v_cur.symptoms)
      end,
    'prediction', v_pred,
    'openPeriodId',    v_open.id,
    'openPeriodStart', v_open.period_start,
    'askIfOngoing', case
      when v_open.id is not null
       and not v_open.ongoing_asked
       and current_date - v_open.period_start >= 7
      then true end,
    'delayDays', v_delay,
    'periods', case when v_s.cycle_module_on then (
      select json_agg(json_build_object(
               'id', c.id, 'from', c.period_start, 'to', c.period_end,
               'flow', c.flow, 'pain', c.pain,
               'symptoms', c.symptoms, 'memo', c.memo)
             order by c.period_start desc)
      from cycles c where c.user_id = v_me
        and c.period_start > current_date - interval '12 months'
    ) end
  ));
end $$;
