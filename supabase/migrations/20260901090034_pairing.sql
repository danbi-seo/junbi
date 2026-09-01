-- 0034 가입 · 페어링
--
-- 근거: docs/08-auth-pairing.md 1~4
--
-- 3단계 확인이 핵심이다.
--   1  A가 초대를 만든다        couples(pending) 생성, A는 슬롯 a
--   2  B가 링크를 열어 확인한다  A의 이름·생일을 보고 "이 사람이 맞나"
--   3  A가 확정한다             그때 비로소 status = 'active'
--
-- 2단계에서 B가 수락해도 status는 pending이다.
-- my_couple_id()에 이미 status = 'active' 조건이 있으므로
-- **확정 전까지 일정·지출·건강 등 모든 조회가 0건**이다.
-- 해제를 위해 만든 조건이 그대로 재사용된다. 새 정책이 필요 없다.
--
-- 전화번호로 찾지 않는다. 이름과 생일로 확인한다 —
-- 전화번호는 수집하지 않기로 한 항목이고, 잘못 입력하면 남에게 연결된다.

-- 정원은 화면이 아니라 DB에서 막는다. 화면에서만 막으면 API로 뚫린다.
create unique index if not exists profiles_couple_slot_uniq
  on profiles (couple_id, member_slot) where couple_id is not null;

/**
 * 내 프로필 만들기.
 *
 * 이름과 생일은 **페어링 확인 화면에서만** 쓴다. 그 외 어디에도 안 나온다.
 * 이름만으로는 동명이인이 헷갈리고, 생일이 붙으면 확실해진다.
 */
create or replace function public.create_my_profile(
  p_name       text,
  p_birth      date,
  p_lunar      boolean default false,
  p_emoji      text default '🐰',
  p_display    text default null,
  p_timezone   text default 'Asia/Seoul'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'NAME_REQUIRED'; end if;
  if p_birth is null or p_birth > current_date then raise exception 'BAD_BIRTH'; end if;

  insert into profiles (id, name, birth_date, birth_is_lunar, emoji_key,
                        display_name, timezone)
  values (v_me, btrim(p_name), p_birth, coalesce(p_lunar, false),
          coalesce(p_emoji, '🐰'),
          nullif(btrim(coalesce(p_display, '')), ''),
          coalesce(p_timezone, 'Asia/Seoul'))
  on conflict (id) do update set
    name           = excluded.name,
    birth_date     = excluded.birth_date,
    birth_is_lunar = excluded.birth_is_lunar,
    emoji_key      = excluded.emoji_key,
    display_name   = excluded.display_name,
    timezone       = excluded.timezone;

  -- 설정 행을 같이 만들어 둔다. 없으면 화면마다 없는 경우를 다뤄야 한다.
  insert into notification_prefs (user_id) values (v_me) on conflict do nothing;
  insert into health_sharing (user_id) values (v_me) on conflict do nothing;
  insert into availability_prefs (user_id) values (v_me) on conflict do nothing;

  return json_build_object('ok', true);
end $$;

/**
 * 초대 코드 만들기.
 *
 * 6자리. 0/O, 1/I를 뺀다 — 불러줄 상황이 생기고 그때 반드시 헷갈린다.
 * 유효 24시간, 1회용. 새로 만들면 이전 코드는 즉시 죽는다.
 * 항상 하나만 유효해야 "어느 코드였지"가 안 생긴다.
 */
create or replace function public.create_invite()
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_couple uuid;
  v_code   text;
  v_chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i        int;
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from profiles where id = v_me) then
    raise exception 'NO_PROFILE';
  end if;
  if my_couple_id() is not null then raise exception 'ALREADY_PAIRED'; end if;

  -- 이미 만들어 둔 pending 커플이 있으면 재사용한다.
  -- 매번 새로 만들면 빈 커플 행이 쌓인다.
  v_couple := my_pending_couple_id();
  if v_couple is null then
    insert into couples (status) values ('pending') returning id into v_couple;
    update profiles set couple_id = v_couple, member_slot = 'a' where id = v_me;
  end if;

  -- 이전 코드는 죽인다
  update invites set used_at = now()
   where created_by = v_me and used_at is null;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from invites where code = v_code);
  end loop;

  insert into invites (code, couple_id, created_by, expires_at)
  values (v_code, v_couple, v_me, now() + interval '24 hours');

  return json_build_object('code', v_code, 'expiresAt', now() + interval '24 hours');
end $$;

/**
 * 코드로 상대를 미리 본다. **아직 아무것도 연결되지 않는다.**
 *
 * 확인 전에 연결하면 잘못 전달된 코드로 남과 이어진다.
 * 여기서 나가는 건 이름·생일·이모지뿐이다. 일정도 지출도 안 나간다.
 */
