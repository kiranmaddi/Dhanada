-- RPC: get contacts who have installed the Dhanada app (via contact_user_links)
-- AND have at least one active/published wishlist.
-- Runs as security definer so it can read other users' wishlists.

begin;

create or replace function public.get_contacts_with_wishlists()
returns table (
  contact_id        uuid,
  contact_name      text,
  contact_phone     text,
  linked_user_id    uuid,
  wishlist_count    bigint,
  latest_wishlist_name text,
  latest_wishlist_id   uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cul.contact_id,
    c.name                                    as contact_name,
    c.phone                                   as contact_phone,
    cul.linked_user_id,
    count(w.id)                               as wishlist_count,
    (
      select w2.name
      from   public.wishlists w2
      where  w2.owner_id  = cul.linked_user_id
        and  w2.is_active = true
      order  by w2.created_at desc
      limit  1
    )                                         as latest_wishlist_name,
    (
      select w2.id
      from   public.wishlists w2
      where  w2.owner_id  = cul.linked_user_id
        and  w2.is_active = true
      order  by w2.created_at desc
      limit  1
    )                                         as latest_wishlist_id
  from       public.contact_user_links cul
  join       public.contacts  c  on  c.id  = cul.contact_id
  left join  public.wishlists w  on  w.owner_id  = cul.linked_user_id
                                 and w.is_active = true
  where  cul.owner_user_id = auth.uid()
  group  by  cul.contact_id, c.name, c.phone, cul.linked_user_id
  having count(w.id) > 0
  order  by  c.name;
$$;

revoke all   on function public.get_contacts_with_wishlists() from public;
grant  execute on function public.get_contacts_with_wishlists() to authenticated;

commit;
