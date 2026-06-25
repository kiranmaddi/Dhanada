-- Step 1 + Step 2 foundation for social invite and explicit sharing.
-- Safe to run multiple times.

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) INVITES + CONNECTIONS + CONTACT LINKING
-- ------------------------------------------------------------

create table if not exists public.app_invites (
	id uuid primary key default gen_random_uuid(),
	inviter_user_id uuid not null references auth.users(id) on delete cascade,
	target_contact_id uuid null references public.contacts(id) on delete set null,
	invitee_user_id uuid null references auth.users(id) on delete set null,
	token text not null unique,
	status text not null default 'sent'
		check (status in ('sent', 'installed', 'accepted', 'expired', 'revoked')),
	expires_at timestamptz null,
	accepted_at timestamptz null,
	created_at timestamptz not null default now()
);

create index if not exists idx_app_invites_inviter
	on public.app_invites(inviter_user_id, created_at desc);

create index if not exists idx_app_invites_invitee
	on public.app_invites(invitee_user_id, created_at desc);

create table if not exists public.contact_user_links (
	id uuid primary key default gen_random_uuid(),
	owner_user_id uuid not null references auth.users(id) on delete cascade,
	contact_id uuid not null references public.contacts(id) on delete cascade,
	linked_user_id uuid not null references auth.users(id) on delete cascade,
	linked_via text not null default 'invite'
		check (linked_via in ('invite', 'manual', 'import')),
	verified_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	unique (owner_user_id, contact_id),
	unique (owner_user_id, linked_user_id)
);

create index if not exists idx_contact_user_links_owner
	on public.contact_user_links(owner_user_id, created_at desc);

create index if not exists idx_contact_user_links_linked
	on public.contact_user_links(linked_user_id);

create table if not exists public.user_connections (
	id uuid primary key default gen_random_uuid(),
	requester_user_id uuid not null references auth.users(id) on delete cascade,
	addressee_user_id uuid not null references auth.users(id) on delete cascade,
	status text not null default 'pending'
		check (status in ('pending', 'accepted', 'blocked', 'rejected')),
	requested_at timestamptz not null default now(),
	responded_at timestamptz null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	check (requester_user_id <> addressee_user_id),
	unique (requester_user_id, addressee_user_id)
);

create index if not exists idx_user_connections_requester
	on public.user_connections(requester_user_id, status);

create index if not exists idx_user_connections_addressee
	on public.user_connections(addressee_user_id, status);

-- ------------------------------------------------------------
-- 2) SHARING TABLES
-- ------------------------------------------------------------

create table if not exists public.event_shares (
	id uuid primary key default gen_random_uuid(),
	event_id uuid not null references public.events(id) on delete cascade,
	owner_user_id uuid not null references auth.users(id) on delete cascade,
	shared_with_user_id uuid not null references auth.users(id) on delete cascade,
	permission text not null default 'view'
		check (permission in ('view', 'contribute')),
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (event_id, shared_with_user_id),
	check (owner_user_id <> shared_with_user_id)
);

create index if not exists idx_event_shares_owner
	on public.event_shares(owner_user_id, is_active);

create index if not exists idx_event_shares_shared_with
	on public.event_shares(shared_with_user_id, is_active);

create table if not exists public.wishlist_shares (
	id uuid primary key default gen_random_uuid(),
	wishlist_id uuid not null references public.wishlists(id) on delete cascade,
	owner_user_id uuid not null references auth.users(id) on delete cascade,
	shared_with_user_id uuid not null references auth.users(id) on delete cascade,
	permission text not null default 'view'
		check (permission in ('view', 'contribute')),
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (wishlist_id, shared_with_user_id),
	check (owner_user_id <> shared_with_user_id)
);

create index if not exists idx_wishlist_shares_owner
	on public.wishlist_shares(owner_user_id, is_active);

create index if not exists idx_wishlist_shares_shared_with
	on public.wishlist_shares(shared_with_user_id, is_active);

-- Optional gift-level override sharing.
create table if not exists public.gift_shares (
	id uuid primary key default gen_random_uuid(),
	gift_id uuid not null references public.gifts(id) on delete cascade,
	owner_user_id uuid not null references auth.users(id) on delete cascade,
	shared_with_user_id uuid not null references auth.users(id) on delete cascade,
	permission text not null default 'view'
		check (permission in ('view', 'contribute')),
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (gift_id, shared_with_user_id),
	check (owner_user_id <> shared_with_user_id)
);

