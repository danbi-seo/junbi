-- 0025 컨디션 · 주기
--
-- 근거: docs/19-health.md
--
-- 관통하는 원칙 하나.
--   몸 상태로 만든 판단은 **본인 화면에만** 띄운다.
--   상대에게는 **본인이 켠 것만** 보낸다.
--
-- 이 파일에서 가장 중요한 건 '없는 것'이다.
--   cycles에 짝 조회 정책이 없다
--   cycles·conditions가 Realtime publication에 없다
--   주기 관련 푸시 알림이 없다
--   공유 요청 기능이 없다
--   끄는 행위에 알림이 없다

-- ── 새는 정책 하나 제거 ─────────────────────────────────────────
--
-- health_sharing을 짝이 읽을 수 있으면 share_cycle = false가 보인다.
-- 그러면 끄는 행위가 추궁 대상이 되고, 스위치는 있으나 마나가 된다.
-- notification_prefs에 짝 조회 정책을 두지 않은 것과 같은 이유다.
--
-- 앱은 이 테이블을 직접 읽을 필요가 없다. partner_health()가
-- security definer 안에서 읽고, 꺼져 있으면 그냥 아무것도 내보내지 않는다.
-- '꺼져 있음'과 '기록이 없음'이 상대 화면에서 구별되지 않아야 한다.
drop policy if exists "짝 공개설정 조회" on health_sharing;

-- 종료를 안 눌러도 동작해야 한다. 다만 7일이 지나면 한 번만 묻는다.
-- 물어봤는지를 기억해야 반복해서 묻지 않는다.
alter table cycles add column if not exists ongoing_asked boolean not null default false;

-- 모든 사용자에게 설정 행을 만들어 둔다. 값은 전부 기본 꺼짐이다.
insert into health_sharing (user_id)
select id from profiles on conflict (user_id) do nothing;

