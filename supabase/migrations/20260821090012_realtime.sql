-- 0012 실시간 반영 대상
-- 근거: docs/06-data-model.md, docs/07-api.md
--
-- 주의: Realtime 페이로드에는 마스킹이 적용되지 않는다. 원본 테이블 기준으로
-- 나간다. events는 '변경됐다'는 신호로만 쓰고 데이터는 events_visible에서
-- 다시 읽어야 한다. payload.new.title을 쓰고 싶은 유혹이 있는데, 여기가
-- 이 앱에서 정보가 샐 수 있는 가장 현실적인 지점이다.

alter publication supabase_realtime add table events;
alter publication supabase_realtime add table checklist_items;
alter publication supabase_realtime add table statuses;
alter publication supabase_realtime add table expenses;

-- cycles와 conditions는 넣지 않는다. 건강 정보는 실시간일 필요가 전혀 없고,
-- 앱 진입 시 갱신으로 충분하다.
