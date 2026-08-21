-- 0009 헬퍼 함수
-- 근거: docs/06-data-model.md, docs/07-api.md
--
-- security definer 함수에는 반드시 search_path를 고정한다.
-- 빠뜨리면 권한 상승 취약점이 된다.

-- status = 'active' 조건이 들어 있는 게 핵심이다.
-- 연결 해제 시 couples.status 하나만 바꾸면 모든 테이블 조회가 동시에 막힌다.
-- 같은 조건이 pending도 처리한다. A가 확정하기 전까지 서로 데이터가 안 열린다.
create or replace function public.my_couple_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.couple_id from profiles p
  join couples c on c.id = p.couple_id
  where p.id = auth.uid() and c.status = 'active'
$$;

create or replace function public.my_partner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from profiles p
  where p.couple_id = my_couple_id() and p.id <> auth.uid()
$$;

-- 상대를 뭐라고 부를지. lib/naming.ts의 partnerLabel()과 같은 우선순위다.
-- p_viewer의 화면에서 p_owner를 부르는 이름.
-- auth.uid()를 쓰지 않으므로 service_role로 도는 .ics 라우트에서도 동작한다.
-- 실명(name)은 최후의 폴백이며 이 함수 밖에서 직접 읽지 않는다 → docs/11-naming.md
create or replace function public.partner_label(p_viewer uuid, p_owner uuid)
returns text language sql stable security definer set search_path = public as $
  select coalesce(
    (select v.pet_name_for_partner from profiles v where v.id = p_viewer),
    (select o.display_name         from profiles o where o.id = p_owner),
    (select o.name                 from profiles o where o.id = p_owner)
  )
$;

-- security definer라 RLS를 우회한다. 인자를 그대로 믿으면 아무 uuid나 넣어
-- 남의 실명을 조회할 수 있다. 클라이언트에서 직접 못 부르게 막고,
-- 서버(service_role)와 다른 security definer 함수 안에서만 쓴다.
revoke execute on function public.partner_label(uuid, uuid) from public, anon, authenticated;
