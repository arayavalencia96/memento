create table public.room_codes (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$')
);
alter table public.room_codes enable row level security;
revoke all on public.room_codes from anon, authenticated;
grant select on public.room_codes to authenticated;
grant select, insert, update, delete on public.room_codes to service_role;
create policy "Only admins can view room codes" on public.room_codes
  for select to authenticated using ((select public.is_admin()));

create function public.create_room_with_code(room_name text, room_description text, room_limit integer, room_creator uuid, room_hash text, room_code text)
returns public.rooms language plpgsql set search_path = public as $$
declare new_room public.rooms;
begin
  insert into public.rooms (name, description, photo_limit, created_by, code_hash)
  values (room_name, room_description, room_limit, room_creator, room_hash)
  returning * into new_room;
  insert into public.room_codes (room_id, code) values (new_room.id, room_code);
  return new_room;
end;
$$;
revoke all on function public.create_room_with_code(text, text, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_room_with_code(text, text, integer, uuid, text, text) to service_role;

create function public.rotate_room_code(target_room uuid, new_hash text, new_code text)
returns void language plpgsql set search_path = public as $$
begin
  update public.rooms set code_hash = new_hash where id = target_room;
  if not found then raise exception 'Room not found'; end if;
  insert into public.room_codes (room_id, code) values (target_room, new_code)
  on conflict (room_id) do update set code = excluded.code;
end;
$$;
revoke all on function public.rotate_room_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.rotate_room_code(uuid, text, text) to service_role;
