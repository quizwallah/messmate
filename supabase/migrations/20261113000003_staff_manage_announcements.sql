-- Allow all announcement managers to edit and remove published updates.
-- Staff access remains limited to active Admin, Convenor, and Warden profiles.
drop policy if exists announcements_delete_admin on public.announcements;
drop policy if exists announcements_delete_staff on public.announcements;

create policy announcements_delete_staff on public.announcements
  for delete to authenticated
  using (private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[]));
