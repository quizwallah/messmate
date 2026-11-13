-- Deactivated students may keep an existing Auth session until it expires.
-- Apply the active student role check to direct database access as well.

drop policy if exists meal_tokens_read_own on public.meal_tokens;
create policy meal_tokens_read_own on public.meal_tokens
  for select to authenticated
  using (
    student_id = (select auth.uid())
    and private.has_any_role(array['student']::public.app_role[])
  );

drop policy if exists feedback_read_own_or_staff on public.meal_feedback;
create policy feedback_read_own_or_staff on public.meal_feedback
  for select to authenticated
  using (
    (student_id = (select auth.uid()) and private.has_any_role(array['student']::public.app_role[]))
    or private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );

drop policy if exists complaints_read_owner_or_staff on public.serious_complaints;
create policy complaints_read_owner_or_staff on public.serious_complaints
  for select to authenticated
  using (
    (student_id = (select auth.uid()) and private.has_any_role(array['student']::public.app_role[]))
    or private.has_any_role(array['committee', 'admin']::public.app_role[])
  );

drop policy if exists complaints_resolve_own on public.serious_complaints;
create policy complaints_resolve_own on public.serious_complaints
  for update to authenticated
  using (
    student_id = (select auth.uid())
    and status <> 'resolved'
    and private.has_any_role(array['student']::public.app_role[])
  )
  with check (
    student_id = (select auth.uid())
    and status = 'resolved'
    and private.has_any_role(array['student']::public.app_role[])
  );

drop policy if exists other_complaints_read_owner_or_staff on public.other_complaints;
create policy other_complaints_read_owner_or_staff on public.other_complaints
  for select to authenticated
  using (
    (student_id = (select auth.uid()) and private.has_any_role(array['student']::public.app_role[]))
    or private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );

drop policy if exists other_complaints_resolve_own on public.other_complaints;
create policy other_complaints_resolve_own on public.other_complaints
  for update to authenticated
  using (
    student_id = (select auth.uid())
    and status <> 'resolved'
    and private.has_any_role(array['student']::public.app_role[])
  )
  with check (
    student_id = (select auth.uid())
    and status = 'resolved'
    and private.has_any_role(array['student']::public.app_role[])
  );

drop policy if exists absences_read_owner_or_staff on public.absence_periods;
create policy absences_read_owner_or_staff on public.absence_periods
  for select to authenticated
  using (
    (student_id = (select auth.uid()) and private.has_any_role(array['student']::public.app_role[]))
    or private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );

drop policy if exists absences_update_own_future on public.absence_periods;
create policy absences_update_own_future on public.absence_periods
  for update to authenticated
  using (
    student_id = (select auth.uid())
    and starts_on >= (now() at time zone 'Asia/Kolkata')::date
    and private.has_any_role(array['student']::public.app_role[])
  )
  with check (
    student_id = (select auth.uid())
    and starts_on >= (now() at time zone 'Asia/Kolkata')::date
    and private.has_any_role(array['student']::public.app_role[])
  );

drop policy if exists absences_delete_own_future on public.absence_periods;
create policy absences_delete_own_future on public.absence_periods
  for delete to authenticated
  using (
    student_id = (select auth.uid())
    and starts_on >= (now() at time zone 'Asia/Kolkata')::date
    and private.has_any_role(array['student']::public.app_role[])
  );
