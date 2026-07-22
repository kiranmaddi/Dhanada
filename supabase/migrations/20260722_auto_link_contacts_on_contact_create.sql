-- Trigger: Auto-link contacts when a new contact is created with a phone
-- When a contact is created/updated with a phone number, automatically create contact_user_links
-- for any existing users who have that phone number

begin;

create or replace function public.auto_link_contacts_on_contact_create()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
begin
  -- Only process if phone is not null
  if new.phone is not null then
    -- Find all users with this phone number
    for v_user in
      select id
      from public.profiles
      where phone_number = new.phone
    loop
      -- Create a link if it doesn't already exist
      insert into public.contact_user_links (owner_user_id, contact_id, linked_user_id, linked_via)
      values (new.owner_id, new.id, v_user.id, 'manual')
      on conflict (owner_user_id, contact_id) do nothing;
    end loop;
  end if;
  
  return new;
end;
$$;

-- Trigger on contacts table when contact is created/updated
drop trigger if exists trigger_auto_link_contacts_on_contact_create on public.contacts;
create trigger trigger_auto_link_contacts_on_contact_create
after insert or update on public.contacts
for each row
execute function public.auto_link_contacts_on_contact_create();

commit;
