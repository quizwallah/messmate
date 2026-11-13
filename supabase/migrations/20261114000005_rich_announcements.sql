-- Rich public announcements: image/audio attachments and student polls.
alter table public.announcements
  add column if not exists image_path text,
  add column if not exists audio_path text,
  add column if not exists poll_question text,
  add column if not exists poll_options jsonb not null default '[]'::jsonb,
  add column if not exists poll_allows_multiple boolean not null default false;

alter table public.announcements
  drop constraint if exists announcements_poll_options_check,
  add constraint announcements_poll_options_check
    check (jsonb_typeof(poll_options) = 'array' and jsonb_array_length(poll_options) <= 6),
  drop constraint if exists announcements_poll_question_check,
  add constraint announcements_poll_question_check
    check (poll_question is null or length(trim(poll_question)) between 1 and 240);

grant insert (title, body, is_published, image_path, audio_path, poll_question, poll_options, poll_allows_multiple)
  on public.announcements to authenticated;
grant update (title, body, is_published, image_path, audio_path, poll_question, poll_options, poll_allows_multiple)
  on public.announcements to authenticated;

create table if not exists public.announcement_poll_votes (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  selected_options text[] not null check (cardinality(selected_options) between 1 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (announcement_id, student_id)
);
alter table public.announcement_poll_votes enable row level security;
revoke all on public.announcement_poll_votes from anon, authenticated;
grant select, insert on public.announcement_poll_votes to authenticated;
grant update (selected_options, updated_at) on public.announcement_poll_votes to authenticated;

drop policy if exists announcement_poll_votes_read_own on public.announcement_poll_votes;
create policy announcement_poll_votes_read_own on public.announcement_poll_votes
  for select to authenticated
  using (student_id = (select auth.uid()) and private.has_any_role(array['student']::public.app_role[]));
drop policy if exists announcement_poll_votes_insert_own on public.announcement_poll_votes;
create policy announcement_poll_votes_insert_own on public.announcement_poll_votes
  for insert to authenticated
  with check (student_id = (select auth.uid()) and private.has_any_role(array['student']::public.app_role[]));
drop policy if exists announcement_poll_votes_update_own on public.announcement_poll_votes;
create policy announcement_poll_votes_update_own on public.announcement_poll_votes
  for update to authenticated
  using (student_id = (select auth.uid()) and private.has_any_role(array['student']::public.app_role[]))
  with check (student_id = (select auth.uid()) and private.has_any_role(array['student']::public.app_role[]));

create or replace function private.validate_announcement_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_options jsonb;
  v_allows_multiple boolean;
  v_published boolean;
  v_question text;
  v_valid_options text[];
begin
  select a.poll_options, a.poll_allows_multiple, a.is_published, a.poll_question
    into v_options, v_allows_multiple, v_published, v_question
  from public.announcements a
  where a.id = new.announcement_id;
  if not found or not v_published or v_question is null then
    raise exception 'This poll is not available';
  end if;
  select array_agg(option_text) into v_valid_options
  from jsonb_array_elements_text(v_options) as item(option_text);
  if new.student_id <> (select auth.uid())
     or cardinality(new.selected_options) < 1
     or (not v_allows_multiple and cardinality(new.selected_options) > 1)
     or not (new.selected_options <@ coalesce(v_valid_options, array[]::text[])) then
    raise exception 'Choose valid options for this poll' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.validate_announcement_poll_vote() from public, anon, authenticated;
drop trigger if exists announcement_poll_votes_validate on public.announcement_poll_votes;
create trigger announcement_poll_votes_validate
  before insert or update on public.announcement_poll_votes
  for each row execute function private.validate_announcement_poll_vote();

create or replace function public.get_announcement_poll_results(p_announcement_id uuid)
returns table (option_label text, vote_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select option_row.value, count(v.student_id)::bigint
  from public.announcements a
  cross join lateral jsonb_array_elements_text(a.poll_options) with ordinality as option_row(value, position)
  left join public.announcement_poll_votes v
    on v.announcement_id = a.id and option_row.value = any(v.selected_options)
  where a.id = p_announcement_id and a.is_published and a.poll_question is not null
  group by option_row.value, option_row.position
  order by option_row.position;
$$;
revoke all on function public.get_announcement_poll_results(uuid) from public;
grant execute on function public.get_announcement_poll_results(uuid) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-media',
  'announcement-media',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists announcement_media_public_read on storage.objects;
create policy announcement_media_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'announcement-media');
drop policy if exists announcement_media_staff_insert on storage.objects;
create policy announcement_media_staff_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'announcement-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );
drop policy if exists announcement_media_staff_update on storage.objects;
create policy announcement_media_staff_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'announcement-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  )
  with check (
    bucket_id = 'announcement-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );
drop policy if exists announcement_media_staff_delete on storage.objects;
create policy announcement_media_staff_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'announcement-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.has_any_role(array['admin', 'convenor', 'warden']::public.app_role[])
  );
