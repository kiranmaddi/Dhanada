-- Get events created by a specific user where current user is invited

CREATE OR REPLACE FUNCTION public.get_contact_invited_events(p_contact_user_id uuid)
RETURNS TABLE(event_id uuid, event_name text, event_date text, venue text, description text, owner_id uuid, owner_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    e.id,
    e.event_name,
    e.event_date,
    e.venue,
    e.description,
    e.owner_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Dhanada user') as owner_name
  FROM events e
  LEFT JOIN profiles p ON p.id = e.owner_id
  WHERE e.owner_id = p_contact_user_id
  AND EXISTS (
    SELECT 1 FROM event_invitees ei
    JOIN public.contact_user_links cul ON cul.contact_id = ei.contact_id
    WHERE ei.event_id = e.id
    AND cul.linked_user_id = auth.uid()
  )
  ORDER BY e.event_date DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_contact_invited_events(uuid) TO authenticated;
