-- 0008 설정 · 외부 연동 · 알림
-- 근거: docs/06-data-model.md, docs/13-notifications.md, docs/21-onboarding.md

create table availability_prefs (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  weekday_from time not null default '19:00',
  weekday_to   time not null default '23:00',
  weekend_from time not null default '10:00',
  weekend_to   time not null default '22:00',
  buffer_min   int  not null default 30,   -- 일정 앞뒤 이동 여유
  min_slot_min int  not null default 120
);

-- 외부 캘린더 계정. 클라이언트는 절대 읽을 수 없다.
-- RLS를 켜고 정책을 0개 둔다 → 0010
create table calendar_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null,             -- 'google' | 'ics'
  account_email text,
  refresh_token text,                      -- 암호화 저장
  sync_token    text,
  ics_url       text,
  last_synced   timestamptz,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);

-- 표준 웹 푸시 구독 (VAPID). FCM 토큰이 아니다.
create table push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  failed_at  timestamptz,
  created_at timestamptz not null default now()
);

-- .ics 발행용 비밀 토큰.
-- 캘린더 앱은 로그인을 못 하므로 인증이 불가능한 공개 URL이다.
-- 재발급이 유일한 대응이고, 연결 해제·탈퇴 시 즉시 무효화한다.
create table ics_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_read  timestamptz,
  revoked_at timestamptz
);

create index ics_tokens_user on ics_tokens (user_id) where revoked_at is null;

-- 온보딩 진행 상태. 설치 · 알림 · 캘린더 구독 세 단계 → docs/21-onboarding.md
-- snoozed_until이 필요하다. '나중에'를 눌렀는데 다음 날 또 뜨면 짜증난다.
create table onboarding_progress (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  installed_at          timestamptz,
  push_at               timestamptz,
  ics_at                timestamptz,
  install_snoozed_until timestamptz,
  push_snoozed_until    timestamptz,
  ics_snoozed_until     timestamptz
);

-- 예약 알림 큐
create table notification_queue (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  url        text,
  tag        text,
  pinned     boolean not null default false,
  send_at    timestamptz not null,
  sent_at    timestamptz,
  dedupe_key text
);

-- 일정을 세 번 수정하면 알림이 세 번 예약된다. dedupe_key로 막는다.
create unique index notif_dedupe on notification_queue (dedupe_key)
  where sent_at is null and dedupe_key is not null;

-- 알림 설정은 두 축이다.
--   recv_*  내가 어떤 알림을 받을지
--   send_*  내 행동이 상대에게 알림으로 갈지
-- 둘 다 켜져야 발송된다. 한쪽만 꺼도 안 간다.
--
-- 접미사가 곧 notification_queue.kind 값이다.
--   event_created · event_updated · expense_added · settlement
--   · status_changed · checklist_done · condition
-- enqueue_partner_notification()이 'send_'/'recv_' + kind로 컬럼을 찾으므로
-- 새 종류를 추가할 때 이 규칙을 깨지 말 것 → docs/13-notifications.md
create table notification_prefs (
  user_id             uuid primary key references auth.users(id) on delete cascade,

  -- 받을 알림
  recv_event_created  boolean not null default true,
  recv_event_updated  boolean not null default true,
  recv_expense_added  boolean not null default true,
  recv_settlement     boolean not null default true,
  recv_status_changed boolean not null default false,  -- 켜면 하루 열 번
  recv_checklist_done boolean not null default false,
  recv_condition      boolean not null default false,
  recv_anniversary    boolean not null default true,   -- .ics가 주로 처리
  recv_event_upcoming boolean not null default true,   -- .ics가 주로 처리
  upcoming_min        int     not null default 60,

  -- 보낼 알림
  send_event_created  boolean not null default true,
  send_event_updated  boolean not null default true,
  send_expense_added  boolean not null default true,
  send_settlement     boolean not null default true,
  send_status_changed boolean not null default true,
  send_checklist_done boolean not null default true,
  send_condition      boolean not null default false,  -- 건강 정보. 기본 꺼짐

  quiet_from          time    not null default '23:00',
  quiet_to            time    not null default '08:00'
);
