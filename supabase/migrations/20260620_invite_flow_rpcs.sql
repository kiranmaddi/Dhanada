-- Invite flow RPCs for public preview and authenticated claim.

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Create invite for a caller-owned contact
-- ------------------------------------------------------------

create or replace function public.create_invite_for_contact(
  p_contact_id uuid,
  p_expires_in_hours integer default 168
)
returns table (
  invite_id uuid,
  token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_contact_owner uuid;
  v_invite_id uuid;
  v_expiry timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select c.owner_id
  into v_contact_owner
  from public.contacts c
  where c.id = p_contact_id;

  if v_contact_owner is null then
    raise exception 'Contact not found';
  end if;

  if v_contact_owner <> auth.uid() then
    raise exception 'Not allowed to invite this contact';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expiry := now() + make_interval(hours => greatest(coalesce(p_expires_in_hours, 168), 1));

  insert into public.app_invites (
    inviter_user_id,
    target_contact_id,
    token,
    status,
    expires_at
  ) values (
    auth.uid(),
    p_contact_id,
    v_token,
    'sent',
    v_expiry
  )
  returning id into v_invite_id;

  return query
  select v_invite_id, v_token, v_expiry;
end;
$$;

revoke all on function public.create_invite_for_contact(uuid, integer) from public;
grant execute on function public.create_invite_for_contact(uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- Public-safe invite preview (no sensitive fields)
-- ------------------------------------------------------------

create or replace function public.get_invite_preview_public(
  p_token text
)
returns table (
  invite_id uuid,
  inviter_user_id uuid,
  inviter_display_name text,
  status text,
  is_valid boolean,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with inv as (
    select
      ai.id,
      ai.inviter_user_id,
      ai.status,
      ai.expires_at,
      ai.accepted_at,
      ai.invitee_user_id
    from public.app_invites ai
    where ai.token = p_token
    limit 1
  )
  select
    inv.id as invite_id,
    inv.inviter_user_id,
    coalesce(nullif(btrim(p.full_name), ''), 'A Dhanada user') as inviter_display_name,
    inv.status,
    (
      inv.status in ('sent', 'installed')
      and (inv.expires_at is null or inv.expires_at > now())
    ) as is_valid,
    inv.expires_at
  from inv
  left join public.profiles p on p.id = inv.inviter_user_id;
$$;

revoke all on function public.get_invite_preview_public(text) from public;
grant execute on function public.get_invite_preview_public(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Claim invite for authenticated user
-- ------------------------------------------------------------

create or replace function public.claim_invite(
  p_token text
)
returns table (
  invite_id uuid,
  inviter_user_id uuid,
  invitee_user_id uuid,
  invite_status text,
  connection_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.app_invites%rowtype;
  v_existing_connection public.user_connections%rowtype;
  v_connection_status text := 'pending';
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_invite
  from public.app_invites ai
  where ai.token = p_token
  limit 1
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if v_invite.inviter_user_id = auth.uid() then
    raise exception 'Cannot claim your own invite';
  end if;

  if v_invite.status = 'revoked' then
    raise exception 'Invite was revoked';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    update public.app_invites
    set status = 'expired'
    where id = v_invite.id
      and status <> 'accepted';
    raise exception 'Invite expired';
  end if;

  if v_invite.status = 'accepted' then
    if v_invite.invitee_user_id = auth.uid() then
      return query
      select
        v_invite.id,
        v_invite.inviter_user_id,
        v_invite.invitee_user_id,
        v_invite.status,
        (
          select coalesce(uc.status, 'pending')
          from public.user_connections uc
          where (
            (uc.requester_user_id = v_invite.inviter_user_id and uc.addressee_user_id = auth.uid())
            or
            (uc.requester_user_id = auth.uid() and uc.addressee_user_id = v_invite.inviter_user_id)
          )
          limit 1
        )::text;
      return;
    end if;

    raise exception 'Invite already claimed by another user';
  end if;

  update public.app_invites
  set
    invitee_user_id = auth.uid(),
    status = 'accepted',
    accepted_at = now()
  where id = v_invite.id;

  if v_invite.target_contact_id is not null then
    insert into public.contact_user_links (
      owner_user_id,
      contact_id,
      linked_user_id,
      linked_via,
      verified_at
    ) values (
      v_invite.inviter_user_id,
      v_invite.target_contact_id,
      auth.uid(),
      'invite',
      now()
    )
    on conflict (owner_user_id, contact_id)
    do update set
      linked_user_id = excluded.linked_user_id,
      linked_via = 'invite',
      verified_at = now();
  end if;

  select *
  into v_existing_connection
  from public.user_connections uc
  where (
    (uc.requester_user_id = v_invite.inviter_user_id and uc.addressee_user_id = auth.uid())
    or
    (uc.requester_user_id = auth.uid() and uc.addressee_user_id = v_invite.inviter_user_id)
  )
  limit 1
  for update;

  if found then
    v_connection_status := v_existing_connection.status;
  else
    insert into public.user_connections (
      requester_user_id,
      addressee_user_id,
      status,
      requested_at,
      created_at,
      updated_at
    ) values (
      v_invite.inviter_user_id,
      auth.uid(),
      'pending',
      now(),
      now(),
      now()
    );
    v_connection_status := 'pending';
  end if;

  return query
  select
    v_invite.id,
    v_invite.inviter_user_id,
    auth.uid(),
    'accepted'::text,
    v_connection_status;
end;
$$;

revoke all on function public.claim_invite(text) from public;
grant execute on function public.claim_invite(text) to authenticated;

commit;
