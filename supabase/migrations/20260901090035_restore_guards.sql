-- 0035 복구가 새 관계를 덮어쓰던 문제
--
-- 재현:
--   A와 B가 연결 → 해제 → A가 C와 새로 연결
--   → B가 '다시 연결하기'를 청하고 A가 수락
--   → **A가 C와의 커플에서 조용히 빠져나와 B에게 돌아간다.**
--     C는 혼자 남는다. 아무도 알림을 못 받는다.
--
-- 원인 둘.
--   1  request_restore·accept_restore가 '지금 짝이 있는지'를 안 봤다
--   2  새 커플이 확정돼도 previous_couple_id가 그대로 남아,
--      설정 화면에 옛 복구 카드가 계속 떠 있었다
--
-- 끊는 건 혼자 할 수 있어야 하지만, 그게 **이미 맺은 다른 관계를 끊는
-- 권한**까지 되면 안 된다. 복구는 둘 다 아직 혼자일 때만 성립한다.

/** 새 커플이 확정되면 옛 관계의 흔적을 지운다. 복구 경로도 함께 닫힌다. */
create or replace function public.confirm_pair(p_started_on date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_couple uuid := my_pending_couple_id();
  v_slot   member_slot;
begin
  if v_couple is null then raise exception 'NOTHING_PENDING'; end if;

  select member_slot into v_slot from profiles where id = v_me;
  if v_slot <> 'a' then raise exception 'NOT_INVITER'; end if;

  if (select count(*) from profiles where couple_id = v_couple) < 2 then
    raise exception 'NO_PARTNER_YET';
  end if;

  update couples set status = 'active', started_on = p_started_on
   where id = v_couple;

  -- 남은 초대 코드는 죽인다. 안 하면 세 번째 사람이 들어올 수 있다.
  update invites set used_at = now()
   where couple_id = v_couple and used_at is null;

  -- 여기가 되돌릴 수 없는 지점이다. 옛 커플로 돌아갈 길을 닫는다.
  -- 안 닫으면 설정 화면에 옛 복구 카드가 계속 뜨고, 누르면 새 관계가 끊긴다.
  update profiles set previous_couple_id = null where couple_id = v_couple;

  -- 옛 복구 요청도 지운다. 상대 쪽 화면에서만 살아 있으면 헷갈린다.
  delete from restore_requests r
   where r.couple_id in (
     select previous_couple_id from profiles where couple_id = v_couple
   );
end $$;

/** 지금 짝이 있으면 청할 수 없다. */
create or replace function public.request_restore()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev uuid;
  v_ok   boolean;
begin
  if my_couple_id() is not null then raise exception 'ALREADY_PAIRED'; end if;

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

/**
 * 둘 다 아직 혼자일 때만 되살린다.
 *
 * 한쪽이 이미 다른 사람과 연결했으면 복구는 성립하지 않는다.
 * 그 사람을 새 관계에서 끌어내는 일이 되기 때문이다.
 */
create or replace function public.accept_restore()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev uuid;
  v_req  restore_requests%rowtype;
  v_n    int;
begin
  if my_couple_id() is not null then raise exception 'ALREADY_PAIRED'; end if;

  select previous_couple_id into v_prev from profiles where id = auth.uid();
  if v_prev is null then raise exception 'NO_PREVIOUS'; end if;

  select * into v_req from restore_requests where couple_id = v_prev;
  if not found then raise exception 'NO_REQUEST'; end if;
  if v_req.asked_by = auth.uid() then raise exception 'NEED_PARTNER'; end if;

  if not exists (select 1 from couples
                 where id = v_prev and status = 'dissolved' and purge_after > now())
  then raise exception 'EXPIRED'; end if;

  -- 두 사람 다 아직 혼자여야 한다. 한쪽이 옮겨 갔으면 되돌릴 수 없다.
  select count(*) into v_n from profiles
   where previous_couple_id = v_prev and couple_id is null;
  if v_n <> 2 then raise exception 'PARTNER_MOVED_ON'; end if;

  update couples set status = 'active', dissolved_at = null,
                     dissolved_by = null, purge_after = null
   where id = v_prev;

  -- 슬롯은 만든 순서대로 다시 준다.
  with ranked as (
    select id, row_number() over (order by created_at) as n
    from profiles where previous_couple_id = v_prev and couple_id is null
  )
  update profiles p
     set couple_id = v_prev,
         member_slot = (case when r.n = 1 then 'a' else 'b' end)::member_slot,
         previous_couple_id = null
    from ranked r where p.id = r.id;

  delete from restore_requests where couple_id = v_prev;
end $$;
