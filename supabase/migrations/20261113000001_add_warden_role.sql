-- Add the distinct warden role before policies begin referencing it.
alter type public.app_role add value if not exists 'warden';
