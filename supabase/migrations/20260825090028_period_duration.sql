-- 0028 기간 가정을 본인 기록에서 가져온다
--
-- 종료를 안 눌러도 동작해야 한다. 실제로 자주 잊는다.
-- 그때 며칠로 볼지를 네 군데에 5일로 박아 뒀는데, 그러면 본인 기록이
-- 6일이든 7일이든 무시된다.
--
-- 증상은 이렇게 나온다.
--   상대 화면의 '🩸 생리 중'이 이틀 먼저 꺼진다
--   컨디션 화면의 주기 항목(생리량·통증)이 이틀 먼저 사라진다
--   달력의 기록 구간이 짧게 칠해진다
--
-- 예측의 nextDuration은 이미 중앙값을 쓰고 있었다. 같은 값을 쓰게 맞춘다.
-- 기록이 없을 때만 5일로 본다 (일반적인 범위 3~7일의 가운데).

/**
 * 본인 기록의 기간 중앙값. 끝을 안 누른 기록을 며칠로 볼지에 쓴다.
 *
 * ⚠ 인자로 남의 uuid를 받는다. 짧은 숫자 하나라도 상대의 몸에 관한 값이다.
 *   맨 아래에서 execute를 회수한다. 내부에서만 부른다.
 */
create or replace function public.period_duration(p_user uuid)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    percentile_cont(0.5) within group (order by (period_end - period_start + 1))::int,
    5)
  from cycles
  where user_id = p_user and period_end is not null;
$$;

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

  select * into v_cond from conditions
   where user_id = v_me and on_date = current_date;

  if v_s.cycle_module_on then
    v_pred := cycle_prediction(v_me);
    v_dur  := period_duration(v_me);

    -- 진행 중인 기록. period_end가 비어 있고 시작한 지 얼마 안 된 것.
    select * into v_open from cycles
     where user_id = v_me and period_end is null
       and period_start > current_date - 30
     order by period_start desc limit 1;

    -- 오늘이 포함된 기록. 종료를 안 눌렀으면 본인 평균 기간으로 본다.
    select * into v_cur from cycles
     where user_id = v_me
       and current_date between period_start
           and coalesce(period_end, period_start + (v_dur - 1))
     order by period_start desc limit 1;

    -- 지연 감지. 예상 구간 끝을 지났는데 새 기록이 없으면.
    -- 본인에게만 간다. 푸시로 보내지 않고 앱 안 배너로만 띄운다.
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
    -- 끝을 안 누른 기록을 며칠로 볼지. 화면도 같은 값을 써야 한다.
    'periodDuration',   v_dur,
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
    -- 진행 중이면 버튼이 '오늘 끝났어요'로 바뀐다
    'openPeriodId',    v_open.id,
    'openPeriodStart', v_open.period_start,
    -- 7일이 지났으면 한 번만 묻는다. 반복해서 묻지 않는다.
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

create or replace function public.partner_health()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_p    uuid := my_partner_id();
  v_s    health_sharing%rowtype;
  v_pred json;
  v_dur  int;
begin
  if v_p is null then return null; end if;

  select * into v_s from health_sharing where user_id = v_p;
  -- 설정 행이 없는 것과 전부 꺼둔 것이 같게 보여야 한다
  if not found then return json_build_object('shared', false); end if;

  if v_s.share_cycle then
    v_pred := cycle_prediction(v_p);
    v_dur  := period_duration(v_p);
  end if;

  return json_strip_nulls(json_build_object(
    'shared', true,
    'condition', case when v_s.share_condition then (
        -- memo는 나가지 않는다. 기운과 아픈 곳만.
        select json_build_object('energy', energy, 'painAreas', pain_areas)
        from conditions where user_id = v_p and on_date = current_date
      ) end,
    'periods', case when v_s.share_cycle then (
        select json_agg(json_build_object('from', period_start, 'to', period_end))
        from cycles where user_id = v_p
          and period_start > current_date - interval '3 months'
      ) end,
    'periodActive', case when v_s.share_cycle then (
        -- 끝을 안 눌렀으면 본인 평균 기간으로 본다.
        -- 5일로 박아 두면 6~7일인 사람의 '생리 중'이 먼저 꺼진다.
        select exists (select 1 from cycles where user_id = v_p
          and current_date between period_start
              and coalesce(period_end, period_start + (v_dur - 1)))
      ) end,
    -- 구간만. 예측 근거 숫자는 나가지 않는다.
    -- periodDuration도 나가지 않는다 — 며칠짜리인지는 상대가 알 것이 아니다.
    'fertileFrom', case when v_s.share_cycle then v_pred->>'fertileFrom' end,
    'fertileTo',   case when v_s.share_cycle then v_pred->>'fertileTo'   end
  ));
end $$;

create or replace function public.save_condition(
  p_energy     smallint default null,
  p_pain_areas text[]   default null,
  p_memo       text     default null,
  p_flow       smallint default null,
  p_pain       smallint default null,
  p_symptoms   text[]   default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := auth.uid();
  v_dur int;
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;

  insert into conditions (user_id, on_date, energy, pain_areas, memo)
  values (v_me, current_date, p_energy, p_pain_areas,
          nullif(btrim(coalesce(p_memo, '')), ''))
  on conflict (user_id, on_date) do update set
    energy     = excluded.energy,
    pain_areas = excluded.pain_areas,
    memo       = excluded.memo;

  -- 주기 항목은 진행 중인 기록에 붙인다. 모듈이 꺼져 있으면 무시한다.
  if p_flow is not null or p_pain is not null or p_symptoms is not null then
    v_dur := period_duration(v_me);
    update cycles set flow = p_flow, pain = p_pain, symptoms = p_symptoms
     where user_id = v_me
       and current_date between period_start
           and coalesce(period_end, period_start + (v_dur - 1));
  end if;
end $$;

revoke execute on function public.period_duration(uuid) from public, anon, authenticated;
