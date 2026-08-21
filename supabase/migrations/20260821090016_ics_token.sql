-- 0016 .ics 토큰 발급 · 조회
--
-- ics_tokens는 정책이 0개다. 클라이언트가 직접 못 읽고 못 쓴다.
-- 대신 필요한 두 동작만 security definer 함수로 연다.
--
-- 이 토큰이 든 URL은 인증이 불가능한 공개 주소다. 캘린더 앱은 로그인을 못 한다.
-- 그래서 재발급이 유일한 대응 수단이고, 반드시 제공해야 한다 → docs/12-ics-feed.md

-- 발급. 이전 토큰은 즉시 무효가 된다. 항상 하나만 유효하다.
create or replace function public.issue_ics_token()
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  update ics_tokens set revoked_at = now()
   where user_id = auth.uid() and revoked_at is null;

  -- 32바이트 랜덤. URL에 들어가므로 base64url로 바꾼다.
  v_token := replace(replace(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+', '-'), '/', '_');

  insert into ics_tokens (token, user_id) values (v_token, auth.uid());
  return v_token;
end $$;

-- 현재 토큰과 마지막 읽힌 시각.
-- last_read가 차 있으면 캘린더 앱이 실제로 구독했다는 뜻이다 → docs/21-onboarding.md
create or replace function public.my_ics_token()
returns table (token text, last_read timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.token, t.last_read, t.created_at
  from ics_tokens t
  where t.user_id = auth.uid() and t.revoked_at is null
  order by t.created_at desc
  limit 1
$$;

-- 연결 해제·탈퇴 시 무효화하는 자리.
-- 빠뜨리면 헤어진 뒤에도 내 일정이 상대 캘린더 앱으로 계속 흘러간다.
-- dissolve_couple()은 7단계에서 만들며, 그때 이 함수를 호출한다.
create or replace function public.revoke_ics_tokens(p_user uuid)
returns void
language sql security definer set search_path = public as $$
  update ics_tokens set revoked_at = now()
   where user_id = p_user and revoked_at is null;
$$;

revoke execute on function public.revoke_ics_tokens(uuid) from public, anon, authenticated;
