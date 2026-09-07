-- 0038 일정 수정·삭제가 처음부터 안 되던 문제
--
-- 증상: 일정을 만들 수는 있는데 고치거나 지우면 "저장하지 못했어요"만 뜬다.
--
-- 원인은 RLS가 아니라 **컬럼 권한**이다.
--   0011/0014에서 `revoke select on events from authenticated`를 했다.
--   마스킹을 뷰로만 통과시키려는 절대 규칙이고, 그 자체는 옳다.
--
--   그런데 Postgres는 `update ... where id = $1`처럼 **where 절이 컬럼을 읽으면
--   그 컬럼에 select 권한을 요구한다.** update 권한만으로는 부족하다.
--   그래서 모든 수정·삭제가 42501(permission denied for table events)로 죽었다.
--   PostgREST가 그 오류를 그대로 돌려줬고, 앱은 원문을 감추므로 원인이 안 보였다.
--
-- 고르지 않은 길: `grant select (id) on events`.
--   한 컬럼만 열면 되지만, "events에 select 권한이 없다"는 규칙이 조용히 깨진다.
--   검증 스크립트는 `select=id,title`을 보므로 여전히 통과해서, 규칙이 무너진
--   것을 아무도 모르게 된다. 권한을 다시 열지 않고 함수로 우회한다.
--
-- 제안 수락(answer_proposal)이 이미 같은 이유로 RPC였다. 같은 방식으로 맞춘다.

-- ── 수정 ────────────────────────────────────────────────────────
-- where 조건은 "일정 수정" 정책과 한 글자도 다르지 않게 맞춘다.
-- security definer라 RLS가 안 걸린다. 정책이 하던 일을 여기서 그대로 한다.
create or replace function public.update_event(
  p_id         uuid,
  p_scope      event_scope,
  p_visibility event_visibility,
  p_title      text,
  p_emoji      text,
  p_memo       text,
  p_all_day    boolean,
  p_silent     boolean,
  p_starts_at  timestamptz,
  p_ends_at    timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  update events
     set scope      = p_scope,
         visibility = p_visibility,
         title      = p_title,
         emoji      = p_emoji,
         memo       = p_memo,
         all_day    = p_all_day,
         silent     = p_silent,
         starts_at  = p_starts_at,
         ends_at    = p_ends_at
   where id        = p_id
     and couple_id = my_couple_id()
     and (scope = 'shared' or owner_id = auth.uid())
     and read_only = false
     and deleted_at is null;

  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;

-- ── 삭제 ────────────────────────────────────────────────────────
-- 하드 삭제하지 않는다. 행이 사라지면 max(updated_at)이 과거로 돌아가
-- 캘린더 앱이 갱신을 건너뛴다 → docs/12-ics-feed.md
create or replace function public.delete_event(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  update events
     set deleted_at = now()
   where id        = p_id
     and couple_id = my_couple_id()
     and (scope = 'shared' or owner_id = auth.uid())
     and deleted_at is null;

  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;

-- ── ETag 밀기 ───────────────────────────────────────────────────
-- 임박 알림 시각(VALARM)을 바꾸면 .ics 본문이 달라진다. ETag가 그대로면
-- 캘린더 앱이 304를 받고 새 알림을 영영 못 받는다.
-- 이 경로도 같은 42501로 조용히 실패하고 있었다 — 오류를 확인하지 않는 코드라
-- 화면에는 '저장됨'이 떴다.
create or replace function public.touch_my_events()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  update events set updated_at = now()
   where owner_id = auth.uid() and deleted_at is null;
end $$;

revoke execute on function public.update_event(
  uuid, event_scope, event_visibility, text, text, text,
  boolean, boolean, timestamptz, timestamptz) from anon;
revoke execute on function public.delete_event(uuid)  from anon;
revoke execute on function public.touch_my_events()   from anon;
