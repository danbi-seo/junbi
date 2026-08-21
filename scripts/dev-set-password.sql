-- 0단계 — 개발용 비밀번호 심기
--
-- 메일 링크로 만들어진 계정에는 비밀번호가 없다.
-- 무료 요금제 기본 메일은 시간당 2통이라 개발 내내 막히므로,
-- 비밀번호를 넣어 메일 없이 로그인한다 → docs/decisions.md
--
-- 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run
-- 계정을 지우지 않으므로 프로필·커플 연결이 그대로 남는다.
--
-- ⚠ 개발 편의용이다. 실사용자 비밀번호를 이렇게 다루지 않는다.
--   7단계에서 카카오 로그인이 붙으면 이 경로는 실사용자에게 노출하지 않는다.
--
-- 계정을 이메일로 지목하지 않는다. 레포에 개인 주소를 남기지 않으려는 것이고,
-- 어차피 이 프로젝트의 계정은 두 개뿐이다.

do $$
declare
  v_n int;
  -- 비밀번호를 바꾸려면 여기만 고친다.
  v_pw text := 'junbi-dev-1234';
begin
  select count(*) into v_n from auth.users;

  -- 실수로 실사용자가 있는 프로젝트에서 돌리는 걸 막는다.
  if v_n > 2 then
    raise exception '계정이 %개입니다. 개발용 프로젝트가 맞는지 확인하세요.', v_n;
  end if;

  update auth.users
  set
    -- Supabase는 bcrypt를 쓴다. pgcrypto의 crypt/gen_salt로 같은 형식을 만든다.
    encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')),
    -- 확인이 안 된 계정은 로그인이 막힌다. 함께 처리한다.
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at         = now();

  raise notice '계정 %개에 비밀번호를 심었습니다.', v_n;
end $$;

-- 결과 확인
select
  email                             as 계정,
  (encrypted_password is not null)  as 비밀번호있음,
  (email_confirmed_at is not null)  as 메일확인됨,
  to_char(created_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as 가입시각
from auth.users
order by created_at;
