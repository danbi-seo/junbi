-- 0026 my_health() 수정
--
-- 두 가지가 틀렸다.
--
-- 1. conditions와 cycles를 조인하면서 컬럼을 수식하지 않았다.
--    양쪽에 memo가 있어 42702(ambiguous)로 함수가 통째로 실패했다.
--    조인도 없앤다 — 진행 중인 주기가 둘 이상 걸리면 스칼라 서브쿼리가
--    또 터진다. 각각 따로 읽는다.
--
-- 2. stable 함수 안에 insert가 있었다.
--    설정 행이 없는 사용자가 부르면 "INSERT is not allowed in a
--    non-volatile function"이 난다. 없으면 기본값(전부 꺼짐)으로 답한다.
--    행을 만드는 건 set_health_sharing()이 한다.
--
-- set_health_sharing()이 마지막에 my_health()를 부르기 때문에
-- 이 버그 하나로 '모듈 끄기 → 즉시 파기'까지 같이 롤백됐다.

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

    -- 진행 중인 기록. period_end가 비어 있고 시작한 지 얼마 안 된 것.
    select * into v_open from cycles
     where user_id = v_me and period_end is null
       and period_start > current_date - 30
     order by period_start desc limit 1;

    -- 오늘이 포함된 기록. 종료를 안 눌렀으면 평균 5일로 가정한다.
    select * into v_cur from cycles
     where user_id = v_me
       and current_date between period_start
           and coalesce(period_end, period_start + 4)
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