-- ── 예측 ────────────────────────────────────────────────────────
--
-- ⚠ 이 함수는 인자로 남의 uuid를 받는다. authenticated에게 열어두면
--   상대가 직접 불러서 cycleLength·variance·recentGaps를 볼 수 있다.
--   맨 아래에서 execute 권한을 회수한다. 내부에서만 부른다.
create or replace function public.cycle_prediction(p_user uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_starts date[];
  v_gaps   int[];
  v_len    int;
  v_sd     numeric;
  v_dur    int;
  v_last   date;
  v_next   date;
begin
  -- 최근 7회만. 1년 전 주기는 지금과 무관하다.
  select array_agg(period_start order by period_start desc) into v_starts
    from (select period_start from cycles
           where user_id = p_user order by period_start desc limit 7) t;

  -- 3회 미만이면 예측하지 않는다. 근거 없는 숫자를 보여주지 않는다.
  if v_starts is null or array_length(v_starts, 1) < 3 then
    return json_build_object('status', 'insufficient',
             'count', coalesce(array_length(v_starts, 1), 0));
  end if;

  -- 15~60일 밖 간격은 기록 누락으로 보고 제외한다.
  -- 한 달을 안 적으면 간격이 2배가 되고 계산이 통째로 망가진다.
  select array_agg(g) into v_gaps from (
    select (v_starts[i] - v_starts[i + 1]) as g
    from generate_subscripts(v_starts, 1) i
    where i < array_length(v_starts, 1)
  ) x where g between 15 and 60;

  if v_gaps is null or array_length(v_gaps, 1) < 2 then
    return json_build_object('status', 'irregular');
  end if;

  -- 중앙값을 쓴다. 한 번 크게 어긋난 주기(스트레스·질병)가
  -- 평균을 통째로 끌고 가는 게 예측이 이상해지는 흔한 원인이다.
  select percentile_cont(0.5) within group (order by g)::int,
         coalesce(stddev_samp(g), 0)
    into v_len, v_sd from unnest(v_gaps) g;

  -- 편차가 크면 틀린 예측을 주는 것보다 안 주는 게 낫다.
  if v_sd >= 7 then
    return json_build_object('status', 'irregular', 'cycleLength', v_len);
  end if;

  select coalesce(percentile_cont(0.5) within group (
           order by (period_end - period_start + 1))::int, 5)
    into v_dur from cycles
   where user_id = p_user and period_end is not null;

  v_last := v_starts[1];
  v_next := v_last + v_len;

  return json_build_object(
    'status',       'ok',
    'cycleLength',  v_len,
    'variance',     round(v_sd, 1),
    'recentGaps',   v_gaps,
    'lastStart',    v_last,
    -- 날짜 하나가 아니라 구간으로 준다
    'nextFrom',     v_next - 2,
    'nextTo',       v_next + 2,
    'nextDuration', v_dur,
    -- 배란은 거꾸로 센다. 다음 예정일 − 14다.
    -- 황체기(배란~다음 생리)는 개인차가 적지만 난포기는 크게 변한다.
    -- 마지막 시작일 + 14로 앞으로 세면 틀린다.
    --
    -- 다만 다음 예정일 자체가 추정치라 이건 추정 위에 쌓은 추정이다.
    -- 오차가 곱해지므로 구간을 넓게 잡는다. (배란 오차 + 정자 생존)
    'fertileFrom',  v_next - 19,
    'fertileTo',    v_next - 11
  );
end $$;

-- ── 내 화면 ─────────────────────────────────────────────────────
--
-- 본인만 보는 것들이 여기 다 모여 있다.
-- 예측 근거 숫자, 지연 감지, 진행 일수 — 하나도 상대에게 가지 않는다.
create or replace function public.my_health()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_s       health_sharing%rowtype;
  v_pred    json;
  v_open    cycles%rowtype;
  v_delay   int;
begin
  if v_me is null then return null; end if;

  select * into v_s from health_sharing where user_id = v_me;
  if not found then
    insert into health_sharing (user_id) values (v_me)
    on conflict (user_id) do nothing;
    select * into v_s from health_sharing where user_id = v_me;
  end if;

  if v_s.cycle_module_on then
    v_pred := cycle_prediction(v_me);

    -- 진행 중인 기록. period_end가 비어 있고 시작한 지 얼마 안 된 것.
    select * into v_open from cycles
     where user_id = v_me and period_end is null
       and period_start > current_date - 30
     order by period_start desc limit 1;

    -- 지연 감지. 예상 구간 끝을 지났는데 새 기록이 없으면.
    -- 본인에게만 간다. 푸시로 보내지 않고 앱 안 배너로만 띄운다.
    if v_pred->>'status' = 'ok' and v_open.id is null then
      select greatest(0, current_date - (v_pred->>'nextTo')::date) into v_delay;
      if v_delay = 0 then v_delay := null; end if;
    end if;
  end if;

  return json_strip_nulls(json_build_object(
    'cycleModuleOn',    v_s.cycle_module_on,
    'shareCycle',       v_s.share_cycle,
    'shareCondition',   v_s.share_condition,
    'avoidInFreeSlots', v_s.avoid_in_free_slots,
    'consentedAt',      v_s.consented_at,
    'today', (
      select json_build_object(
        'energy', energy, 'painAreas', pain_areas, 'memo', memo,
        'flow', c2.flow, 'pain', c2.pain, 'symptoms', c2.symptoms)
      from conditions c
      left join cycles c2
        on c2.user_id = v_me
       and current_date between c2.period_start
           and coalesce(c2.period_end, c2.period_start + 4)
      where c.user_id = v_me and c.on_date = current_date
    ),
    'prediction', v_pred,
    -- 진행 중이면 버튼이 '오늘 끝났어요'로 바뀐다
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
               'id', id, 'from', period_start, 'to', period_end,
               'flow', flow, 'pain', pain, 'symptoms', symptoms, 'memo', memo)
             order by period_start desc)
      from cycles where user_id = v_me
        and period_start > current_date - interval '12 months'
    ) end
  ));
end $$;

