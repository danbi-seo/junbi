-- 0011 열 단위 마스킹 (뷰)
-- 근거: docs/06-data-model.md, docs/07-api.md
--
-- RLS는 행 단위라 "시간만 공개"를 표현할 수 없다. 뷰로 열을 가린다.
-- 클라이언트는 events가 아니라 events_visible만 읽는다.

create view events_visible with (security_invoker = true) as
select
  e.id, e.couple_id, e.owner_id, e.scope, e.visibility, e.status,
  e.starts_at, e.ends_at, e.all_day, e.blocks_time, e.source,
  e.read_only, e.created_at, e.updated_at,
  -- silent(이 건만 알리지 않기)은 소유자에게만 보인다.
  -- 상대가 이걸 보면 '나한테 안 알리기로 했네'가 드러나 발신 설정을
  -- 비공개로 둔 이유가 무너진다 → docs/13-notifications.md
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
where e.deleted_at is null;

-- security_invoker = true가 빠지면 뷰가 소유자 권한으로 돌아 RLS를 통째로
-- 우회한다. 반드시 있어야 한다.

-- 원본 테이블의 select 권한을 회수한다. 이게 없으면 클라이언트가 뷰를 건너뛰고
-- events를 직접 읽어 마스킹이 무의미해진다.
revoke select on events from anon, authenticated;
grant insert, update, delete on events to authenticated;
grant select on events_visible to authenticated;
