-- Set both token types to a three-hour default and allow generation any time today.
alter table public.token_cooldown_settings
  alter column meal_choice_seconds set default 10800,
  alter column limited_item_seconds set default 10800;

update public.token_cooldown_settings
set meal_choice_seconds = 10800,
    limited_item_seconds = 10800,
    updated_at = now()
where singleton = true;

update public.token_offerings
set cooldown_seconds = 10800;

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
  v_now timestamptz := now();
  v_local_date date := (now() at time zone 'Asia/Kolkata')::date;
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

  select m.meal_date into v_meal_date
  from public.meals m
  where m.id = v_offer.meal_id;

  if not found or v_meal_date <> v_local_date then
    raise exception 'Token offering is not for today';
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

  select case
    when v_offer.offer_type = 'meal_choice' then settings.meal_choice_seconds
    else settings.limited_item_seconds
  end into v_cooldown_seconds
  from public.token_cooldown_settings settings
  where settings.singleton = true;

  if v_cooldown_seconds is null then
    v_cooldown_seconds := 10800;
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
