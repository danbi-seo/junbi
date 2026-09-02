-- 0037 cron 상태를 확인할 수 있게
--
-- setup-cron.sql을 돌렸는지 확인할 방법이 없었다. cron 스키마는 PostgREST에
-- 노출되지 않아서, "5개 나왔나요?"를 사람에게 물어보는 수밖에 없었다.
-- 실제로 그게 몇 번 오갔다.
--
-- 이름과 일정만 돌려준다. 명령문(command)에는 Vault 조회가 들어 있어
-- 내보내지 않는다.
--
-- service_role만 부를 수 있다. 사용자에게는 아무 쓸모도 없는 정보다.
create or replace function public.cron_status()
returns table (jobname text, schedule text, active boolean)
language sql stable security definer set search_path = public, cron as $$
  select j.jobname::text, j.schedule::text, j.active
  from cron.job j
  order by j.jobid;
$$;

revoke execute on function public.cron_status() from public, anon, authenticated;
