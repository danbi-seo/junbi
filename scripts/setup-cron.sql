-- 알림 발송 예약 — docs/05-setup.md, docs/13-notifications.md
--
-- 실행: Supabase 대시보드 → SQL Editor → 아래 두 값을 채우고 Run
--
-- 큐에 쌓인 알림을 5분마다 꺼내 보낸다.
-- 1분마다는 과하다. 두 사람 쓰는 앱에서 알림 지연은 체감이 안 되고
-- 호출 횟수는 5분의 1이 된다 (월 43,200회 → 8,640회).

-- ── 여기 두 줄만 채우세요 ──────────────────────────────────────
--   CRON_SECRET은 .env.local에 있는 값과 같아야 합니다.
--   서비스 키를 SQL에 직접 쓰지 않고 DB 설정에 넣습니다.
alter database postgres set app.push_url    = 'https://junbi.vercel.app/api/push/send';
alter database postgres set app.cron_secret = '여기에_CRON_SECRET_붙여넣기';
-- ──────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 이미 있으면 지우고 다시 만든다 (여러 번 실행해도 안전)
select cron.unschedule('push-dispatch')
 where exists (select 1 from cron.job where jobname = 'push-dispatch');

select cron.schedule(
  'push-dispatch',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := current_setting('app.push_url'),
      headers := jsonb_build_object(
                   'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
                   'Content-Type',  'application/json'
                 ),
      body    := '{}'::jsonb
    );
  $$
);

-- 확인
select jobid, jobname, schedule, active from cron.job order by jobid;
