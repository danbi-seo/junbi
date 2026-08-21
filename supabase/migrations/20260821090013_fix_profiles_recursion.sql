-- 0013 profiles 정책 무한 재귀 수정
--
-- 증상: profiles를 조회하면 42P17 infinite recursion detected
-- 원인: profiles 정책의 조건이 profiles를 다시 읽는다.
--       그 조회에 또 정책이 걸리고, 그 정책이 또 profiles를 읽는다.
--
-- 해결: 조건을 security definer 함수로 옮긴다.
--       security definer는 RLS를 우회하므로 재귀가 끊긴다.
--       my_couple_id()가 이미 같은 방식이라 문제가 없었다.
--
-- 검출: scripts/verify-rls.mjs — profiles 조회가 500을 반환

-- 확정 대기(pending) 중인 커플. 페어링 확인 화면에서 상대 이름·생일을 보려면
-- 필요하다. my_couple_id()는 active만 반환하므로 따로 있어야 한다.
create or replace function public.my_pending_couple_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.couple_id from profiles p
  join couples c on c.id = p.couple_id
  where p.id = auth.uid() and c.status = 'pending'
$$;

-- 내가 속한 커플 전부. status를 가리지 않는다.
-- pending은 확인 화면, dissolved는 복구 안내를 띄워야 하므로 보여야 한다.
-- 해제되면 profiles.couple_id가 null이 되고 previous_couple_id로 옮겨간다.
create or replace function public.my_couple_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select couple_id from profiles
   where id = auth.uid() and couple_id is not null
  union
  select previous_couple_id from profiles
   where id = auth.uid() and previous_couple_id is not null
$$;

-- ── profiles ────────────────────────────────────────────────────
drop policy if exists "확정 대기 중 상대 프로필 조회" on profiles;

create policy "확정 대기 중 상대 프로필 조회" on profiles
  for select using (
    couple_id is not null and couple_id = my_pending_couple_id()
  );

-- ── couples ─────────────────────────────────────────────────────
-- 여기도 정책 안에서 profiles를 읽고 있었다. 지금은 profiles 쪽이 고쳐져
-- 재귀가 나지 않지만, 정책이 서로를 타고 도는 구조 자체를 없앤다.
drop policy if exists "내 커플 조회" on couples;
drop policy if exists "내 커플 수정" on couples;

create policy "내 커플 조회" on couples
  for select using (id in (select my_couple_ids()));

create policy "내 커플 수정" on couples
  for update using (id in (select my_couple_ids()));
