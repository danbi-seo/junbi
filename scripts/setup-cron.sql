-- 알림 발송 예약 — docs/05-setup.md, docs/13-notifications.md
--
-- ┌─ 실행 방법 ────────────────────────────────────────────────┐
-- │ 1. Supabase 대시보드 → Database → Extensions에서            │
-- │    pg_cron, pg_net을 켠다 (아래 create extension이 대신     │
-- │    해 주지만, 대시보드에서 켜는 쪽이 확실하다)              │
-- │ 2. SQL Editor → New query                                   │
-- │ 3. 이 파일 전체를 붙여넣는다                                │
-- │ 4. 아래 '여기 두 줄'의 CRON_SECRET을 .env.local 값으로 채운다│
-- │ 5. Run                                                      │
-- │ 6. 맨 아래 확인 쿼리에 job 3개가 보이면 끝                  │
-- └────────────────────────────────────────────────────────────┘
--
-- 여러 번 실행해도 안전하다. 기존 job을 지우고 다시 만든다.
--
-- 큐에 쌓인 알림을 5분마다 꺼내 보낸다.
-- 1분마다는 과하다. 두 사람 쓰는 앱에서 알림 지연은 체감이 안 되고
-- 호출 횟수는 5분의 1이 된다 (월 43,200회 → 8,640회).
--
-- pg_cron의 시각은 UTC다. '0 19'는 한국 시간 새벽 4시다.

-- ── 여기 두 줄만 채우세요 ──────────────────────────────────────
--   CRON_SECRET은 .env.local / Vercel 환경변수와 **같은 값**이어야 합니다.
--   서비스 키를 SQL에 직접 쓰지 않고 DB 설정에 넣습니다.
alter database postgres set app.push_url    = 'https://junbi.vercel.app/api/push/send';
alter database postgres set app.cron_secret = '여기에_CRON_SECRET_붙여넣기';
-- ──────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 1. 알림 발송 (5분마다) ────────────────────────────────────
select cron.unschedule('push-dispatch')
 where exists (select 1 from cron.job where jobname = 'push-dispatch');

select cron.schedule(
  'push-dispatch',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url     := current_setting('app.push_url'),
      headers := jsonb_build_object(
                   'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
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

-- ── 확인 ──────────────────────────────────────────────────────
-- job 3개가 active = true 로 보이면 성공이다.
select jobid, jobname, schedule, active from cron.job order by jobid;

-- 5분 기다리기 싫으면 이 줄만 따로 선택해서 Run —
-- 지금 즉시 한 번 발송한다.
--   select net.http_post(
--     url     := current_setting('app.push_url'),
--     headers := jsonb_build_object(
--                  'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
--                  'Content-Type',  'application/json'),
--     body    := '{}'::jsonb);

-- 잘 갔는지 보기 (호출 직후엔 아직 비어 있을 수 있다. 몇 초 뒤 다시)
--   select status_code, content from net._http_response order by id desc limit 5;

-- cron이 돌았는지 · 실패했는지 보기
--   select jobid, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