-- 7일 질문에 답하면 다시 묻지 않는다
create or replace function public.ack_ongoing(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update cycles set ongoing_asked = true
   where id = p_id and user_id = auth.uid();
end $$;

-- ── 상대 화면 ───────────────────────────────────────────────────
--
-- 상대에게 나가는 건 정확히 넷이다.
--   생리 시작·끝 구간 · 임신 가능성 높은 구간 · 진행 중 여부 · 컨디션
--
-- 안 나가는 것: 며칠째인지, 생리량, 통증 정도, 증상, 메모,
--               예측 근거 숫자(주기 길이·편차·최근 간격), 지연 여부
create or replace function public.partner_health()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_p    uuid := my_partner_id();
  v_s    health_sharing%rowtype;
  v_pred json;
begin
  if v_p is null then return null; end if;

  select * into v_s from health_sharing where user_id = v_p;
  -- 설정 행이 없는 것과 전부 꺼둔 것이 같게 보여야 한다
  if not found then return json_build_object('shared', false); end if;

  if v_s.share_cycle then v_pred := cycle_prediction(v_p); end if;

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
        select exists (select 1 from cycles where user_id = v_p
          and current_date between period_start
              and coalesce(period_end, period_start + 4))
      ) end,
    -- 구간만. 예측 근거 숫자는 나가지 않는다.
    'fertileFrom', case when v_s.share_cycle then v_pred->>'fertileFrom' end,
    'fertileTo',   case when v_s.share_cycle then v_pred->>'fertileTo'   end
  ));
end $$;

-- ── 기록 ────────────────────────────────────────────────────────
--
-- 큰 버튼 하나로 시작·종료가 다 된다.
-- 진행 중이면 '오늘 끝났어요'로 바뀐다.
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

  insert into cycles (user_id, period_start) values (v_me, v_d)
  on conflict (user_id, period_start) do update set period_start = excluded.period_start
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.log_period_end(p_date date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_d  date := coalesce(p_date, current_date);
begin
  update cycles set period_end = v_d, ongoing_asked = true
   where user_id = v_me and period_end is null
     and period_start <= v_d and period_start > v_d - 30;
end $$;

-- 하루 한 줄. 덮어쓴다.
-- 컨디션과 주기 항목이 같은 화면에 있다.
-- 하루에 두 군데를 기록하게 하면 둘 다 안 쓴다.
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
  v_me uuid := auth.uid();
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
    update cycles set flow = p_flow, pain = p_pain, symptoms = p_symptoms
     where user_id = v_me
       and current_date between period_start
           and coalesce(period_end, period_start + 4);
  end if;
end $$;

-- ── 공개 설정 ───────────────────────────────────────────────────
--
-- 끄면 조용히 사라진다. 상대에게 알림을 보내지 않는다.
-- 켠 이력·끈 이력을 저장하지 않는다.
--
-- 모듈을 끄면 기록이 즉시 파기된다. 유예를 두지 않는다.
-- 건강 정보는 다른 데이터와 다르게 취급한다 → docs/22-privacy.md
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

-- 파기 전에 내보낼 수 있어야 한다. 본인 것만.
create or replace function public.export_my_health()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'exportedAt', now(),
    'cycles', coalesce((
      select json_agg(json_build_object(
        'periodStart', period_start, 'periodEnd', period_end,
        'flow', flow, 'pain', pain, 'symptoms', symptoms, 'memo', memo)
        order by period_start)
      from cycles where user_id = auth.uid()), '[]'::json),
    'conditions', coalesce((
      select json_agg(json_build_object(
        'date', on_date, 'energy', energy,
        'painAreas', pain_areas, 'memo', memo)
        order by on_date)
      from conditions where user_id = auth.uid()), '[]'::json)
  );
$$;

-- ── 빈 시간 찾기 반영 ───────────────────────────────────────────
--
-- 기본 꺼짐. 켜면 예상 기간의 후보 점수를 낮춘다.
-- 완전히 제외하지 않는다. 그 기간에 만나면 안 되는 게 아니다.
--
-- 이유는 본인 화면에만 뜬다. 상대 화면에는 순위가 조금 낮은 후보로만 보인다.
-- 비공개 일정을 다루는 방식과 같다 → docs/17-availability.md
drop function if exists public.find_free_slots(timestamptz, timestamptz, int, int);
drop type if exists free_slot;

create type free_slot as (
  starts_at           timestamptz,
  ends_at             timestamptz,
  minutes             int,
  score               int,
  -- 내 비공개 일정과 겹침. 호출자 본인에게만 의미가 있다.
  my_private_conflict boolean,
  -- 내 생리 예상 기간과 겹침. 상대에게는 항상 false다.
  my_cycle_window     boolean
);

