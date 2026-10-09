grant usage on schema public to service_role;
grant select, insert, update, delete
  on public.profiles, public.rooms, public.room_members, public.photos
  to service_role;
