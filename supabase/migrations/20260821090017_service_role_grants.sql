-- 0017 service_role 권한
--
-- 증상: .ics 라우트가 ics_tokens를 못 읽어 항상 404
--       permission denied for table ics_tokens
--
-- 원인: service_role은 RLS를 건너뛰지만 테이블 권한(GRANT)은 건너뛰지 못한다.
--       0014에서 anon·authenticated만 정리하고 service_role을 빠뜨렸다.
--       (Supabase 자동 부여가 CLI 마이그레이션에 적용되지 않는 그 문제의 연장선)
--
-- service_role은 서버 전용이다. 이 키가 브라우저에 나가면 이미 끝난 상황이라,
-- 권한을 좁혀도 방어 효과가 없다. 전부 준다.

grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- 앞으로 만들 테이블에도 자동으로 적용되게 한다.
-- 이게 없으면 새 테이블을 추가할 때마다 같은 증상이 반복된다.
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant all privileges on functions to service_role;

-- authenticated에는 일괄 부여하지 않는다.
-- events의 select는 계속 회수돼 있어야 마스킹이 유지된다 → 0014