create or replace function public.preview_invite(p_code text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_inv invites%rowtype;
  v_p   profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  select * into v_inv from invites where code = upper(btrim(p_code));
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_inv.used_at is not null then raise exception 'USED'; end if;
  if v_inv.expires_at < now() then raise exception 'EXPIRED'; end if;
  if v_inv.created_by = auth.uid() then raise exception 'OWN_CODE'; end if;

  select * into v_p from profiles where id = v_inv.created_by;

  return json_build_object(
    'name', v_p.name,
    'birthDate', v_p.birth_date,
    'birthIsLunar', v_p.birth_is_lunar,
    'emoji', v_p.emoji_key
  );
end $$;

/**
 * B가 수락한다. 슬롯 b를 차지하지만 **status는 아직 pending**이다.
 * A가 확정해야 데이터가 열린다.
 */
create or replace function public.accept_invite(p_code text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := auth.uid();
  v_inv invites%rowtype;
begin
  if v_me is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from profiles where id = v_me) then
    raise exception 'NO_PROFILE';
  end if;
  if my_couple_id() is not null then raise exception 'ALREADY_PAIRED'; end if;

  select * into v_inv from invites where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_inv.used_at is not null then raise exception 'USED'; end if;
  if v_inv.expires_at < now() then raise exception 'EXPIRED'; end if;
  if v_inv.created_by = v_me then raise exception 'OWN_CODE'; end if;

  -- 세 번째 사람은 unique index가 막는다. 여기서도 먼저 걸러 문구를 낸다.
  if (select count(*) from profiles where couple_id = v_inv.couple_id) >= 2 then
    raise exception 'COUPLE_FULL';
  end if;

  -- 내가 만들어 둔 빈 pending 커플이 있으면 버린다.
  -- 안 지우면 고아 커플이 남고 다음에 초대를 만들 때 그걸 재사용한다.
  delete from couples c
   where c.id = my_pending_couple_id()
     and (select count(*) from profiles p where p.couple_id = c.id) <= 1;

  update profiles set couple_id = v_inv.couple_id, member_slot = 'b'
   where id = v_me;

  update invites set used_at = now(), used_by = v_me where code = v_inv.code;
end $$;

/** 확정 대기 중인 상대. A의 확정 화면과 B의 대기 화면이 같이 쓴다. */
create or replace function public.pending_partner()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_couple uuid := my_pending_couple_id();
  v_p      profiles%rowtype;
  v_slot   member_slot;
begin
  if v_couple is null then return null; end if;

  select member_slot into v_slot from profiles where id = auth.uid();
  select * into v_p from profiles
   where couple_id = v_couple and id <> auth.uid();

  return json_build_object(
    'mySlot', v_slot,
    'waiting', v_p.id is null,
    'partner', case when v_p.id is not null then json_build_object(
      'name', v_p.name,
      'birthDate', v_p.birth_date,
      'birthIsLunar', v_p.birth_is_lunar,
      'emoji', v_p.emoji_key
    ) end
  );
end $$;

/**
 * A가 확정한다. 이 순간 두 사람의 데이터가 서로에게 열린다.
 * 슬롯 a만 부를 수 있다 — 수락한 사람이 스스로 확정하면 2단계가 무의미해진다.
 */
create or replace function public.confirm_pair(p_started_on date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_couple uuid := my_pending_couple_id();
  v_slot   member_slot;
begin
  if v_couple is null then raise exception 'NOTHING_PENDING'; end if;

  select member_slot into v_slot from profiles where id = v_me;
  if v_slot <> 'a' then raise exception 'NOT_INVITER'; end if;

  if (select count(*) from profiles where couple_id = v_couple) < 2 then
    raise exception 'NO_PARTNER_YET';
  end if;

  update couples set status = 'active', started_on = p_started_on
   where id = v_couple;

  -- 남은 초대 코드는 죽인다. 안 하면 세 번째 사람이 들어올 수 있다.
  update invites set used_at = now()
   where couple_id = v_couple and used_at is null;
end $$;

/**
 * 거절 · 취소.
 *
 * 거절 문구는 중립적으로 낸다. 잘못 전달된 코드를 넣은 제3자에게
 * "거절당했다"는 감각을 줄 이유가 없다 → docs/08-auth-pairing.md 3단계
 */
create or replace function public.cancel_pair()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_couple uuid := my_pending_couple_id();
begin
  if v_couple is null then return; end if;

  update profiles set couple_id = null, member_slot = null where id = v_me;
  update invites set used_at = now()
   where couple_id = v_couple and used_at is null;

  -- 아무도 안 남으면 빈 커플을 지운다
  delete from couples c where c.id = v_couple
    and not exists (select 1 from profiles p where p.couple_id = c.id);
end $$;

/** 내가 상대를 부르는 애칭. 소유자는 나다. 각자 따로 정한다. */
create or replace function public.set_pet_name(p_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set pet_name_for_partner = nullif(btrim(coalesce(p_name, '')), '')
   where id = auth.uid();
end $$;

/** 사귄 날. D-day 기준이 된다. 나중에 정해도 된다. */
create or replace function public.set_started_on(p_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := my_couple_id();
begin
  if v_couple is null then raise exception 'NOT_PAIRED'; end if;
  if p_date is not null and p_date > current_date then raise exception 'FUTURE_DATE'; end if;
  update couples set started_on = p_date where id = v_couple;
end $$;

/**
 * 24시간 안에 확정 안 된 pending을 푼다. pg_cron이 매일 부른다.
 *
 * 안 풀면 수락한 쪽이 영원히 대기 상태로 묶여 다른 사람과 연결도 못 한다.
 */
create or replace function public.expire_pending_couples()
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with stale as (
    select id from couples
     where status = 'pending' and created_at < now() - interval '24 hours'
  ),
  freed as (
    update profiles set couple_id = null, member_slot = null
     where couple_id in (select id from stale)
    returning 1
  ),
  gone as (
    delete from couples where id in (select id from stale) returning 1
  )
  select count(*) into v_n from gone;
  return v_n;
end $$;

revoke execute on function public.expire_pending_couples() from public, anon, authenticated;
