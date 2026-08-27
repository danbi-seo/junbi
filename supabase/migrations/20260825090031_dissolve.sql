-- 0031 연결 해제 · 파기 · 탈퇴
--
-- 근거: docs/08-auth-pairing.md 5~7, docs/22-privacy.md
--
-- 원칙 셋.
--   1. 개발자에게 요청하지 않는다. 앱 안에서 끝난다
--   2. 상대 동의를 받지 않는다. 한쪽이 누르면 즉시 끊긴다
--   3. 무슨 일이 일어나는지 미리 다 말한다
--
-- 2번이 중요한 이유: 승인 대기 상태를 만들면 그 사이 상대는 계속 내 일정과
-- 상태를 본다. 헤어지는 상황에서 이건 안전 문제다.
--
-- couples.status만 바꿔도 my_couple_id()가 null을 돌려주므로
-- 모든 테이블 조회가 한 번에 막힌다. 정책을 하나도 안 고쳐도 된다.

/**
 * 해제 확인 화면에 띄울 숫자.
 *
 * '모든 데이터가 삭제됩니다'보다 '함께 일정 142개'가 훨씬 정확한 판단을
 * 만든다. 세어서 보여준다 → docs/08-auth-pairing.md 5
 */
create or replace function public.dissolve_summary()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_couple uuid := my_couple_id();
  v_me     uuid := auth.uid();
begin
  if v_couple is null then return null; end if;

  return json_build_object(
    -- 30일 뒤에 사라지는 것 (공동 소유)
    'sharedEvents', (select count(*) from events
                      where couple_id = v_couple and deleted_at is null
                        and scope = 'shared'),
    'places',       (select count(*) from places where couple_id = v_couple),
    'expenses',     (select count(*) from expenses where couple_id = v_couple),
    'checklists',   (select count(*) from checklists where couple_id = v_couple),
    'anniversaries',(select count(*) from anniversaries where couple_id = v_couple),
    -- 유예 없이 즉시 사라지는 것
    'cycles',       (select count(*) from cycles where user_id = v_me),
    'conditions',   (select count(*) from conditions where user_id = v_me),
    -- 남는 것. 이걸 알려줘야 "다 없어지나" 하는 공포가 안 생긴다
    'myEvents',     (select count(*) from events
                      where couple_id = v_couple and deleted_at is null
                        and scope = 'personal' and owner_id = v_me)
  );
end $$;

/**
 * 연결 해제.
 *
 * 한쪽이 누르면 즉시 끊긴다. 상대 동의를 요구하지 않는다.
 *
 * p_purge_now = true면 30일 유예 없이 지금 지운다.
 * 기다리고 싶지 않은 사람이 있고, 그게 권리다 → docs/08-auth-pairing.md 5
 */
