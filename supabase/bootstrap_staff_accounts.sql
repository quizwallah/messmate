-- Run only after creating and confirming these three users in
-- Supabase Dashboard > Authentication > Users.
-- Each Auth user's email must match the mapping below. Set unique passwords
-- in Supabase; do not reuse a shared default password.

insert into public.scholar_allowlist (scholar_number, display_name, is_active)
values
  ('MESSADMIN1', 'Mess Admin', true),
  ('MESSCONV1', 'Mess Convenor', true),
  ('MESSWARD1', 'Mess Warden', true)
on conflict (scholar_number) do update
set display_name = excluded.display_name, is_active = true;

insert into public.profiles (id, scholar_number, full_name, role, is_active)
select u.id, a.scholar_number, a.full_name, a.role::public.app_role, true
from auth.users u
join (values
  ('messadmin1@stu.manit.ac.in', 'MESSADMIN1', 'Mess Admin', 'admin'),
  ('messconv1@stu.manit.ac.in', 'MESSCONV1', 'Mess Convenor', 'convenor'),
  ('messward1@stu.manit.ac.in', 'MESSWARD1', 'Mess Warden', 'warden')
) as a(email, scholar_number, full_name, role) on lower(u.email) = a.email
on conflict (id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = true;

-- If the inserted row count is less than 3, check the Auth user's emails above.
select scholar_number, full_name, role, is_active
from public.profiles
where scholar_number in ('MESSADMIN1', 'MESSCONV1', 'MESSWARD1')
order by scholar_number;
