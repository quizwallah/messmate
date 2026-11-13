-- MessMate initial database schema for Supabase Postgres.
-- Scholar allowlist changes and account linking must be performed by a trusted server.

create schema if not exists private;

create type public.app_role as enum ('student', 'convenor', 'committee', 'admin');
create type public.meal_category as enum ('breakfast', 'lunch', 'snacks', 'dinner');
create type public.diet_choice as enum ('veg', 'non_veg');
create type public.token_offer_type as enum ('meal_choice', 'limited_item');
create type public.complaint_status as enum ('new', 'in_review', 'resolved');

create table public.scholar_allowlist (
  scholar_number text primary key check (scholar_number ~ '^[A-Za-z0-9-]{3,32}$'),
  display_name text,
  is_active boolean not null default true,
  linked_auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  scholar_number text not null unique references public.scholar_allowlist(scholar_number),
  role public.app_role not null default 'student',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  meal_date date not null,
  category public.meal_category not null,
  serving_starts_at time not null,
  serving_ends_at time not null,
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (meal_date, category),
  check (serving_ends_at > serving_starts_at)
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  item_name text not null check (length(trim(item_name)) between 1 and 120),
  diet_choice public.diet_choice,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.token_offerings (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  label text not null check (length(trim(label)) between 1 and 120),
  offer_type public.token_offer_type not null,
  allowed_choices public.diet_choice[] not null default '{}'::public.diet_choice[],
  cooldown_seconds integer not null default 30 check (cooldown_seconds between 1 and 604800),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (offer_type = 'meal_choice' and cardinality(allowed_choices) > 0)
    or (offer_type = 'limited_item' and cardinality(allowed_choices) = 0)
  )
);

create table public.meal_tokens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  offering_id uuid not null references public.token_offerings(id) on delete restrict,
  selected_choice public.diet_choice,
  token_code text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  cooldown_until timestamptz not null,
  check (expires_at > issued_at),
  check (cooldown_until > issued_at)
);

create index meal_tokens_student_cooldown_idx
  on public.meal_tokens (student_id, cooldown_until desc);

create table public.meal_feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 2000),
  created_at timestamptz not null default now(),
  unique (student_id, meal_id)
);