create or replace function public.dissolve_couple(p_purge_now boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_couple  uuid := my_couple_id();
  v_me      uuid := auth.uid();
  v_partner uuid := my_partner_id();
  v_label   text;
begin
  if v_couple is null then raise exception 'NOT_PAIRED'; end if;

  -- 알림을 먼저 보낸다. status를 바꾸고 나면 my_partner_id()가 null이라
  -- 보낼 대상을 못 찾는다. 해제 알림은 설정으로 끌 수 없다.
  v_label := partner_label(v_partner, v_me);
  perform enqueue_partner_notification(
    'dissolved', '연결이 해제되었어요', '', '/', 'dissolved',
    'dissolved:' || v_couple
  );

  -- ── 유예 없이 즉시 파기: 건강 정보 ──────────────────────────
  --
  -- 재결합 가능성보다 '헤어진 뒤에도 상대의 주기 데이터가 서버에 남아
  -- 있다는 사실의 무게'가 크다 → docs/19-health.md J
  delete from cycles     where user_id in (v_me, v_partner);
  delete from conditions where user_id in (v_me, v_partner);
  delete from statuses   where user_id in (v_me, v_partner);
  update health_sharing set
    cycle_module_on = false, share_cycle = false,
    share_condition = false, avoid_in_free_slots = false
  where user_id in (v_me, v_partner);

  -- ── 즉시 무효화: 캘린더 구독 ────────────────────────────────
  --
  -- 빠뜨리면 상대 캘린더 앱으로 내 일정이 계속 흘러간다.
  -- .ics는 service_role로 도는 라우트라 RLS가 안 걸린다.
  update ics_tokens set revoked_at = now()
   where user_id in (v_me, v_partner) and revoked_at is null;

  -- ── 미사용 초대 코드 무효화 ─────────────────────────────────
  --
  -- 빠뜨리면 헤어진 뒤 옛 코드로 제3자가 들어온다.
  update invites set used_at = now()
   where couple_id = v_couple and used_at is null;

  -- ── 관계 끊기 ───────────────────────────────────────────────
  update profiles
     set previous_couple_id = couple_id, couple_id = null, member_slot = null
   where couple_id = v_couple;

  update couples set
    status = 'dissolved',
    dissolved_at = now(),
    dissolved_by = v_me,
    purge_after = case when p_purge_now then now() else now() + interval '30 days' end
  where id = v_couple;

  -- push_subscriptions는 유지한다. 해제 알림이 가야 하고,
  -- 기기 등록은 계정에 붙은 것이지 관계에 붙은 것이 아니다.
  -- calendar_accounts도 개인 것이라 유지한다.

  if p_purge_now then
    perform purge_couple(v_couple);
  end if;
end $$;

/**
 * 실제 삭제. couples를 지우면 FK cascade로 나머지가 따라간다.
 *
 * ⚠ profiles.couple_id / previous_couple_id는 on delete set null이라
 *   프로필은 살아남는다. 의도한 것이다 — 관계가 끝나도 계정은 남는다.
 */
create or replace function public.purge_couple(p_couple uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from couples where id = p_couple;
end $$;

/** pg_cron이 매일 부른다. 유예가 끝난 것만. */
create or replace function public.purge_dissolved_couples()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  with gone as (
    delete from couples
     where status = 'dissolved' and purge_after is not null and purge_after < now()
    returning id
  )
  select count(*) into v_n from gone;

  -- 로그는 건수만. "누가 언제 헤어졌다"를 계속 들고 있을 이유가 없다.
  return v_n;
end $$;

/**
 * 해제 전 내보내기. 본인이 만든 것만.
 *
 * 체크리스트는 뺀다 — 공동 작업물이라 '내 것'이라고 하기 어렵다.
 * 건강 기록은 export_my_health()가 따로 있다. 해제하면 즉시 사라지므로
 * 그쪽을 먼저 받아야 한다.
 */
create or replace function public.export_my_couple_data()
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'exportedAt', now(),
    'events', coalesce((
      select json_agg(json_build_object(
        'title', e.title, 'emoji', e.emoji,
        'startsAt', e.starts_at, 'endsAt', e.ends_at, 'allDay', e.all_day,
        'scope', e.scope, 'visibility', e.visibility, 'memo', e.memo)
        order by e.starts_at)
      from events e
      where e.owner_id = auth.uid() and e.deleted_at is null), '[]'::json),
    'places', coalesce((
      select json_agg(json_build_object(
        'name', p.name, 'category', p.category, 'address', p.address,
        'memo', p.memo, 'visitedAt', p.visited_at)
        order by p.created_at)
      from places p
      where p.added_by = auth.uid()), '[]'::json),
    'expenses', coalesce((
      select json_agg(json_build_object(
        'amount', x.amount, 'split', x.split, 'category', x.category,
        'memo', x.memo, 'occurredAt', x.occurred_at)
        order by x.occurred_at)
      from expenses x
      where x.payer_id = auth.uid()), '[]'::json)
  );
$$;

-- ── 복구 ────────────────────────────────────────────────────────
--
-- 끊는 건 혼자 할 수 있어야 하고, 잇는 건 둘이 동의해야 한다.
-- 방향이 다르기 때문이다 → docs/08-auth-pairing.md 5
--
-- 건강 기록은 이미 삭제됐으므로 복구되지 않는다.

create table if not exists restore_requests (
  couple_id  uuid primary key references couples(id) on delete cascade,
  asked_by   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table restore_requests enable row level security;

-- 해제된 커플의 두 사람만 본다. previous_couple_id로 찾는다.
drop policy if exists "옛 짝만" on restore_requests;
create policy "옛 짝만" on restore_requests for all
  using (couple_id in (select previous_couple_id from profiles where id = auth.uid()))
  with check (couple_id in (select previous_couple_id from profiles where id = auth.uid()));

grant select, insert, update, delete on restore_requests to authenticated;

/** 유예 기간 중 다시 연결하자고 청한다. */
create or replace function public.request_restore()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev uuid;
  v_ok   boolean;
begin
  select previous_couple_id into v_prev from profiles where id = auth.uid();
  if v_prev is null then raise exception 'NO_PREVIOUS'; end if;

  select status = 'dissolved' and purge_after > now() into v_ok
    from couples where id = v_prev;
  if not coalesce(v_ok, false) then raise exception 'EXPIRED'; end if;

  insert into restore_requests (couple_id, asked_by)
  values (v_prev, auth.uid())
  on conflict (couple_id) do update set asked_by = excluded.asked_by,
                                        created_at = now();
end $$;

/** 상대가 수락하면 되살아난다. 청한 사람이 스스로 수락할 수는 없다. */
create or replace function public.accept_restore()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev uuid;
  v_req  restore_requests%rowtype;
begin
  select previous_couple_id into v_prev from profiles where id = auth.uid();
  if v_prev is null then raise exception 'NO_PREVIOUS'; end if;

  select * into v_req from restore_requests where couple_id = v_prev;
  if not found then raise exception 'NO_REQUEST'; end if;
  if v_req.asked_by = auth.uid() then raise exception 'NEED_PARTNER'; end if;

  if not exists (select 1 from couples
                 where id = v_prev and status = 'dissolved' and purge_after > now())
  then raise exception 'EXPIRED'; end if;

  update couples set status = 'active', dissolved_at = null,
                     dissolved_by = null, purge_after = null
   where id = v_prev;

  -- 슬롯은 만든 순서대로 다시 준다. previous_couple_id가 같은 두 사람이다.
  with ranked as (
    select id, row_number() over (order by created_at) as n
    from profiles where previous_couple_id = v_prev
  )
  update profiles p
     set couple_id = v_prev,
         member_slot = (case when r.n = 1 then 'a' else 'b' end)::member_slot,
         previous_couple_id = null
    from ranked r where p.id = r.id;

  delete from restore_requests where couple_id = v_prev;
end $$;

revoke execute on function public.purge_couple(uuid) from public, anon, authenticated;
revoke execute on function public.purge_dissolved_couples() from public, anon, authenticated;