/**
 * 예상 생리 기간을 daterange multirange로.
 *
 * avoid_in_free_slots를 켠 사람만 대상이다. 안 켜면 빈 범위를 돌려준다.
 * 다음 두 주기까지 투영한다. 기본 검색 범위가 14일이라 하나면 충분하지만,
 * 사용자가 두 달을 검색하면 두 번째 주기도 걸려야 한다.
 */
create or replace function public.predicted_period_range(p_user uuid)
returns datemultirange
language plpgsql stable security definer set search_path = public as $$
declare
  v_pred json;
  v_len  int;
  v_dur  int;
  v_from date;
  v_out  datemultirange := '{}'::datemultirange;
  i      int;
begin
  if not exists (select 1 from health_sharing
                 where user_id = p_user and cycle_module_on and avoid_in_free_slots)
  then return v_out; end if;

  v_pred := cycle_prediction(p_user);
  if v_pred->>'status' <> 'ok' then return v_out; end if;

  v_len  := (v_pred->>'cycleLength')::int;
  v_dur  := (v_pred->>'nextDuration')::int;
  v_from := (v_pred->>'nextFrom')::date;

  for i in 0..1 loop
    -- nextFrom~nextTo는 시작일의 불확실 구간이고, 거기서 기간만큼 이어진다
    v_out := v_out + multirange(daterange(
      v_from + (i * v_len),
      v_from + (i * v_len) + 4 + v_dur
    ));
  end loop;

  return v_out;
end $$;

create or replace function public.find_free_slots(
  p_from        timestamptz default now(),
  p_to          timestamptz default now() + interval '14 days',
  p_min_minutes int default null,   -- null이면 availability_prefs를 쓴다
  p_limit       int default 5
) returns setof free_slot
language plpgsql stable security definer set search_path = public as $$
declare
  v_couple uuid := my_couple_id();
  v_me     uuid := auth.uid();
  v_tz     text;
  v_min    int;
  v_busy   tstzmultirange;
  v_soft   tstzmultirange;
  v_win    tstzmultirange;
  v_cyc_me datemultirange;
  v_cyc_us datemultirange;
