-- 0030 컨디션은 한 곳에서만
--
-- 컨디션이 두 군데 있었다.
--   statuses(kind='condition')  상태 칩. **공개 스위치가 없다**
--   conditions                  '내 몸'의 오늘 기록. share_condition으로 통제
--
-- 상대에게 나가는 경로가 둘인데 한쪽에만 스위치가 있으면,
-- 스위치를 꺼도 칩으로는 그대로 나간다. 끄는 행위에 대가가 없어야 한다는
-- 원칙이 무너진다 → docs/19-health.md F
--
-- 화면에서 프리셋을 뺐지만 그것만으로는 '막은 게 아니다'.
-- set_status가 직접 거부한다.
--
-- status_kind enum의 'condition'은 지우지 않는다.
-- enum 값 제거는 되돌리기 어렵고, 남은 행은 전부 만료된 것뿐이라 해가 없다.
-- 새로 만들 길만 없앤다.
--
-- ── 같이 고치는 것: 30분이 1시간으로 저장되던 문제 ─────────────
--
-- p_hours가 int라 화면의 '30분'(0.5)이 반올림돼 1이 되고,
-- greatest(p_hours, 1)이 한 번 더 1로 밀어 올렸다.
-- numeric으로 바꾼다. 인자 타입이 바뀌므로 옛 함수를 명시적으로 지운다 —
-- 안 지우면 오버로드가 둘 남아 PostgREST가 어느 쪽인지 못 고른다.

drop function if exists public.set_status(status_kind, text, text, int);

create or replace function public.set_status(
  p_kind  status_kind,
  p_emoji text,
  p_text  text default null,
  p_hours numeric default 4
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- 컨디션은 '내 몸'에서만 기록한다. save_condition()을 쓴다.
  if p_kind = 'condition' then raise exception 'CONDITION_MOVED'; end if;

  insert into statuses (user_id, kind, emoji, text, until, updated_at)
  values (auth.uid(), p_kind, p_emoji, nullif(btrim(coalesce(p_text,'')), ''),
          now() + (greatest(p_hours, 0.5) || ' hours')::interval, now())
  on conflict (user_id, kind) do update set
    emoji = excluded.emoji,
    text  = excluded.text,
    until = excluded.until,
    updated_at = now();

  -- 알림은 enqueue_partner_notification이 판정한다.
  -- dedupe_key에 시각을 넣어 한 시간에 한 번만 알린다.
  -- 상태를 다섯 번 바꿔도 알림은 하나다.
  perform enqueue_partner_notification(
    'status_changed',
    partner_label(my_partner_id(), auth.uid()) || '님의 상태가 바뀌었어요',
    p_emoji || coalesce(' ' || nullif(btrim(coalesce(p_text,'')), ''), ''),
    '/',
    'status',
    'status_changed:' || auth.uid() || ':' || date_trunc('hour', now())
  );
end $$;

-- 남아 있던 컨디션 상태를 지운다. 전부 만료된 것들이고,
-- 상태 이력은 애초에 쌓지 않으므로 지워도 잃는 것이 없다.
delete from statuses where kind = 'condition';
