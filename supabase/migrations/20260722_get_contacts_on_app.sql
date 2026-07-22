-- RPC: Get contacts who have installed the Dhanada app
-- (linked via contact_user_links, regardless of whether they have wishlists)

begin;

create or replace function public.get_contacts_on_app()
returns table (
  contact_id    uuid,
  contact_name  text,
  contact_phone text,
  linked_user_id uuid,
  user_name     text,
  user_email    text,
  linked_via    text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id                            as contact_id,
    c.name                          as contact_name,
    c.phone                         as contact_phone,
    cul.linked_user_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Dhanada user')
                                    as user_name,
    u.email                         as user_email,
    cul.linked_via,
    cul.created_at
  from       public.contact_user_links cul
  join       public.contacts c      on c.id = cul.contact_id
  join       auth.users u           on u.id = cul.linked_user_id
  left join  public.profiles p      on p.id = cul.linked_user_id
  where      cul.owner_user_id = auth.uid()
  order by   c.name;
$$;

revoke all   on function public.get_contacts_on_app() from public;
grant  execute on function public.get_contacts_on_app() to authenticated;

commit;
