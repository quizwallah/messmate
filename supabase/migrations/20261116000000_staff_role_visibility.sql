-- Convenors manage mess feedback and complaints. Wardens can manage both mess
-- and floor complaints. Student roster administration remains Admin-only.

-- Keep the complete roster private to Admin. Other staff can identify only
-- students who appear in records their role is allowed to review.
drop policy if exists profiles_read_staff on public.profiles;
create policy profiles_read_staff on public.profiles
  for select to authenticated
  using (
    private.has_any_role(array['admin']::public.app_role[])
    or (
      private.has_any_role(array['convenor', 'warden', 'committee']::public.app_role[])
      and (
        exists (select 1 from public.serious_complaints c where c.student_id = profiles.id)
        or exists (select 1 from public.meal_feedback f where f.student_id = profiles.id)
        or exists (select 1 from public.absence_periods a where a.student_id = profiles.id)
        or exists (select 1 from public.meal_tokens t where t.student_id = profiles.id)
        or (
          private.has_any_role(array['warden']::public.app_role[])
          and exists (select 1 from public.other_complaints o where o.student_id = profiles.id)
        )
      )
    )
  );

drop policy if exists complaints_read_owner_or_staff on public.serious_complaints;
create policy complaints_read_owner_or_staff on public.serious_complaints
  for select to authenticated
  using (
    (student_id = (select auth.uid()) and private.has_any_role(array['student']::public.app_role[]))
    or private.has_any_role(array['admin', 'convenor', 'warden', 'committee']::public.app_role[])
  );

drop policy if exists complaints_update_staff_status on public.serious_complaints;
create policy complaints_update_staff_status on public.serious_complaints
  for update to authenticated
  using (private.has_any_role(array['admin', 'convenor', 'warden', 'committee']::public.app_role[]))
  with check (private.has_any_role(array['admin', 'convenor', 'warden', 'committee']::public.app_role[]));

drop policy if exists other_complaints_read_owner_or_staff on public.other_complaints;
create policy other_complaints_read_owner_or_staff on public.other_complaints
  for select to authenticated
  using (
    (student_id = (select auth.uid()) and private.has_any_role(array['student']::public.app_role[]))
    or private.has_any_role(array['admin', 'warden']::public.app_role[])
  );

drop policy if exists other_complaints_update_staff_status on public.other_complaints;
create policy other_complaints_update_staff_status on public.other_complaints
  for update to authenticated
  using (private.has_any_role(array['admin', 'warden']::public.app_role[]))
  with check (private.has_any_role(array['admin', 'warden']::public.app_role[]));
