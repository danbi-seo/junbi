-- 0단계 — 계정 두 개를 SQL로 직접 연결한다.
--
-- 페어링 화면(초대 링크 + 양쪽 확인)은 7단계다. 지금 만들면 며칠이 걸리는데,
-- 두 사람 연결은 SQL 한 번이면 된다 → docs/03-roadmap.md
--
-- 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run
-- 여러 번 실행해도 안전하다. 이름·생일은 아래에서 고쳐 쓰면 된다.
--
-- 계정 ID를 손으로 넣지 않는다. 가입 순서로 알아서 잡는다.
-- 먼저 만든 쪽이 슬롯 a, 나중이 b다. (색은 성별이 아니라 슬롯에 붙는다)

do $$
declare
  v_a      uuid;
  v_b      uuid;
  v_couple uuid;
  v_n      int;
begin
  select count(*) into v_n from auth.users;
  if v_n <> 2 then
    raise exception
      '계정이 정확히 2개여야 합니다. 현재 %개. 대시보드 Authentication → Users에서 확인하세요.', v_n;
  end if;

  select id into v_a from auth.users order by created_at asc  limit 1;
  select id into v_b from auth.users order by created_at desc limit 1;

  -- ── 커플 ──────────────────────────────────────────────
  select couple_id into v_couple
    from profiles where id = v_a and couple_id is not null;

  if v_couple is null then
    insert into couples (status, started_on)
    values ('active', current_date - 180)      -- 사귄 날. D-day 기준
    returning id into v_couple;
  else
    update couples set status = 'active' where id = v_couple;
  end if;

  -- ── 프로필 ────────────────────────────────────────────
  -- name         페어링 확인 화면에서만 쓰는 실명 자리
  -- display_name 본인이 정한 표시 이름
  -- pet_name_for_partner  내가 상대를 부르는 애칭 (내 화면에 우선)
  insert into profiles
    (id, name, birth_date, display_name, emoji_key, pet_name_for_partner,
     couple_id, member_slot)
  values
    (v_a, 'A', '1996-03-15', '나',   '🐰', '토리', v_couple, 'a'),
    (v_b, 'B', '1997-08-03', '상대', '🐻', '곰돌이', v_couple, 'b')
  on conflict (id) do update set
    couple_id            = excluded.couple_id,
    member_slot          = excluded.member_slot,
    display_name         = excluded.display_name,
    emoji_key            = excluded.emoji_key,
    pet_name_for_partner = excluded.pet_name_for_partner;

  -- ── 기본 설정 ─────────────────────────────────────────
  insert into notification_prefs (user_id) values (v_a), (v_b)
    on conflict (user_id) do nothing;
  insert into health_sharing (user_id) values (v_a), (v_b)
    on conflict (user_id) do nothing;
  insert into availability_prefs (user_id) values (v_a), (v_b)
    on conflict (user_id) do nothing;
  insert into onboarding_progress (user_id) values (v_a), (v_b)
    on conflict (user_id) do nothing;

  -- ── 검증용 일정 4개 ───────────────────────────────────
  -- 네 가지 성격이 각각 상대에게 어떻게 보이는지 확인하려면 넷 다 있어야 한다.
  delete from events where couple_id = v_couple and title like '[테스트]%';

  insert into events
    (couple_id, owner_id, scope, visibility, title, emoji, starts_at, ends_at)
  values
    -- 1. 함께 — 양쪽에 제목까지 보인다
    (v_couple, v_a, 'shared', 'full', '[테스트] 본가 저녁', '🍽',
     (current_date + time '19:00') at time zone 'Asia/Seoul',
     (current_date + time '21:00') at time zone 'Asia/Seoul'),

    -- 2. 내 일정 · 전체 공개 — 상대에게 제목까지 보인다
    (v_couple, v_a, 'personal', 'full', '[테스트] 팀 회의', '💼',
     (current_date + time '10:00') at time zone 'Asia/Seoul',
     (current_date + time '11:30') at time zone 'Asia/Seoul'),

    -- 3. 내 일정 · 시간만 — 상대에게 '일정 있음'으로만 보인다
    (v_couple, v_a, 'personal', 'busy', '[테스트] 병원 예약', '🏥',
     (current_date + time '14:00') at time zone 'Asia/Seoul',
     (current_date + time '15:00') at time zone 'Asia/Seoul'),

    -- 4. 내 일정 · 비공개 — 상대에게 아예 안 보인다
    (v_couple, v_a, 'personal', 'private', '[테스트] 선물 사러', '🎁',
     (current_date + time '21:30') at time zone 'Asia/Seoul',
     (current_date + time '22:30') at time zone 'Asia/Seoul');

  raise notice '연결 완료. 슬롯 a=% / 슬롯 b=%', v_a, v_b;
end $$;

-- 결과 확인
select
  p.member_slot                     as 슬롯,
  p.display_name                    as 표시이름,
  p.emoji_key                       as 이모지,
  p.pet_name_for_partner            as "상대를 부르는 이름",
  c.status                          as 커플상태,
  c.started_on                      as 사귄날
from profiles p
join couples c on c.id = p.couple_id
order by p.member_slot;

select
  scope       as 성격,
  visibility  as 공개수준,
  title       as 제목,
  to_char(starts_at at time zone 'Asia/Seoul', 'HH24:MI') as 시각
from events
where title like '[테스트]%'
order by starts_at;