create index if not exists idx_gift_shares_owner
	on public.gift_shares(owner_user_id, is_active);

create index if not exists idx_gift_shares_shared_with
	on public.gift_shares(shared_with_user_id, is_active);

-- ------------------------------------------------------------
-- HELPER FUNCTION USED BY RLS (accepted non-blocked connection)
-- ------------------------------------------------------------

create or replace function public.are_connected(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.user_connections uc
		where (
			(uc.requester_user_id = user_a and uc.addressee_user_id = user_b)
			or
			(uc.requester_user_id = user_b and uc.addressee_user_id = user_a)
		)
		and uc.status = 'accepted'
	);
$$;

grant execute on function public.are_connected(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- RLS: ENABLE
-- ------------------------------------------------------------

alter table public.app_invites enable row level security;
alter table public.contact_user_links enable row level security;
alter table public.user_connections enable row level security;
alter table public.event_shares enable row level security;
alter table public.wishlist_shares enable row level security;
alter table public.gift_shares enable row level security;

-- ------------------------------------------------------------
-- RLS: APP INVITES
-- ------------------------------------------------------------

drop policy if exists app_invites_select_participants on public.app_invites;
create policy app_invites_select_participants
	on public.app_invites
	for select
	to authenticated
	using (
		inviter_user_id = auth.uid()
		or invitee_user_id = auth.uid()
	);

drop policy if exists app_invites_insert_inviter on public.app_invites;
create policy app_invites_insert_inviter
	on public.app_invites
	for insert
	to authenticated
	with check (inviter_user_id = auth.uid());

drop policy if exists app_invites_update_participants on public.app_invites;
create policy app_invites_update_participants
	on public.app_invites
	for update
	to authenticated
	using (
		inviter_user_id = auth.uid()
		or invitee_user_id = auth.uid()
	)
	with check (
		inviter_user_id = auth.uid()
		or invitee_user_id = auth.uid()
	);

-- ------------------------------------------------------------
-- RLS: CONTACT USER LINKS
-- ------------------------------------------------------------

drop policy if exists contact_user_links_select_owner_or_linked on public.contact_user_links;
create policy contact_user_links_select_owner_or_linked
	on public.contact_user_links
	for select
	to authenticated
	using (
		owner_user_id = auth.uid()
		or linked_user_id = auth.uid()
	);

drop policy if exists contact_user_links_insert_owner on public.contact_user_links;
create policy contact_user_links_insert_owner
	on public.contact_user_links
	for insert
	to authenticated
	with check (owner_user_id = auth.uid());

drop policy if exists contact_user_links_update_owner on public.contact_user_links;
create policy contact_user_links_update_owner
	on public.contact_user_links
	for update
	to authenticated
	using (owner_user_id = auth.uid())
	with check (owner_user_id = auth.uid());

drop policy if exists contact_user_links_delete_owner on public.contact_user_links;
create policy contact_user_links_delete_owner
	on public.contact_user_links
	for delete
	to authenticated
	using (owner_user_id = auth.uid());

-- ------------------------------------------------------------
-- RLS: USER CONNECTIONS
-- ------------------------------------------------------------

drop policy if exists user_connections_select_participants on public.user_connections;
create policy user_connections_select_participants
	on public.user_connections
	for select
	to authenticated
	using (
		requester_user_id = auth.uid()
		or addressee_user_id = auth.uid()
	);

drop policy if exists user_connections_insert_requester on public.user_connections;
create policy user_connections_insert_requester
	on public.user_connections
	for insert
	to authenticated
	with check (requester_user_id = auth.uid());

drop policy if exists user_connections_update_participants on public.user_connections;
create policy user_connections_update_participants
	on public.user_connections
	for update
	to authenticated
	using (
		requester_user_id = auth.uid()
		or addressee_user_id = auth.uid()
	)
	with check (
		requester_user_id = auth.uid()
		or addressee_user_id = auth.uid()
	);

-- ------------------------------------------------------------
-- RLS: SHARE TABLES (owner-managed, recipient-readable)
-- ------------------------------------------------------------

drop policy if exists event_shares_select_participants on public.event_shares;
create policy event_shares_select_participants
	on public.event_shares
	for select
	to authenticated
	using (
		owner_user_id = auth.uid()
		or shared_with_user_id = auth.uid()
	);

drop policy if exists event_shares_insert_owner_connected on public.event_shares;
create policy event_shares_insert_owner_connected
	on public.event_shares
	for insert
	to authenticated
	with check (
		owner_user_id = auth.uid()
		and public.are_connected(owner_user_id, shared_with_user_id)
	);

drop policy if exists event_shares_update_owner on public.event_shares;
create policy event_shares_update_owner
	on public.event_shares
	for update
	to authenticated
	using (owner_user_id = auth.uid())
	with check (owner_user_id = auth.uid());

drop policy if exists event_shares_delete_owner on public.event_shares;
create policy event_shares_delete_owner
	on public.event_shares
	for delete
	to authenticated
	using (owner_user_id = auth.uid());

drop policy if exists wishlist_shares_select_participants on public.wishlist_shares;
create policy wishlist_shares_select_participants
	on public.wishlist_shares
	for select
	to authenticated
	using (
		owner_user_id = auth.uid()
		or shared_with_user_id = auth.uid()
	);

drop policy if exists wishlist_shares_insert_owner_connected on public.wishlist_shares;
create policy wishlist_shares_insert_owner_connected
	on public.wishlist_shares
	for insert
	to authenticated
	with check (
		owner_user_id = auth.uid()
		and public.are_connected(owner_user_id, shared_with_user_id)
	);

drop policy if exists wishlist_shares_update_owner on public.wishlist_shares;
create policy wishlist_shares_update_owner
	on public.wishlist_shares
	for update
	to authenticated
	using (owner_user_id = auth.uid())
	with check (owner_user_id = auth.uid());

drop policy if exists wishlist_shares_delete_owner on public.wishlist_shares;
create policy wishlist_shares_delete_owner
	on public.wishlist_shares
	for delete
	to authenticated
	using (owner_user_id = auth.uid());

drop policy if exists gift_shares_select_participants on public.gift_shares;
create policy gift_shares_select_participants
	on public.gift_shares
	for select
	to authenticated
	using (
		owner_user_id = auth.uid()
		or shared_with_user_id = auth.uid()
	);

drop policy if exists gift_shares_insert_owner_connected on public.gift_shares;
create policy gift_shares_insert_owner_connected
	on public.gift_shares
	for insert
	to authenticated
	with check (
		owner_user_id = auth.uid()
		and public.are_connected(owner_user_id, shared_with_user_id)
	);

drop policy if exists gift_shares_update_owner on public.gift_shares;
create policy gift_shares_update_owner
	on public.gift_shares
	for update
	to authenticated
	using (owner_user_id = auth.uid())
	with check (owner_user_id = auth.uid());

drop policy if exists gift_shares_delete_owner on public.gift_shares;
create policy gift_shares_delete_owner
	on public.gift_shares
	for delete
	to authenticated
	using (owner_user_id = auth.uid());

-- ------------------------------------------------------------
-- OPTIONAL READ POLICIES ON CORE TABLES (shared visibility)
-- NOTE:
--  - These are additive and do not remove existing owner policies.
--  - Keep them disabled until you are ready to surface friend-view queries.
-- ------------------------------------------------------------

drop policy if exists events_select_shared_with_me on public.events;
create policy events_select_shared_with_me
	on public.events
	for select
	to authenticated
	using (
		exists (
			select 1
			from public.event_shares es
			where es.event_id = events.id
				and es.shared_with_user_id = auth.uid()
				and es.is_active = true
		)
	);

drop policy if exists wishlists_select_shared_with_me on public.wishlists;
create policy wishlists_select_shared_with_me
	on public.wishlists
	for select
	to authenticated
	using (
		exists (
			select 1
			from public.wishlist_shares ws
			where ws.wishlist_id = wishlists.id
				and ws.shared_with_user_id = auth.uid()
				and ws.is_active = true
		)
	);

drop policy if exists gifts_select_shared_with_me on public.gifts;
create policy gifts_select_shared_with_me
	on public.gifts
	for select
	to authenticated
	using (
		exists (
			select 1
			from public.gift_shares gs
			where gs.gift_id = gifts.id
				and gs.shared_with_user_id = auth.uid()
				and gs.is_active = true
		)
		or exists (
			select 1
			from public.event_shares es
			where es.event_id = gifts.event_id
				and es.shared_with_user_id = auth.uid()
				and es.is_active = true
		)
	);

commit;
