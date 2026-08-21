-- 0010 행 단위 접근 권한 (RLS)
-- 근거: docs/06-data-model.md, docs/04-checklist.md B
--
-- 이 파일이 이 앱의 방어선이다. 화면에서 감춘 것은 막은 게 아니다.
-- RLS를 켜고 정책을 안 만드는 것 = 접근 0
-- RLS를 안 켜는 것                = 전면 공개
-- 정반대 결과다. 새 테이블을 만들면 반드시 이 파일에 추가할 것.

alter table couples             enable row level security;
alter table profiles            enable row level security;
alter table invites             enable row level security;
alter table events              enable row level security;
alter table checklists          enable row level security;
alter table checklist_items     enable row level security;
alter table places              enable row level security;
alter table expenses            enable row level security;
alter table settlements         enable row level security;
alter table anniversaries       enable row level security;
alter table statuses            enable row level security;
alter table routines            enable row level security;
alter table routine_overrides   enable row level security;
alter table conditions          enable row level security;
alter table cycles              enable row level security;
alter table health_sharing      enable row level security;
alter table availability_prefs  enable row level security;
alter table notification_prefs  enable row level security;
alter table onboarding_progress enable row level security;

-- 아래 넷은 RLS만 켜고 정책을 만들지 않는다. 정책 0개 = 클라이언트 접근 0.
-- service_role(서버 라우트 · Edge Function)만 읽는다.
alter table calendar_accounts   enable row level security;  -- 외부 캘린더 토큰
alter table ics_tokens          enable row level security;  -- .ics 비밀 URL
alter table notification_queue  enable row level security;

-- push_subscriptions는 다르다. 브라우저가 직접 구독 정보를 저장해야 하므로
-- 본인 정책이 필요하다. 04-checklist의 '정책 0개' 목록에도 들어 있지 않다.
alter table push_subscriptions  enable row level security;

-- ── profiles · couples ──────────────────────────────────────────
create policy "내 프로필" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "짝 프로필 조회" on profiles
  for select using (couple_id is not null and couple_id = my_couple_id());

-- 확정 대기 중에도 상대의 이름·생일이 보여야 "이 사람이 맞나"를 판단한다.
-- my_couple_id()는 active만 반환하므로 별도 정책이 필요하다.
-- 일정·지출·건강은 여전히 0건이다. 확인 화면에 필요한 것만 새어 나간다.
create policy "확정 대기 중 상대 프로필 조회" on profiles
  for select using (
    couple_id in (
      select c.id from couples c
      join profiles p on p.couple_id = c.id
      where p.id = auth.uid() and c.status = 'pending'
    )
  );

-- pending(확정 대기)과 dissolved(해제됨) 커플도 보여야
-- 각각 확인 화면과 복구 안내를 띄울 수 있다. my_couple_id()를 쓰지 않는 이유.
create policy "내 커플 조회" on couples
  for select using (
    id in (select couple_id from profiles where id = auth.uid())
  );

create policy "커플 생성" on couples for insert with check (true);

create policy "내 커플 수정" on couples for update
  using (id in (select couple_id from profiles where id = auth.uid()));

create policy "내 초대" on invites
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- ── 커플 공용 테이블 ─────────────────────────────────────────────
-- checklists, places, expenses, settlements, anniversaries는 패턴이 같다.
create policy "커플 공용" on checklists
  for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy "커플 공용" on places
  for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy "커플 공용" on expenses
  for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy "커플 공용" on settlements
  for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());
create policy "커플 공용" on anniversaries
  for all using (couple_id = my_couple_id()) with check (couple_id = my_couple_id());

-- checklist_items는 couple_id가 없으므로 부모를 타고 간다.
create policy "체크 항목" on checklist_items
  for all using (
    checklist_id in (select id from checklists where couple_id = my_couple_id())
  ) with check (
    checklist_id in (select id from checklists where couple_id = my_couple_id())
  );

-- ── events — 핵심 ───────────────────────────────────────────────
-- private는 행 자체가 안 나간다. busy는 행은 나가고 제목만 가린다(0011 뷰).
create policy "일정 조회" on events for select using (
  couple_id = my_couple_id() and deleted_at is null
  and (scope = 'shared' or owner_id = auth.uid() or visibility <> 'private')
);
create policy "일정 생성" on events for insert with check (
  couple_id = my_couple_id() and owner_id = auth.uid()
);
create policy "일정 수정" on events for update using (
  couple_id = my_couple_id()
  and (scope = 'shared' or owner_id = auth.uid())
  and read_only = false
);
create policy "일정 삭제" on events for delete using (
  couple_id = my_couple_id() and (scope = 'shared' or owner_id = auth.uid())
);

-- ── 개인 소유 테이블 ─────────────────────────────────────────────
-- 상태는 짝이면 무조건 읽는다 (스위치 없음)
create policy "내 상태" on statuses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "짝 상태 조회" on statuses for select
  using (user_id = my_partner_id());

-- 루틴 원본은 본인만. 상대는 계산된 '지금 상태'만 본다.
-- 주 단위 스케줄 전체가 보이면 "화요일 8시에 왜 집에 없어?"가 가능해진다.
create policy "내 루틴" on routines for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "내 루틴 예외" on routine_overrides for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 컨디션은 공개 스위치를 본다. 끄면 즉시 0건이 된다.
create policy "내 컨디션" on conditions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "짝 컨디션 조회" on conditions for select using (
  user_id = my_partner_id()
  and exists (select 1 from health_sharing h
              where h.user_id = conditions.user_id and h.share_condition)
);

-- cycles에 짝 조회 정책이 '없는 것'이 핵심이다.
-- 원본 기록(증상·통증·메모·정확한 날짜)은 어떤 경우에도 상대에게 넘어가지 않는다.
-- 상대가 보는 건 partner_health() RPC가 계산해 내보내는 파생값뿐이다.
create policy "내 주기" on cycles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "내 공개설정" on health_sharing for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "짝 공개설정 조회" on health_sharing for select
  using (user_id = my_partner_id());

create policy "내 가용시간" on availability_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notification_prefs에 짝 조회 정책을 만들지 않는다.
-- 상대가 내 발신 설정을 볼 수 있으면 끄는 행위가 추궁 대상이 된다.
create policy "내 알림설정" on notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "내 온보딩" on onboarding_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "내 푸시구독" on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
