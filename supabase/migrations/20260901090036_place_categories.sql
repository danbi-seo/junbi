-- 0036 장소 갈래 추가
--
-- 처음 일곱 갈래로 시작했는데 '액티비티'가 너무 많은 걸 떠안고 있었다.
-- 클라이밍장도, 전시회도, 한강 산책도 전부 거기로 갔다.
-- 갈래가 뭉뜽그려지면 필터가 쓸모없어진다 — 걸러도 절반이 남는다.
--
-- 카카오 로컬 검색이 돌아가는 갈래(음식점·카페·문화시설·관광명소·숙박)와
-- 맞물리게 골랐다. 검색 결과에서 갈래를 자동으로 집어줄 수 있다.
--
-- ⚠ alter type ... add value는 같은 트랜잭션 안에서 그 값을 쓸 수 없다.
--   여기서는 값만 추가하고 쓰지 않는다.
--
-- 기존 'activity'는 남긴다. 이미 저장된 장소가 그 값을 쓰고 있고,
-- enum 값은 지울 수 없다.

alter type place_category add value if not exists 'sports';      -- 운동
alter type place_category add value if not exists 'culture';     -- 전시·공연
alter type place_category add value if not exists 'nature';      -- 산책·자연
alter type place_category add value if not exists 'stay';        -- 숙소
alter type place_category add value if not exists 'date_course'; -- 데이트코스
