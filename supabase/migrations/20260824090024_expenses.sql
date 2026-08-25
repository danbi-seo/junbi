-- 0024 지출 · 정산
--
-- 근거: docs/20-expenses.md
--
-- 범위를 좁게 잡는다. 계산기 + 기록장이다. 돈은 앱 밖에서 움직인다.
--   안 하는 것: 계좌·카드 연동, 실제 송금, 영수증 OCR, 월별 예산 대시보드
--   하는 것:   일정에 붙는 지출 기록, 분담 계산, 누적 잔액, 정산 완료 표시
--
-- 금액은 bigint 원 단위 정수다. numeric이나 float을 쓰면 반올림에서
-- 1원씩 어긋나고, 커플 정산에서 1원 차이는 실제로 화제가 된다.

/**
 * 정산 잔액.
 *
 * 두 사람 모두에 대해 행을 만든다. per_expense를 group by 하면
 * 한쪽만 결제한 초기 상태에서 행이 하나뿐이라 desc와 asc가 같은 행을 집고
 * 잔액이 0으로 나온다 → docs/20-expenses.md
 */
create or replace function public.settlement_balance()
returns table (owed_to uuid, amount bigint)
language sql stable security definer set search_path = public as $$
  with per_expense as (
    select
      e.payer_id,
      case e.split
        when 'half'      then e.amount / 2
        when 'payer_all' then 0
        -- 홀수 반반은 결제자가 더 내는 쪽으로 버린다.
        -- 반대로 하면 "네가 1원 더 냈네"가 된다.
        when 'custom'    then e.amount * (100 - e.payer_ratio) / 100
      end as other_owes
    from expenses e
    where e.couple_id = my_couple_id() and e.settlement_id is null
  ),
  net as (
    select
      p.id as user_id,
      coalesce((select sum(pe.other_owes) from per_expense pe
                 where pe.payer_id = p.id), 0) as claim
    from profiles p
    where p.couple_id = my_couple_id()
  )
  select
    (select user_id from net order by claim desc, user_id limit 1),
    abs((select claim from net order by claim desc, user_id limit 1)
      - (select claim from net order by claim asc,  user_id limit 1))::bigint;
$$;

/**
 * 정산 완료로 표시.
 *
 * 한쪽이 누르면 즉시 반영된다. 상대 승인을 요구하지 않는다.
 * 승인 대기 상태를 만들면 "왜 승인 안 해?"라는 새로운 마찰이 생긴다.
 * 잘못 눌렀으면 이력에서 되돌린다.
 */
