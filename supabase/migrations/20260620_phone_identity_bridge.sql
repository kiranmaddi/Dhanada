-- Phone identity bridge for email-auth users and phone-based contacts.
-- Adds normalized/hash phone fields, sync triggers, and safe match RPC.

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Columns for normalized/hash phone identity
-- ------------------------------------------------------------

alter table public.contacts
  add column if not exists phone_e164 text,
  add column if not exists phone_hash text;

alter table public.profiles
  add column if not exists phone_e164 text,
  add column if not exists phone_hash text,
  add column if not exists phone_verified_at timestamptz;

create index if not exists idx_contacts_owner_phone_hash
  on public.contacts(owner_id, phone_hash);

create index if not exists idx_contacts_phone_hash
  on public.contacts(phone_hash);

create index if not exists idx_profiles_phone_hash
  on public.profiles(phone_hash);

-- Enforce one verified phone per user identity globally.
create unique index if not exists uq_profiles_verified_phone_hash
  on public.profiles(phone_hash)
  where phone_hash is not null and phone_verified_at is not null;

-- ------------------------------------------------------------
-- Phone normalization + hashing helpers
-- ------------------------------------------------------------

create or replace function public.normalize_phone_e164(
  raw_phone text,
  default_country_code text default '91'
)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
  cc text;
begin
  if raw_phone is null or btrim(raw_phone) = '' then
    return null;
  end if;

  cc := regexp_replace(coalesce(default_country_code, '91'), '\\D', '', 'g');
  if cc = '' then
    cc := '91';
  end if;

  digits := regexp_replace(raw_phone, '\\D', '', 'g');

  -- Convert 00-prefixed international format to standard digits.
  if left(digits, 2) = '00' then
    digits := substring(digits from 3);
  end if;

  -- Local 10-digit number -> default country code.
  if length(digits) = 10 then
    return '+' || cc || digits;
  end if;

  -- If already includes the default country code in numeric form.
  if left(digits, length(cc)) = cc and length(digits) = length(cc) + 10 then
    return '+' || digits;
  end if;

  -- Generic fallback for other valid international lengths.
  if length(digits) between 11 and 15 then
    return '+' || digits;
  end if;

  return null;
end;
$$;

create or replace function public.phone_hash_from_e164(e164_phone text)
returns text
language sql
stable
as $$
  select case
    when e164_phone is null then null
    else encode(
      digest(
        e164_phone || coalesce(current_setting('app.phone_hash_pepper', true), ''),
        'sha256'
      ),
      'hex'
    )
  end;
$$;

-- ------------------------------------------------------------
-- Triggers to keep normalized/hash fields in sync
-- ------------------------------------------------------------

create or replace function public.contacts_sync_phone_identity_fields()
returns trigger
language plpgsql
as $$
begin
  new.phone_e164 := public.normalize_phone_e164(new.phone);
  new.phone_hash := public.phone_hash_from_e164(new.phone_e164);
  return new;
end;
$$;

create or replace function public.profiles_sync_phone_identity_fields()
returns trigger
language plpgsql
as $$
declare
  next_e164 text;
begin
  next_e164 := public.normalize_phone_e164(new.phone_number);

  -- Any phone change resets verification until OTP/verification flow confirms.
  if tg_op = 'INSERT' or next_e164 is distinct from old.phone_e164 then
    new.phone_verified_at := null;
  end if;

  new.phone_e164 := next_e164;
  new.phone_hash := public.phone_hash_from_e164(new.phone_e164);
  return new;
end;
$$;

drop trigger if exists trg_contacts_sync_phone_identity_fields on public.contacts;
create trigger trg_contacts_sync_phone_identity_fields
before insert or update of phone
on public.contacts
for each row
execute function public.contacts_sync_phone_identity_fields();

drop trigger if exists trg_profiles_sync_phone_identity_fields on public.profiles;
create trigger trg_profiles_sync_phone_identity_fields
before insert or update of phone_number
on public.profiles
for each row
execute function public.profiles_sync_phone_identity_fields();

-- Backfill existing rows.
update public.contacts
set phone = phone
where phone is not null;

update public.profiles
set phone_number = phone_number
where phone_number is not null;

-- ------------------------------------------------------------
-- Server-safe matching function
-- Returns only matches for the caller's own contacts and only against
-- users with verified phones.
-- ------------------------------------------------------------

create or replace function public.get_contact_match_candidates(max_rows integer default 25)
returns table (
  contact_id uuid,
  contact_name text,
  contact_phone text,
  matched_user_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as contact_id,
    c.name as contact_name,
    c.phone as contact_phone,
    p.id as matched_user_id
  from public.contacts c
  join public.profiles p
    on p.phone_hash = c.phone_hash
  where c.owner_id = auth.uid()
    and c.phone_hash is not null
    and p.phone_verified_at is not null
    and p.id <> auth.uid()
    and not exists (
      select 1
      from public.contact_user_links cul
      where cul.owner_user_id = auth.uid()
        and cul.contact_id = c.id
    )
  order by c.created_at desc
  limit greatest(coalesce(max_rows, 25), 1);
$$;

grant execute on function public.get_contact_match_candidates(integer) to authenticated;

comment on function public.get_contact_match_candidates(integer)
is 'Returns only caller-owned contacts that hash-match a verified user phone and are not linked yet.';

commit;
