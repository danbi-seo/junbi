-- 알림 발송 예약 — docs/05-setup.md, docs/13-notifications.md
--
-- ┌─ 실행 방법 ────────────────────────────────────────────────┐
-- │ 1. Supabase 대시보드 → Database → Extensions에서            │
-- │    pg_cron, pg_net을 켠다                                   │
-- │ 2. SQL Editor → New query                                   │
-- │ 3. 이 파일 전체를 붙여넣는다                                │
-- │ 4. 아래 '여기 한 줄'의 CRON_SECRET을 .env.local 값으로 채운다│
-- │ 5. Run                                                      │
-- │ 6. 맨 아래 확인 쿼리에 job 4개가 보이면 끝                  │
-- └────────────────────────────────────────────────────────────┘
--
-- 여러 번 실행해도 안전하다. 기존 job과 비밀값을 덮어쓴다.
--
-- 비밀값은 Vault에 넣는다.
--   alter database postgres set ... 은 쓸 수 없다.
--   Supabase의 postgres 역할은 superuser가 아니라서 42501이 난다.
--   Vault는 Supabase가 이 용도로 주는 저장소다. 암호화돼서 들어가고,
--   cron job이 돌 때만 복호화해서 읽는다.
--
-- 큐에 쌓인 알림을 5분마다 꺼내 보낸다.
-- 1분마다는 과하다. 두 사람 쓰는 앱에서 알림 지연은 체감이 안 되고
-- 호출 횟수는 5분의 1이 된다 (월 43,200회 → 8,640회).
--
-- pg_cron의 시각은 UTC다. '0 19'는 한국 시간 새벽 4시다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 여기 한 줄만 채우세요 ──────────────────────────────────────
--   CRON_SECRET은 .env.local / Vercel 환경변수와 **같은 값**이어야 합니다.
--   따옴표를 빼면 소문자로 바뀌어 저장되니 반드시 작은따옴표로 감싸세요.
do $$
declare
  v_secret text := '여기에_CRON_SECRET_붙여넣기';
  v_id     uuid;
begin
  select id into v_id from vault.secrets where name = 'junbi_cron_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'junbi_cron_secret', 'JUNBI 알림 발송 라우트 인증');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
end $$;
-- ──────────────────────────────────────────────────────────────

-- ── 1. 알림 발송 (5분마다) ────────────────────────────────────
--
-- 발송 주소는 비밀이 아니라 그냥 적는다. 공개된 엔드포인트이고,
-- 자격 증명은 Authorization 헤더가 한다.
select cron.unschedule('push-dispatch')
 where exists (select 1 from cron.job where jobname = 'push-dispatch');

select cron.schedule(
  'push-dispatch',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url     := 'https://junbi.vercel.app/api/push/send',
      headers := jsonb_build_object(
                   'Authorization', 'Bearer ' || (
                     select decrypted_secret from vault.decrypted_secrets
                      where name = 'junbi_cron_secret'
                   ),
                   'Content-Type',  'application/json'
                 ),
      body    := '{}'::jsonb
    );
  $job$
);

-- ── 2. 지난 루틴 예외 정리 (한국 시간 새벽 4시) ───────────────
select cron.unschedule('purge-routine-overrides')
 where exists (select 1 from cron.job where jobname = 'purge-routine-overrides');

select cron.schedule('purge-routine-overrides', '0 19 * * *',
  $job$ select public.purge_routine_overrides(); $job$);

-- ── 3. 발송된 알림 정리 · 지난 준비물 보관 (새벽 4시 10분) ────
select cron.unschedule('daily-cleanup')
 where exists (select 1 from cron.job where jobname = 'daily-cleanup');

select cron.schedule('daily-cleanup', '10 19 * * *', $job$
  select public.purge_notification_queue();
  select public.archive_finished_checklists();
  select public.expire_proposals();
$job$);

-- ── 4. 해제된 커플 파기 (새벽 4시 20분) ───────────────────────
--
-- 30일 유예가 끝난 것만 지운다. couples를 지우면 FK cascade로
-- 일정·장소·지출·체크리스트가 따라간다.
-- 로그는 건수만 — "누가 언제 헤어졌다"를 들고 있을 이유가 없다.
select cron.unschedule('purge-dissolved')
 where exists (select 1 from cron.job where jobname = 'purge-dissolved');

select cron.schedule('purge-dissolved', '20 19 * * *',
  $job$ select public.purge_dissolved_couples(); $job$);

-- ── 확인 ──────────────────────────────────────────────────────
-- job 4개가 active = true 로 보이면 성공이다.
select jobid, jobname, schedule, active from cron.job order by jobid;

-- 비밀값이 제대로 들어갔는지 (값 자체는 찍지 않는다)
--   select name, length(decrypted_secret) as 길이
--     from vault.decrypted_secrets where name = 'junbi_cron_secret';

-- 5분 기다리기 싫으면 이 블록만 따로 선택해서 Run —
-- 지금 즉시 한 번 발송한다.
--   select net.http_post(
--     url     := 'https://junbi.vercel.app/api/push/send',
--     headers := jsonb_build_object(
--                  'Authorization', 'Bearer ' || (
--                    select decrypted_secret from vault.decrypted_secrets
--                     where name = 'junbi_cron_secret'),
--                  'Content-Type',  'application/json'),
--     body    := '{}'::jsonb);

-- 잘 갔는지 보기 (호출 직후엔 아직 비어 있을 수 있다. 몇 초 뒤 다시)
--   select status_code, content from net._http_response order by id desc limit 5;

-- cron이 돌았는지 · 실패했는지 보기
--   select jobid, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
