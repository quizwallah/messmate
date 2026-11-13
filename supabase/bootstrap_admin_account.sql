-- First create one confirmed admin user in Supabase Authentication > Users.
-- Replace ADMIN_AUTH_EMAIL below with that exact Auth user's email.
-- The password is set in Supabase Auth and is never stored in this SQL file.

insert into public.scholar_allowlist (scholar_number, display_name, is_active)
values ('MESSADMIN1', 'Mess Admin', true)
on conflict (scholar_number) do update
set display_name = excluded.display_name, is_active = true;

update public.scholar_allowlist a
set linked_auth_user_id = u.id
from auth.users u
where a.scholar_number = 'MESSADMIN1'
  and lower(u.email) = lower('ADMIN_AUTH_EMAIL');

insert into public.profiles (id, scholar_number, full_name, role, is_active)
select u.id, 'MESSADMIN1', 'Mess Admin', 'admin', true
from auth.users u
where lower(u.email) = lower('ADMIN_AUTH_EMAIL')
on conflict (id) do update set
  scholar_number = excluded.scholar_number,
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = true;

select scholar_number, full_name, role, is_active
from public.profiles
where scholar_number = 'MESSADMIN1';
