-- 0014 테이블 권한(GRANT)과 마스킹 뷰 재작성
--
-- 증상: 로그인한 사용자가 모든 테이블에서 42501 permission denied
-- 원인 1: Postgres는 두 겹으로 막는다.
--           GRANT  이 테이블을 건드릴 자격이 있는가
--           RLS    그중 어떤 행을 볼 수 있는가
--         우리는 RLS만 만들고 GRANT를 만들지 않았다.
--         Supabase가 자동으로 주는 기본 권한은 특정 역할이 만든 테이블에만
--         적용되는데, CLI 마이그레이션은 그 역할로 돌지 않는다.
--
-- 원인 2: 설계서(docs/06-data-model.md)의 조합이 성립하지 않는다.
--
--           create view events_visible with (security_invoker = true) ...
--           revoke select on events from authenticated;
--
--         security_invoker = true인 뷰는 원본 테이블 권한을 '호출자' 기준으로
--         검사한다. 그래서 events의 select를 회수하면 뷰까지 같이 막힌다.
--         둘을 동시에 만족시킬 수 없다.
--
-- 해결: 뷰를 소유자 권한(security_invoker 없음)으로 돌리고, RLS가 하던
--       행 필터를 뷰 안에 직접 넣는다. 그러면
--         - 원본 events는 계속 select 0 (뷰를 건너뛸 수 없다)
--         - 행 필터와 열 마스킹이 뷰 한 곳에 모인다
--       마스킹 규칙이 한 파일에 모이는 건 오히려 낫다.
--
-- 검출: 로그인한 계정으로 조회했을 때 42501

-- ── 1. 뷰 재작성 ────────────────────────────────────────────────
drop view if exists events_visible;

create view events_visible as
select
  e.id, e.couple_id, e.owner_id, e.scope, e.visibility, e.status,
  e.starts_at, e.ends_at, e.all_day, e.blocks_time, e.source,
  e.read_only, e.created_at, e.updated_at,

  -- silent(이 건만 알리지 않기)은 소유자에게만.
  -- 상대가 보면 '나한테 안 알리기로 했네'가 드러난다 → docs/13-notifications.md
  case when e.owner_id = auth.uid() then e.silent else null end as silent,

  case when e.owner_id = auth.uid() or e.visibility = 'full'
       then e.title else null end as title,
  case when e.owner_id = auth.uid() or e.visibility = 'full'
       then e.memo else null end as memo,
  case when e.owner_id = auth.uid() or e.visibility = 'full'
       then e.emoji else null end as emoji,
  case when e.owner_id = auth.uid() or e.visibility = 'full'
       then e.place_id else null end as place_id,

  (e.owner_id <> auth.uid() and e.visibility = 'busy') as is_masked
from events e
where e.deleted_at is null
  -- 여기 세 줄이 원래 RLS 정책이 하던 일이다. 뷰가 소유자 권한으로 돌므로
  -- 정책이 걸리지 않는다. 빠뜨리면 그대로 유출이다.
  and e.couple_id = my_couple_id()
  and (
    e.scope = 'shared'
    or e.owner_id = auth.uid()
    or e.visibility <> 'private'
  );

-- ── 2. 테이블 권한 ──────────────────────────────────────────────
-- authenticated에게만 준다. anon은 아무것도 못 한다.
-- 여기 있는 테이블은 전부 RLS가 켜져 있고 정책이 있다.
grant select, insert, update, delete on
  profiles, couples, invites,
  checklists, checklist_items, places, expenses, settlements, anniversaries,
  statuses, routines, routine_overrides,
  conditions, cycles, health_sharing,
  availability_prefs, notification_prefs, onboarding_progress,
  push_subscriptions
to authenticated;

-- events는 읽기만 회수한다. 쓰기는 필요하다.
-- 읽기는 반드시 events_visible을 거쳐야 마스킹이 적용된다.
grant insert, update, delete on events to authenticated;
revoke select on events from anon, authenticated;

grant select on events_visible to authenticated;

-- 아래 셋은 일부러 아무 권한도 주지 않는다. service_role만 읽는다.
--   calendar_accounts   외부 캘린더 토큰
--   ics_tokens          .ics 비밀 URL
--   notification_queue  알림 본문
revoke all on calendar_accounts, ics_tokens, notification_queue
  from anon, authenticated;
