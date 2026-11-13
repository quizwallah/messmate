-- Extend MessMate with staff roles, student names, public updates and floor complaints.
alter table public.profiles add column if not exists full_name text;

alter table public.meal_feedback alter column meal_id drop not null;
alter table public.meal_feedback add column if not exists meal_date date;
alter table public.meal_feedback add column if not exists meal_label text;
alter table public.meal_feedback drop constraint if exists meal_feedback_student_id_meal_id_key;
alter table public.meal_feedback drop constraint if exists meal_feedback_meal_label_check;
alter table public.meal_feedback add constraint meal_feedback_meal_label_check
  check (meal_label is null or meal_label in ('Breakfast', 'Lunch', 'Snacks', 'Dinner'));
create unique index if not exists meal_feedback_student_day_label_idx
  on public.meal_feedback (student_id, meal_date, meal_label)
  where meal_date is not null and meal_label is not null;
alter table public.serious_complaints add column if not exists related_meal_label text;

create table if not exists public.other_complaints (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  block text not null check (block in ('C', 'D')),
  floor text not null check (floor in ('Ground', 'First', 'Second', 'Third')),
  room_number text not null check (length(trim(room_number)) between 1 and 20),
  category text not null check (length(trim(category)) between 1 and 80),
  details text not null check (length(trim(details)) between 1 and 2000),
  status public.complaint_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists other_complaints_status_created_idx
  on public.other_complaints (status, created_at desc);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 140),
  body text not null check (length(trim(body)) between 1 and 4000),
  author_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  posted_by_name text,
  posted_by_role public.app_role,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists announcements_published_created_idx
  on public.announcements (is_published, created_at desc);

create or replace function private.stamp_announcement_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.full_name, p.role
    into new.posted_by_name, new.posted_by_role
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
    and p.role in ('admin', 'convenor', 'warden');
  if not found then
    raise exception 'An active admin, convenor, or warden account is required'
      using errcode = '42501';
  end if;
  new.author_id := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.stamp_announcement_author() from public, anon, authenticated;
drop trigger if exists announcements_stamp_author on public.announcements;
create trigger announcements_stamp_author
  before insert on public.announcements
  for each row execute function private.stamp_announcement_author();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists other_complaints_touch_updated_at on public.other_complaints;
create trigger other_complaints_touch_updated_at
  before update on public.other_complaints
  for each row execute function private.touch_updated_at();
drop trigger if exists serious_complaints_touch_updated_at on public.serious_complaints;
create trigger serious_complaints_touch_updated_at
  before update on public.serious_complaints
  for each row execute function private.touch_updated_at();
drop trigger if exists announcements_touch_updated_at on public.announcements;
create trigger announcements_touch_updated_at
  before update on public.announcements
  for each row execute function private.touch_updated_at();

alter table public.other_complaints enable row level security;
alter table public.announcements enable row level security;

-- Staff can review students and feedback. Only an admin may administer accounts,
-- through a trusted server endpoint.
drop policy if exists profiles_read_staff on public.profiles;
create policy profiles_read_staff on public.profiles
  for select to authenticated
  using (private.has_any_role(array['admin', 'convenor', 'warden', 'committee']::public.app_role[]));
grant select on public.meal_tokens to authenticated;
drop policy if exists meal_tokens_read_staff on public.meal_tokens;
create policy meal_tokens_read_staff on public.meal_tokens
  for select to authenticated
  using (private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[]));
grant update (full_name) on public.profiles to authenticated;
drop policy if exists profiles_update_own_name on public.profiles;
create policy profiles_update_own_name on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and is_active)
  with check (id = (select auth.uid()) and is_active);

drop policy if exists feedback_read_own_or_convenor on public.meal_feedback;
drop policy if exists feedback_read_own_or_staff on public.meal_feedback;
create policy feedback_read_own_or_staff on public.meal_feedback
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );

drop policy if exists complaints_read_owner_or_committee on public.serious_complaints;
drop policy if exists complaints_read_owner_or_staff on public.serious_complaints;
create policy complaints_read_owner_or_staff on public.serious_complaints
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.has_any_role(array['committee', 'admin']::public.app_role[])
  );
drop policy if exists complaints_update_committee on public.serious_complaints;
drop policy if exists complaints_update_staff_status on public.serious_complaints;
drop policy if exists complaints_resolve_own on public.serious_complaints;
revoke update on public.serious_complaints from authenticated;
grant update (status) on public.serious_complaints to authenticated;
create policy complaints_update_staff_status on public.serious_complaints
  for update to authenticated
  using (private.has_any_role(array['committee', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['committee', 'admin']::public.app_role[]));
create policy complaints_resolve_own on public.serious_complaints
  for update to authenticated
  using (student_id = (select auth.uid()) and status <> 'resolved')
  with check (student_id = (select auth.uid()) and status = 'resolved');

revoke all on public.other_complaints from anon, authenticated;
grant select, insert on public.other_complaints to authenticated;
drop policy if exists other_complaints_read_owner_or_staff on public.other_complaints;
create policy other_complaints_read_owner_or_staff on public.other_complaints
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );
drop policy if exists other_complaints_insert_own on public.other_complaints;
create policy other_complaints_insert_own on public.other_complaints
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and private.has_any_role(array['student']::public.app_role[])
  );
grant update (status) on public.other_complaints to authenticated;
drop policy if exists other_complaints_update_staff_status on public.other_complaints;
create policy other_complaints_update_staff_status on public.other_complaints
  for update to authenticated
  using (private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[]))
  with check (private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[]));
drop policy if exists other_complaints_resolve_own on public.other_complaints;
create policy other_complaints_resolve_own on public.other_complaints
  for update to authenticated
  using (student_id = (select auth.uid()) and status <> 'resolved')
  with check (student_id = (select auth.uid()) and status = 'resolved');

revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to anon, authenticated;
grant insert (title, body, is_published) on public.announcements to authenticated;
grant update (title, body, is_published) on public.announcements to authenticated;
grant delete on public.announcements to authenticated;
drop policy if exists announcements_read_published_or_staff on public.announcements;
create policy announcements_read_published_or_staff on public.announcements
  for select to anon, authenticated
  using (
    is_published
    or private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );
drop policy if exists announcements_insert_staff on public.announcements;
create policy announcements_insert_staff on public.announcements
  for insert to authenticated
  with check (
    private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );
drop policy if exists announcements_update_staff on public.announcements;
create policy announcements_update_staff on public.announcements
  for update to authenticated
  using (private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[]))
  with check (private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[]));
drop policy if exists announcements_delete_admin on public.announcements;
create policy announcements_delete_admin on public.announcements
  for delete to authenticated
  using (private.has_any_role(array['admin']::public.app_role[]));

-- Warden role may review time-away declarations.
drop policy if exists absences_read_owner_or_staff on public.absence_periods;
create policy absences_read_owner_or_staff on public.absence_periods
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );
