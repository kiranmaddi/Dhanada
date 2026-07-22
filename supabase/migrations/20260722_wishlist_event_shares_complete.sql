-- Complete Wishlist Event Sharing Setup
-- Tables, RLS Policies, and Triggers for sharing wishlists via events

BEGIN;

-- ===== TABLE: wishlist_event_shares =====
-- Stores relationships between wishlists and events
-- When a wishlist is shared with an event, all event invitees get access via triggers
CREATE TABLE IF NOT EXISTS public.wishlist_event_shares (
  id                    uuid primary key default gen_random_uuid(),
  wishlist_id           uuid not null references public.wishlists(id) on delete cascade,
  event_id              uuid not null references public.events(id) on delete cascade,
  shared_by_user_id     uuid not null references auth.users(id) on delete cascade,
  permission            text not null default 'view' check (permission in ('view', 'edit', 'admin')),
  created_at            timestamptz not null default now(),
  
  unique(wishlist_id, event_id)
);

-- Enable RLS
ALTER TABLE public.wishlist_event_shares ENABLE ROW LEVEL SECURITY;

-- ===== RLS POLICIES =====

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can see wishlist event shares for their events" ON public.wishlist_event_shares;
DROP POLICY IF EXISTS "Users can share wishlists with their events" ON public.wishlist_event_shares;

-- Policy: SELECT - Users can see event shares for events they created or are invited to
CREATE POLICY "Users can see wishlist event shares for their events"
  ON public.wishlist_event_shares
  FOR SELECT
  USING (
    -- User created the event
    event_id IN (
      SELECT id FROM public.events WHERE owner_id = auth.uid()
    )
    OR
    -- User is invited to the event
    event_id IN (
      SELECT ei.event_id
      FROM public.event_invitees ei
      JOIN public.contact_user_links cul ON cul.contact_id = ei.contact_id
      WHERE cul.linked_user_id = auth.uid()
    )
  );

-- Policy: INSERT - Users can share their wishlists with events they created or are invited to
CREATE POLICY "Users can share wishlists with their events"
  ON public.wishlist_event_shares
  FOR INSERT
  WITH CHECK (
    -- Wishlist must belong to current user
    wishlist_id IN (
      SELECT id FROM public.wishlists WHERE owner_id = auth.uid()
    )
    AND
    -- User either created the event OR is invited to it
    (
      -- User created the event
      event_id IN (
        SELECT id FROM public.events WHERE owner_id = auth.uid()
      )
      OR
      -- User is invited to the event
      event_id IN (
        SELECT ei.event_id
        FROM public.event_invitees ei
        JOIN public.contact_user_links cul ON cul.contact_id = ei.contact_id
        WHERE cul.linked_user_id = auth.uid()
      )
    )
    AND
    -- Sharing user must be current user
    shared_by_user_id = auth.uid()
  );

-- Policy: DELETE - Users can unshare wishlists they shared
CREATE POLICY "Users can unshare wishlists"
  ON public.wishlist_event_shares
  FOR DELETE
  USING (shared_by_user_id = auth.uid());

-- ===== TRIGGERS =====

-- Trigger 1: When a wishlist is shared with an event, auto-share with all event invitees
DROP FUNCTION IF EXISTS public.share_wishlist_with_event_invitees() CASCADE;

CREATE FUNCTION public.share_wishlist_with_event_invitees()
RETURNS trigger AS $$
BEGIN
  -- Insert into wishlist_shares for all event invitees (via their contact's linked user)
  INSERT INTO public.wishlist_shares (wishlist_id, owner_user_id, shared_with_user_id, permission, is_active, created_at)
  SELECT
    new.wishlist_id,
    w.owner_id,
    cul.linked_user_id,
    new.permission,
    true,
    now()
  FROM public.wishlists w
  JOIN public.event_invitees ei ON ei.event_id = new.event_id
  JOIN public.contacts c ON c.id = ei.contact_id
  JOIN public.contact_user_links cul ON cul.contact_id = c.id
  WHERE w.id = new.wishlist_id
    AND cul.linked_user_id != new.shared_by_user_id
  ON CONFLICT (wishlist_id, shared_with_user_id) DO UPDATE
    SET permission = excluded.permission, is_active = true, created_at = now();
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_share_wishlist_with_event_invitees
  AFTER INSERT ON public.wishlist_event_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.share_wishlist_with_event_invitees();

-- Trigger 2: When a user is added to event invitees, auto-share all event's wishlists
DROP FUNCTION IF EXISTS public.add_event_wishlists_to_new_invitee() CASCADE;

CREATE FUNCTION public.add_event_wishlists_to_new_invitee()
RETURNS trigger AS $$
BEGIN
  -- Insert into wishlist_shares for all wishlists shared with this event
  -- Link through contact -> contact_user_links to get the linked_user_id
  INSERT INTO public.wishlist_shares (wishlist_id, owner_user_id, shared_with_user_id, permission, is_active, created_at)
  SELECT
    wes.wishlist_id,
    w.owner_id,
    cul.linked_user_id,
    wes.permission,
    true,
    now()
  FROM public.wishlist_event_shares wes
  JOIN public.wishlists w ON w.id = wes.wishlist_id
  JOIN public.contact_user_links cul ON cul.contact_id = new.contact_id
  WHERE wes.event_id = new.event_id
  ON CONFLICT (wishlist_id, shared_with_user_id) DO UPDATE
    SET permission = excluded.permission, is_active = true, created_at = now();
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_add_event_wishlists_to_new_invitee
  AFTER INSERT ON public.event_invitees
  FOR EACH ROW
  EXECUTE FUNCTION public.add_event_wishlists_to_new_invitee();

-- Trigger 3: When a wishlist is unshared from an event, remove from wishlist_shares
DROP FUNCTION IF EXISTS public.remove_wishlist_from_event_invitees() CASCADE;

CREATE FUNCTION public.remove_wishlist_from_event_invitees()
RETURNS trigger AS $$
BEGIN
  -- Delete from wishlist_shares for all event invitees
  DELETE FROM public.wishlist_shares ws
  WHERE ws.wishlist_id = old.wishlist_id
    AND ws.shared_with_user_id IN (
      SELECT cul.linked_user_id
      FROM public.event_invitees ei
      JOIN public.contacts c ON c.id = ei.contact_id
      JOIN public.contact_user_links cul ON cul.contact_id = c.id
      WHERE ei.event_id = old.event_id
        AND cul.linked_user_id != old.shared_by_user_id
    )
    AND ws.owner_user_id = old.shared_by_user_id;
  
  RETURN old;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_remove_wishlist_from_event_invitees
  AFTER DELETE ON public.wishlist_event_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_wishlist_from_event_invitees();

COMMIT;
