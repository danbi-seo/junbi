-- 0022 빈 시간 찾기
--
-- 근거: docs/17-availability.md
--
-- ⚠ 반드시 DB 함수여야 한다.
--
--   빈 시간을 정확히 계산하려면 상대의 비공개 일정 '시간'까지 알아야 한다.
--   그런데 비공개 일정은 클라이언트에 내려가면 안 된다.
--   클라이언트에서 계산하면 이 둘이 양립하지 않는다.
--
--   security definer 함수 안에서 계산하고 결과 구간만 내보내면 해결된다.
--   클라이언트는 "이 시간이 비었다"만 받고, 왜 다른 시간이 막혔는지는 알 수 없다.

create type free_slot as (
  starts_at           timestamptz,
  ends_at             timestamptz,
  minutes             int,
  score               int,
  -- 내 비공개 일정과 겹침. 호출자 본인에게만 의미가 있다.
  my_private_conflict boolean
);

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
begin
  if v_couple is null then raise exception 'NOT_PAIRED'; end if;

  select coalesce(timezone, 'Asia/Seoul') into v_tz from profiles where id = v_me;

  -- 최소 길이. 40분짜리 틈을 데이트 시간이라고 내밀면 신뢰를 잃는다.
  select coalesce(p_min_minutes, max(min_slot_min), 120) into v_min
    from availability_prefs
   where user_id in (select id from profiles where couple_id = v_couple);

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
      )::int as score
    from sized
    where mins >= v_min
  )
  select
    s, e, mins, score,
    -- 내 비공개 일정과 겹치는가. 상대 화면에는 이 값이 의미 없다.
    (v_soft && multirange(tstzrange(s, e))) as my_private_conflict
  from scored
  order by score desc, s
  limit greatest(p_limit, 1);
end $$;

-- 가용 시간대 기본값을 아직 안 만든 사용자에게 채워준다.
insert into availability_prefs (user_id)
select id from profiles on conflict (user_id) do nothing;

-- ── 일정 제안 ───────────────────────────────────────────────────
--
-- 빈 시간을 골랐다고 일정이 확정되면 안 된다.
-- 상대가 그 시간에 다른 계획이 있을 수 있다.
create or replace function public.propose_slot(
  p_starts timestamptz,
  p_ends   timestamptz,
  p_title  text,
  p_emoji  text default '✨'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := my_couple_id();
  v_id     uuid;
  v_label  text;
begin
  if v_couple is null then raise exception 'NOT_PAIRED'; end if;
  if p_ends <= p_starts then raise exception 'BAD_RANGE'; end if;

  insert into events (couple_id, owner_id, scope, visibility, status,
                      title, emoji, starts_at, ends_at)
  values (v_couple, auth.uid(), 'shared', 'full', 'proposed',
          coalesce(nullif(btrim(p_title), ''), '만나기'), p_emoji, p_starts, p_ends)
  returning id into v_id;

  -- 제안 알림은 설정으로 끌 수 없다.
  -- 제안해 놓고 알림이 안 가면 제안 자체가 무의미하다.
  v_label := partner_label(my_partner_id(), auth.uid());
  perform enqueue_partner_notification(
    'proposal',
    v_label || '님이 만날 시간을 제안했어요',
    to_char(p_starts at time zone 'Asia/Seoul', 'MM월 DD일 HH24:MI') || ' · ' || p_title,
    '/event/' || v_id,
    'proposal:' || v_id,
    'proposal:' || v_id
  );

  return v_id;
end $$;

/** 수락 · 거절. 거절은 지우지 않고 declined로 남긴다. */
create or replace function public.answer_proposal(p_event uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_label text; v_title text;
begin
  select title into v_title from events
   where id = p_event and couple_id = my_couple_id() and status = 'proposed';
  if v_title is null then raise exception 'NOT_FOUND'; end if;

  update events
     set status = case when p_accept then 'confirmed' else 'declined' end
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

-- 지난 제안은 자동으로 정리한다. 시간이 지난 제안이 계속 떠 있으면 안 된다.
create or replace function public.expire_proposals()
returns void
language sql security definer set search_path = public as $$
  update events set status = 'declined'
   where status = 'proposed' and starts_at < now();
$$;

revoke execute on function public.expire_proposals() from public, anon, authenticated;
