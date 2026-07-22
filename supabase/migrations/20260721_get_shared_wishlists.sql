-- RPC: Get wishlists that have been explicitly shared with the current user.

begin;

create or replace function public.get_shared_wishlists()
returns table (
  wishlist_id      uuid,
  wishlist_name    text,
  owner_id         uuid,
  owner_name       text,
  permission       text,
  item_count       bigint,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id                            as wishlist_id,
    w.name                          as wishlist_name,
    w.owner_id,
    coalesce(nullif(btrim(p.full_name), ''), u.email, 'A Dhanada user')
                                    as owner_name,
    ws.permission,
    count(wi.id)                    as item_count,
    w.created_at
  from       public.wishlist_shares ws
  join       public.wishlists w     on w.id = ws.wishlist_id
                                   and w.is_active = true
  left join  public.wishlist_items wi on wi.wishlist_id = w.id
                                     and wi.is_active = true
  left join  public.profiles p      on p.id = w.owner_id
  left join  auth.users u           on u.id = w.owner_id
  where      ws.shared_with_user_id = auth.uid()
         and ws.is_active = true
  group by   w.id, w.name, w.owner_id, p.full_name, u.email, ws.permission, w.created_at
  order by   w.created_at desc;
$$;

revoke all   on function public.get_shared_wishlists() from public;
grant  execute on function public.get_shared_wishlists() to authenticated;

commit;