create table public.serious_complaints (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  related_meal_id uuid references public.meals(id) on delete set null,
  subject text not null check (length(trim(subject)) between 1 and 160),
  details text not null check (length(trim(details)) between 1 and 5000),
  status public.complaint_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index serious_complaints_status_created_idx
  on public.serious_complaints (status, created_at desc);

create table public.complaint_notes (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.serious_complaints(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  note text not null check (length(trim(note)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create table public.absence_periods (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null default 'Break / leave',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (student_id, starts_on, ends_on)
);

create index absence_periods_dates_idx on public.absence_periods (starts_on, ends_on);

create or replace function private.has_any_role(p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role = any (p_roles)
  );
$$;

revoke all on function private.has_any_role(public.app_role[]) from public, anon;
grant usage on schema private to anon, authenticated;
grant execute on function private.has_any_role(public.app_role[]) to anon, authenticated;

alter table public.scholar_allowlist enable row level security;
alter table public.profiles enable row level security;
alter table public.meals enable row level security;
alter table public.menu_items enable row level security;
alter table public.token_offerings enable row level security;
alter table public.meal_tokens enable row level security;
alter table public.meal_feedback enable row level security;
alter table public.serious_complaints enable row level security;
alter table public.complaint_notes enable row level security;
alter table public.absence_periods enable row level security;

-- Allowlist is accessible only to trusted server code (service_role); never expose it to the browser.
revoke all on public.scholar_allowlist from anon, authenticated;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.has_any_role(array['admin']::public.app_role[]));

revoke all on public.meals from anon, authenticated;
grant select on public.meals to anon, authenticated;
grant insert, update, delete on public.meals to authenticated;
create policy meals_read_published_or_manager on public.meals
  for select to anon, authenticated
  using (is_published or private.has_any_role(array['convenor', 'admin']::public.app_role[]));
create policy meals_manage_convenor_admin on public.meals
  for all to authenticated
  using (private.has_any_role(array['convenor', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['convenor', 'admin']::public.app_role[]));

revoke all on public.menu_items from anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant insert, update, delete on public.menu_items to authenticated;
create policy menu_items_read_published_or_manager on public.menu_items
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.meals m
      where m.id = meal_id
        and (m.is_published or private.has_any_role(array['convenor', 'admin']::public.app_role[]))
    )
  );
create policy menu_items_manage_convenor_admin on public.menu_items
  for all to authenticated
  using (private.has_any_role(array['convenor', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['convenor', 'admin']::public.app_role[]));

revoke all on public.token_offerings from anon, authenticated;
grant select on public.token_offerings to anon, authenticated;
grant insert, update, delete on public.token_offerings to authenticated;
create policy token_offerings_read_active_or_manager on public.token_offerings
  for select to anon, authenticated
  using (
    (is_active and exists (
      select 1 from public.meals m where m.id = meal_id and m.is_published
    ))
    or private.has_any_role(array['convenor', 'admin']::public.app_role[])
  );
create policy token_offerings_manage_convenor_admin on public.token_offerings
  for all to authenticated
  using (private.has_any_role(array['convenor', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['convenor', 'admin']::public.app_role[]));

revoke all on public.meal_tokens from anon, authenticated;
grant select on public.meal_tokens to authenticated;
create policy meal_tokens_read_own on public.meal_tokens
  for select to authenticated using (student_id = (select auth.uid()));

revoke all on public.meal_feedback from anon, authenticated;
grant select, insert on public.meal_feedback to authenticated;
create policy feedback_read_own_or_convenor on public.meal_feedback
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.has_any_role(array['convenor', 'admin']::public.app_role[])
  );
create policy feedback_insert_own on public.meal_feedback
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and private.has_any_role(array['student']::public.app_role[])
  );

revoke all on public.serious_complaints from anon, authenticated;
grant select, insert, update on public.serious_complaints to authenticated;
create policy complaints_read_owner_or_committee on public.serious_complaints
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.has_any_role(array['committee', 'admin']::public.app_role[])
  );
create policy complaints_insert_own on public.serious_complaints
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and private.has_any_role(array['student']::public.app_role[])
  );
create policy complaints_update_committee on public.serious_complaints
  for update to authenticated
  using (private.has_any_role(array['committee', 'admin']::public.app_role[]))
  with check (private.has_any_role(array['committee', 'admin']::public.app_role[]));

revoke all on public.complaint_notes from anon, authenticated;
grant select, insert on public.complaint_notes to authenticated;
create policy complaint_notes_committee_only on public.complaint_notes
  for select to authenticated
  using (private.has_any_role(array['committee', 'admin']::public.app_role[]));
create policy complaint_notes_insert_committee on public.complaint_notes
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and private.has_any_role(array['committee', 'admin']::public.app_role[])
  );

revoke all on public.absence_periods from anon, authenticated;
grant select, insert, update, delete on public.absence_periods to authenticated;
create policy absences_read_owner_or_staff on public.absence_periods
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.has_any_role(array['convenor', 'admin']::public.app_role[])
  );
create policy absences_insert_own_future on public.absence_periods
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and private.has_any_role(array['student']::public.app_role[])
    and starts_on >= (now() at time zone 'Asia/Kolkata')::date
  );
create policy absences_update_own_future on public.absence_periods
  for update to authenticated
  using (
    student_id = (select auth.uid())
    and starts_on >= (now() at time zone 'Asia/Kolkata')::date
  )
  with check (
    student_id = (select auth.uid())
    and starts_on >= (now() at time zone 'Asia/Kolkata')::date
  );
create policy absences_delete_own_future on public.absence_periods
  for delete to authenticated
  using (
    student_id = (select auth.uid())
    and starts_on >= (now() at time zone 'Asia/Kolkata')::date
  );