create or replace function public.settle_up(p_memo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := my_couple_id();
  v_to     uuid;
  v_amount bigint;
  v_id     uuid;
  v_label  text;
begin
  if v_couple is null then raise exception 'NOT_PAIRED'; end if;

  select owed_to, amount into v_to, v_amount from settlement_balance();
  if v_amount is null or v_amount = 0 then raise exception 'NOTHING_TO_SETTLE'; end if;

  insert into settlements (couple_id, from_id, to_id, amount, memo)
  values (
    v_couple,
    -- 받을 사람이 아닌 쪽이 보내는 사람이다
    (select id from profiles where couple_id = v_couple and id <> v_to),
    v_to, v_amount, nullif(btrim(coalesce(p_memo, '')), '')
  )
  returning id into v_id;

  update expenses set settlement_id = v_id
   where couple_id = v_couple and settlement_id is null;

  v_label := partner_label(my_partner_id(), auth.uid());
  perform enqueue_partner_notification(
    'settlement',
    v_label || '님이 정산을 완료했어요',
    to_char(v_amount, 'FM999,999,999') || '원',
    '/expenses',
    'settlement',
    'settlement:' || v_id
  );

  return v_id;
end $$;

/** 정산 되돌리기. 잘못 눌렀을 때. */
create or replace function public.undo_settlement(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from settlements
                 where id = p_id and couple_id = my_couple_id()) then
    raise exception 'NOT_FOUND';
  end if;

  update expenses set settlement_id = null where settlement_id = p_id;
  delete from settlements where id = p_id;
end $$;

-- ── 지출 알림 ───────────────────────────────────────────────────
--
-- 데이트 하루에 지출이 다섯 번 생기는데 그때마다 울리면 안 된다.
-- 15분 창으로 묶는다. 같은 창에 또 들어오면 이전 예약을 지우고
-- 합계를 다시 계산해 넣는다.
create or replace function public.notify_expense_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_to      uuid := my_partner_id();
  v_label   text;
  v_bucket  text;
  v_dedupe  text;
  v_count   int;
  v_sum     bigint;
begin
  if v_to is null then return null; end if;
  if new.silent then return null; end if;

  -- 15분 버킷
  v_bucket := to_char(date_trunc('hour', now())
              + (floor(extract(minute from now()) / 15) * interval '15 minutes'),
              'YYYYMMDDHH24MI');
  v_dedupe := 'expense_added:' || auth.uid() || ':' || v_bucket;

  select count(*), coalesce(sum(amount), 0) into v_count, v_sum
    from expenses
   where couple_id = new.couple_id
     and payer_id = new.payer_id
     and created_at >= now() - interval '15 minutes';

  -- 이전 예약을 지우고 합계를 다시 넣는다.
  -- enqueue는 on conflict do nothing이라 그냥 부르면 갱신이 안 된다.
  delete from notification_queue
   where dedupe_key = v_dedupe and sent_at is null;

  v_label := partner_label(v_to, auth.uid());
  perform enqueue_partner_notification(
    'expense_added',
    v_label || '님이 지출을 등록했어요',
    case when v_count > 1
         then v_count || '건 · 총 ' || to_char(v_sum, 'FM999,999,999') || '원'
         else to_char(new.amount, 'FM999,999,999') || '원'
              || coalesce(' · ' || new.memo, '') end,
    '/expenses',
    'expense',
    v_dedupe
  );

  -- 15분 뒤에 보낸다. 그 사이에 더 들어오면 위에서 다시 계산된다.
  update notification_queue
     set send_at = greatest(send_at, now() + interval '15 minutes')
   where dedupe_key = v_dedupe and sent_at is null;

  return null;
end $$;

create trigger expenses_notify
  after insert on expenses
  for each row execute function notify_expense_added();

-- 실시간 신호에 지출을 추가한다
create or replace function public.bump_signal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid;
  v_user   uuid;
begin
  if tg_table_name in ('checklists', 'anniversaries', 'places', 'expenses', 'settlements') then
    v_couple := coalesce(new.couple_id, old.couple_id);
  elsif tg_table_name = 'checklist_items' then
    select c.couple_id into v_couple from checklists c
     where c.id = coalesce(new.checklist_id, old.checklist_id);
  elsif tg_table_name = 'statuses' then
    v_user := coalesce(new.user_id, old.user_id);
    select p.couple_id into v_couple from profiles p where p.id = v_user;
  end if;

  if v_couple is null then return null; end if;

  insert into couple_signals as s (couple_id, events_at, checklists_at, statuses_at, expenses_at)
  values (v_couple, now(), now(), now(), now())
  on conflict (couple_id) do update set
    checklists_at = case when tg_table_name in ('checklists','checklist_items','places')
                         then now() else s.checklists_at end,
    statuses_at   = case when tg_table_name = 'statuses'
                         then now() else s.statuses_at end,
    expenses_at   = case when tg_table_name in ('expenses','settlements')
                         then now() else s.expenses_at end,
    events_at     = case when tg_table_name = 'anniversaries'
                         then now() else s.events_at end;

  return null;
end $$;

drop trigger if exists expenses_signal on expenses;
create trigger expenses_signal
  after insert or update or delete on expenses
  for each row execute function bump_signal();

drop trigger if exists settlements_signal on settlements;
create trigger settlements_signal
  after insert or update or delete on settlements
  for each row execute function bump_signal();