begin
  if v_couple is null then raise exception 'NOT_PAIRED'; end if;

  select coalesce(timezone, 'Asia/Seoul') into v_tz from profiles where id = v_me;

  -- 최소 길이. 40분짜리 틈을 데이트 시간이라고 내밀면 신뢰를 잃는다.
  select coalesce(p_min_minutes, max(min_slot_min), 120) into v_min
    from availability_prefs
   where user_id in (select id from profiles where couple_id = v_couple);

  -- 예상 기간. 점수는 두 사람 것을 합쳐서 깎고, 표시는 내 것만 한다.
  v_cyc_me := predicted_period_range(v_me);
  select coalesce(range_agg(r), '{}'::datemultirange) into v_cyc_us from (
    select unnest(predicted_period_range(p.id)) as r
    from profiles p where p.couple_id = v_couple
  ) x;

  -- ── 1·2단계. 바쁜 구간 + 앞뒤 여유 ────────────────────────────
  --
  -- 공개 수준을 가리지 않는다. private도 포함한다.
  -- 회의가 18:00에 끝나는데 18:00부터 데이트를 잡으면 안 되므로
  -- 각 구간 앞뒤에 buffer_min을 붙인다. 사람마다 이동 시간이 다르다.
  --
  -- 단 '내 비공개'는 따로 뺀다. 상대의 비공개는 후보에서 아예 지우고,
  -- 내 비공개는 후보로 남기되 경고만 붙인다 → docs/17-availability.md
  with blocking as (
    select
      e.owner_id,
      e.visibility,
      tstzrange(
        e.starts_at - (coalesce(ap.buffer_min, 30) || ' minutes')::interval,
        e.ends_at   + (coalesce(ap.buffer_min, 30) || ' minutes')::interval
      ) as span
    from events e
    left join availability_prefs ap on ap.user_id = e.owner_id
    where e.couple_id = v_couple
      and e.deleted_at is null
      and e.blocks_time
      and e.status <> 'declined'
      and e.starts_at < p_to
      and e.ends_at   > p_from
  )
  select
    coalesce(range_agg(span) filter (
      where not (owner_id = v_me and visibility = 'private')
    ), '{}'::tstzmultirange),
    coalesce(range_agg(span) filter (
      where owner_id = v_me and visibility = 'private'
    ), '{}'::tstzmultirange)
  into v_busy, v_soft
  from blocking;

  -- ── 3단계. 두 사람 가용 시간대의 교집합 ───────────────────────
  --
  -- 이 단계가 없으면 새벽 3시가 "둘 다 한가한 시간"으로 추천된다.
  with days as (
    select generate_series(
             (p_from at time zone v_tz)::date,
             (p_to   at time zone v_tz)::date,
             interval '1 day'
           )::date as d
  ),
  prefs as (
    select
      -- 두 사람 모두를 만족하는 창만 남긴다
      max(weekday_from) as wd_from, min(weekday_to) as wd_to,
      max(weekend_from) as we_from, min(weekend_to) as we_to
    from availability_prefs
    where user_id in (select id from profiles where couple_id = v_couple)
  ),
  windows as (
    select tstzrange(
             ((d + case when extract(dow from d) in (0, 6)
                        then coalesce(p.we_from, '10:00'::time)
                        else coalesce(p.wd_from, '19:00'::time) end)
              at time zone v_tz),
             ((d + case when extract(dow from d) in (0, 6)
                        then coalesce(p.we_to, '22:00'::time)
                        else coalesce(p.wd_to, '23:00'::time) end)
              at time zone v_tz)
           ) as span
    from days, prefs p
  )
  select coalesce(range_agg(span), '{}'::tstzmultirange) into v_win
  from windows
  where not isempty(span);

  -- 요청 범위 밖은 잘라낸다
  v_win := v_win * multirange(tstzrange(p_from, p_to));

  -- ── 4·5·6단계. 반전 → 최소 길이 → 점수 ───────────────────────
  return query
  with free as (
    select unnest(v_win - v_busy) as span
  ),
  sized as (
    select
      lower(span) as s,
      upper(span) as e,
      (extract(epoch from (upper(span) - lower(span))) / 60)::int as mins
    from free
  ),
  scored as (
    select
      s, e, mins,
      (
        -- 길이
        case when mins >= 300 then 30 when mins >= 180 then 20 else 0 end
        -- 요일. 토·일이 가장 크다
        + case when extract(dow from (s at time zone v_tz)) in (0, 6) then 40
               when extract(dow from (s at time zone v_tz)) = 5 then 20
               else 0 end
        -- 가까울수록
        + case when s < now() + interval '7 days' then 20
               when s < now() + interval '14 days' then 10
               else 0 end
        -- 주말 낮 시작
        + case when extract(dow from (s at time zone v_tz)) in (0, 6)
                and (s at time zone v_tz)::time between '11:00' and '14:00'
               then 15 else 0 end
        -- 예상 기간이면 낮춘다. 제외하지는 않는다.
        -- 누구 것인지는 여기서 구별하지 않는다 — 구별하면 점수 차이로
        -- 상대의 주기를 역산할 수 있다.
        + case when v_cyc_us @> (s at time zone v_tz)::date then -25 else 0 end
      )::int as score
    from sized
    where mins >= v_min
  )
  select
    s, e, mins, score,
    -- 내 비공개 일정과 겹치는가. 상대 화면에는 이 값이 의미 없다.
    (v_soft && multirange(tstzrange(s, e))) as my_private_conflict,
    -- 내 예상 기간과 겹치는가. 상대에게는 항상 false다.
    (v_cyc_me @> (s at time zone v_tz)::date) as my_cycle_window
  from scored
  order by score desc, s
  limit greatest(p_limit, 1);
end $$;

-- ── 권한 ────────────────────────────────────────────────────────
--
-- 인자로 남의 uuid를 받는 함수는 절대 열어두지 않는다.
-- 열려 있으면 상대가 직접 불러서 예측 근거 숫자를 볼 수 있다.
revoke execute on function public.cycle_prediction(uuid)      from public, anon, authenticated;
revoke execute on function public.predicted_period_range(uuid) from public, anon, authenticated;
