-- Persist global cooldown settings and create today's offerings on demand.
-- Token timers must be enforced by Postgres, not by browser-local state.

create table if not exists public.token_cooldown_settings (
  singleton boolean primary key default true check (singleton),
  meal_choice_seconds integer not null default 30 check (meal_choice_seconds between 1 and 604800),
  limited_item_seconds integer not null default 30 check (limited_item_seconds between 1 and 604800),
  updated_at timestamptz not null default now()
);

insert into public.token_cooldown_settings (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.token_cooldown_settings enable row level security;
revoke all on public.token_cooldown_settings from public, anon, authenticated;
grant all on public.token_cooldown_settings to service_role;

create unique index if not exists token_offerings_meal_type_label_uidx
  on public.token_offerings (meal_id, offer_type, label);

create or replace function public.ensure_today_token_offerings()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_meal_id uuid;
begin
  insert into public.meals (
    meal_date, category, serving_starts_at, serving_ends_at, is_published
  ) values (
    v_today, 'dinner', '19:30'::time, '21:30'::time, true
  )
  on conflict (meal_date, category) do nothing
  returning id into v_meal_id;

  if v_meal_id is null then
    select m.id into v_meal_id
    from public.meals m
    where m.meal_date = v_today and m.category = 'dinner';
  end if;

  insert into public.token_offerings (
    meal_id, label, offer_type, allowed_choices, cooldown_seconds, is_active
  ) values
    (v_meal_id, 'Dinner', 'meal_choice', array['veg', 'non_veg']::public.diet_choice[], 30, true),
    (v_meal_id, 'Gulab jamun', 'limited_item', '{}'::public.diet_choice[], 30, true),
    (v_meal_id, 'Other', 'limited_item', '{}'::public.diet_choice[], 30, true)
  on conflict (meal_id, offer_type, label) do nothing;

  return v_meal_id;
end;
$$;

revoke all on function public.ensure_today_token_offerings() from public, anon, authenticated;
grant execute on function public.ensure_today_token_offerings() to service_role;

-- Create a first-login profile and link its approved roster row atomically.
create or replace function public.link_approved_student(p_scholar_number text, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.scholar_allowlist%rowtype;
begin
  select * into v_student
  from public.scholar_allowlist s
  where s.scholar_number = p_scholar_number
    and s.is_active
    and s.linked_auth_user_id is null
  for update;

  if not found then
    raise exception 'The approved student record is no longer available';
  end if;

  insert into public.profiles (
    id, scholar_number, full_name, branch, role, is_active
  ) values (
    p_user_id, v_student.scholar_number, v_student.display_name,
    v_student.branch, 'student', true
  );

  update public.scholar_allowlist
  set linked_auth_user_id = p_user_id
  where scholar_number = v_student.scholar_number
    and is_active
    and linked_auth_user_id is null;

  if not found then
    raise exception 'The approved student record could not be linked';
  end if;

  return true;
end;
$$;

revoke all on function public.link_approved_student(text, uuid) from public, anon, authenticated;
grant execute on function public.link_approved_student(text, uuid) to service_role;

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
  v_cooldown_seconds integer;
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

  perform pg_advisory_xact_lock(hashtext(v_student::text));

  select max(t.cooldown_until) into v_cooldown
  from public.meal_tokens t
  join public.token_offerings previous_offer on previous_offer.id = t.offering_id
  where t.student_id = v_student
    and previous_offer.offer_type = v_offer.offer_type;

  if v_cooldown is not null and v_cooldown > v_now then
    raise exception 'A new token is available after %', v_cooldown using errcode = 'P0001';
  end if;

  select case
    when v_offer.offer_type = 'meal_choice' then settings.meal_choice_seconds
    else settings.limited_item_seconds
  end into v_cooldown_seconds
  from public.token_cooldown_settings settings
  where settings.singleton = true;

  if v_cooldown_seconds is null then
    v_cooldown_seconds := v_offer.cooldown_seconds;
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
    v_now + make_interval(secs => v_cooldown_seconds)
  ) returning * into v_token;

  return v_token;
end;
$$;

revoke all on function public.generate_mess_token(uuid, public.diet_choice) from public, anon;
grant execute on function public.generate_mess_token(uuid, public.diet_choice) to authenticated;
