-- Store the approved student roster and record only verified student sign-ins.
alter table public.scholar_allowlist
  add column if not exists branch text check (branch is null or length(trim(branch)) between 1 and 120);

alter table public.profiles
  add column if not exists branch text check (branch is null or length(trim(branch)) between 1 and 120),
  add column if not exists verified_email text,
  add column if not exists first_login_at timestamptz;

grant update (full_name, branch) on public.profiles to authenticated;

create or replace function public.record_student_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_confirmed_at timestamptz;
  v_scholar_number text;
begin
  if v_user_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select lower(u.email), u.email_confirmed_at
    into v_email, v_confirmed_at
  from auth.users u
  where u.id = v_user_id;

  if v_email is null or v_confirmed_at is null then
    raise exception 'College email must be verified' using errcode = '42501';
  end if;

  select p.scholar_number
    into v_scholar_number
  from public.profiles p
  where p.id = v_user_id and p.is_active and p.role = 'student';

  if v_scholar_number is null or v_email <> (lower(v_scholar_number) || '@stu.manit.ac.in') then
    raise exception 'This account is not an active verified student' using errcode = '42501';
  end if;

  update public.profiles
  set verified_email = v_email,
      first_login_at = coalesce(first_login_at, now())
  where id = v_user_id and role = 'student' and is_active;
end;
$$;

revoke all on function public.record_student_login() from public, anon;
grant execute on function public.record_student_login() to authenticated;

-- Reject direct Supabase Auth signups unless the exact institutional email
-- belongs to an active approved student. Auth calls this before inserting a user.
create or replace function public.hook_validate_approved_student_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(event->'user'->>'email', '')));
  v_scholar_number text;
  v_is_active boolean;
begin
  if v_email !~ '^[a-z0-9-]{3,32}@stu\.manit\.ac\.in$' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Only approved Block C&D students can create an account.'
    ));
  end if;

  v_scholar_number := split_part(v_email, '@', 1);
  select s.is_active into v_is_active
  from public.scholar_allowlist s
  where upper(s.scholar_number) = upper(v_scholar_number);

  if coalesce(v_is_active, false) is not true then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'This scholar number is not on the active approved roster.'
    ));
  end if;

  return '{}'::jsonb;
end;
$$;

revoke all on function public.hook_validate_approved_student_signup(jsonb) from public, anon, authenticated;
grant execute on function public.hook_validate_approved_student_signup(jsonb) to supabase_auth_admin;
