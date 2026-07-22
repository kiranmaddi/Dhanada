-- Table: Wishlist sharing via events
-- When a wishlist is shared with an event, all event invitees get access

begin;

-- Create wishlist_event_shares table
create table if not exists public.wishlist_event_shares (
  id                    uuid primary key default gen_random_uuid(),
  wishlist_id           uuid not null references public.wishlists(id) on delete cascade,
  event_id              uuid not null references public.events(id) on delete cascade,
  shared_by_user_id     uuid not null references auth.users(id) on delete cascade,
  permission            text not null default 'view' check (permission in ('view', 'edit', 'admin')),
  created_at            timestamptz not null default now(),
  
  unique(wishlist_id, event_id)
);

-- Enable RLS
alter table public.wishlist_event_shares enable row level security;

-- RLS Policy: Users can see event shares for events they created or are invited to
create policy "Users can see wishlist event shares for their events"
  on public.wishlist_event_shares
  for select
  using (
    event_id in (
      select id from public.events where owner_id = auth.uid()
    )
    or
    event_id in (
      select ei.event_id
      from public.event_invitees ei
      join public.contact_user_links cul on cul.contact_id = ei.contact_id
      where cul.linked_user_id = auth.uid()
    )
  );

-- RLS Policy: Users can share their wishlists with events they created or are invited to
create policy "Users can share wishlists with their events"
  on public.wishlist_event_shares
  for insert
  with check (
    -- Wishlist must belong to current user
    wishlist_id in (
      select id from public.wishlists where owner_id = auth.uid()
    )
    and
    -- User either created the event OR is invited to it
    (
      -- User created the event
      event_id in (
        select id from public.events where owner_id = auth.uid()
      )
      or
      -- User is invited to the event
      event_id in (
        select ei.event_id
        from public.event_invitees ei
        join public.contact_user_links cul on cul.contact_id = ei.contact_id
        where cul.linked_user_id = auth.uid()
      )
    )
    and
    -- Sharing user must be current user
    shared_by_user_id = auth.uid()
  );

-- Trigger: When a wishlist is shared with an event, add it to wishlist_shares for all invitees
create or replace function public.share_wishlist_with_event_invitees()
returns trigger as $$
begin
  -- Insert into wishlist_shares for all event invitees (via their contact's linked user)
  insert into public.wishlist_shares (wishlist_id, shared_with_user_id, permission, created_at)
  select
    new.wishlist_id,
    cul.linked_user_id,
    new.permission,
    now()
  from public.event_invitees ei
  join public.contacts c on c.id = ei.contact_id
  join public.contact_user_links cul on cul.contact_id = c.id
  where ei.event_id = new.event_id
    and cul.linked_user_id != new.shared_by_user_id
  on conflict (wishlist_id, shared_with_user_id) do update
    set permission = excluded.permission, created_at = now();
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trigger_share_wishlist_with_event_invitees
  after insert on public.wishlist_event_shares
  for each row
  execute function public.share_wishlist_with_event_invitees();

-- Trigger: When a user is added to event invitees, share all event's wishlists with them
create or replace function public.add_event_wishlists_to_new_invitee()
returns trigger as $$
begin
  -- Insert into wishlist_shares for all wishlists shared with this event
  -- Link through contact -> contact_user_links to get the linked_user_id
  insert into public.wishlist_shares (wishlist_id, shared_with_user_id, permission, created_at)
  select
    wes.wishlist_id,
    cul.linked_user_id,
    wes.permission,
    now()
  from public.wishlist_event_shares wes
  join public.contact_user_links cul on cul.contact_id = new.contact_id
  where wes.event_id = new.event_id
  on conflict (wishlist_id, shared_with_user_id) do update
    set permission = excluded.permission, created_at = now();
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trigger_add_event_wishlists_to_new_invitee
  after insert on public.event_invitees
  for each row
  execute function public.add_event_wishlists_to_new_invitee();

commit;
