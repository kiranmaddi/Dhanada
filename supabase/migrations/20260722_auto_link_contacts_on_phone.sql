-- Trigger: Auto-link contacts when phone numbers match
-- When a user updates their phone number, automatically create contact_user_links
-- for any contacts that have that phone number

begin;

create or replace function public.auto_link_contacts_on_phone_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact record;
begin
  -- Only process if phone_number changed and is not null
  if new.phone_number is not null and (old.phone_number is null or old.phone_number != new.phone_number) then
    -- Find all contacts with this phone number
    for v_contact in
      select id, owner_id
      from public.contacts
      where phone = new.phone_number
    loop
      -- Create a link if it doesn't already exist
      insert into public.contact_user_links (owner_user_id, contact_id, linked_user_id, linked_via)
      values (v_contact.owner_id, v_contact.id, new.id, 'manual')
      on conflict (owner_user_id, contact_id) do nothing;
    end loop;
  end if;
  
  return new;
end;
$$;

-- Trigger on profiles table when phone_number is updated
drop trigger if exists trigger_auto_link_contacts_on_phone_update on public.profiles;
create trigger trigger_auto_link_contacts_on_phone_update
after insert or update on public.profiles
for each row
execute function public.auto_link_contacts_on_phone_update();

commit;