-- Atomic token creation: meal-choice tokens share one cooldown, while limited-item tokens
-- use their own cooldown. The display token expires independently after five minutes.
create or replace function public.generate_mess_token(
  p_offering_id uuid,
  p_choice public.diet_choice default null
)
returns public.meal_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_offer public.token_offerings%rowtype;
  v_meal_date date;
  v_published boolean;
  v_starts_at time;
  v_ends_at time;
  v_now timestamptz := now();
  v_local_date date := (now() at time zone 'Asia/Kolkata')::date;
  v_local_time time := (now() at time zone 'Asia/Kolkata')::time;
  v_cooldown timestamptz;
  v_token public.meal_tokens%rowtype;
begin
  if v_student is null or not private.has_any_role(array['student']::public.app_role[]) then
    raise exception 'An active student account is required' using errcode = '42501';
  end if;

  select * into v_offer
  from public.token_offerings o
  where o.id = p_offering_id and o.is_active;

  if not found then
    raise exception 'This token offering is not available';
  end if;

  select m.meal_date, m.is_published, m.serving_starts_at, m.serving_ends_at
    into v_meal_date, v_published, v_starts_at, v_ends_at
  from public.meals m
  where m.id = v_offer.meal_id;

  if not found or not v_published or v_meal_date <> v_local_date then
    raise exception 'Tokens are available only for a published meal today';
  end if;

  if v_local_time < v_starts_at - interval '30 minutes' or v_local_time > v_ends_at then
    raise exception 'Token generation is outside this meal serving window';
  end if;

  if v_offer.offer_type = 'meal_choice' then
    if p_choice is null or not (p_choice = any(v_offer.allowed_choices)) then
      raise exception 'Choose one of the offered meal categories';
    end if;
  elsif p_choice is not null then
    raise exception 'A limited item token does not take a meal category';
  end if;

  -- Serialize concurrent requests for the same student so parallel clicks cannot bypass cooldown.
  perform pg_advisory_xact_lock(hashtext(v_student::text));

  select max(t.cooldown_until) into v_cooldown
  from public.meal_tokens t
  join public.token_offerings previous_offer on previous_offer.id = t.offering_id
  where t.student_id = v_student
    and previous_offer.offer_type = v_offer.offer_type;

  if v_cooldown is not null and v_cooldown > v_now then
    raise exception 'A new token is available after %', v_cooldown using errcode = 'P0001';
  end if;

  insert into public.meal_tokens (
    student_id, offering_id, selected_choice, token_code,
    issued_at, expires_at, cooldown_until
  ) values (
    v_student,
    p_offering_id,
    p_choice,
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    v_now,
    v_now + interval '5 minutes',
    v_now + make_interval(secs => v_offer.cooldown_seconds)
  ) returning * into v_token;

  return v_token;
end;
$$;

revoke all on function public.generate_mess_token(uuid, public.diet_choice) from public, anon;
grant execute on function public.generate_mess_token(uuid, public.diet_choice) to authenticated;

create or replace function public.expected_eater_count(p_start date, p_end date)
returns table (
  mess_date date,
  active_students bigint,
  declared_absences bigint,
  expected_eaters bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_any_role(array['convenor', 'admin']::public.app_role[]) then
    raise exception 'Convenor or admin access is required' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 then
    raise exception 'Choose a valid date range of at most one year';
  end if;

  return query
  select
    d.day::date,
    (select count(*)::bigint from public.profiles p where p.role = 'student' and p.is_active),
    (
      select count(distinct a.student_id)::bigint
      from public.absence_periods a
      join public.profiles p on p.id = a.student_id and p.role = 'student' and p.is_active
      where d.day::date between a.starts_on and a.ends_on
    ),
    greatest(
      0::bigint,
      (select count(*)::bigint from public.profiles p where p.role = 'student' and p.is_active)
      - (
        select count(distinct a.student_id)::bigint
        from public.absence_periods a
        join public.profiles p on p.id = a.student_id and p.role = 'student' and p.is_active
        where d.day::date between a.starts_on and a.ends_on
      )
    )
  from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') as d(day);
end;
$$;

revoke all on function public.expected_eater_count(date, date) from public, anon;
grant execute on function public.expected_eater_count(date, date) to authenticated;
