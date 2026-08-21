-- 0001 커플 · 프로필 · 초대
-- 근거: docs/06-data-model.md, docs/08-auth-pairing.md

create extension if not exists pgcrypto with schema extensions;

-- pending: B가 코드를 넣었지만 A가 아직 확정하지 않은 상태.
-- 양쪽이 확인해야 active가 된다. 링크가 새어도 마지막에 막을 수 있게.
create type couple_status as enum ('pending', 'active', 'dissolved');
create type member_slot   as enum ('a', 'b');

create table couples (
  id            uuid primary key default gen_random_uuid(),
  status        couple_status not null default 'pending',
  started_on    date,                       -- 사귄 날. D-day 기준
  created_at    timestamptz not null default now(),
  dissolved_at  timestamptz,
  dissolved_by  uuid references auth.users(id) on delete set null,
  purge_after   timestamptz
);

create table profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,

  -- 신원 확인용. 페어링 확인 화면에서만 상대에게 보인다.
  name               text not null check (char_length(name) between 1 and 20),
  birth_date         date not null,
  birth_is_lunar     boolean not null default false,

  -- 표시용
  display_name       text check (char_length(display_name) between 1 and 12),
  emoji_key          text not null default '🐰',

  -- 내가 상대를 부르는 애칭. 소유자는 나.
  pet_name_for_partner text check (char_length(pet_name_for_partner) between 1 and 12),

  couple_id          uuid references couples(id) on delete set null,
  member_slot        member_slot,
  previous_couple_id uuid references couples(id) on delete set null,
  default_visibility text not null default 'busy',
  color_preset       text not null default 'amethyst_brass',
  timezone           text not null default 'Asia/Seoul',
  created_at         timestamptz not null default now(),
  constraint slot_with_couple
    check ((couple_id is null) = (member_slot is null))
);

-- 성별·전화번호 컬럼이 없는 것은 의도다.
--   성별: 주기 모듈을 선택 활성화(cycle_module_on)로 대신한다
--   전화번호: 받아도 본인 확인이 안 되고 유출 등급만 올라간다
-- 근거: docs/11-naming.md, docs/22-privacy.md

-- 정원 2명을 DB에서 강제한다. 화면에서만 막으면 API 직접 호출로 뚫린다.
create unique index profiles_couple_slot_uniq
  on profiles (couple_id, member_slot) where couple_id is not null;

create table invites (
  code       text primary key,
  couple_id  uuid not null references couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references auth.users(id) on delete set null
);
