alter table public.room_codes add column expires_at timestamptz not null default (now() + interval '15 minutes');
update public.room_codes set expires_at = now();
create or replace function public.rotate_room_code(target_room uuid, new_hash text, new_code text)
returns void language plpgsql set search_path = public as $$
begin
  update public.rooms set code_hash = new_hash where id = target_room;
  if not found then raise exception 'Room not found'; end if;
  insert into public.room_codes (room_id, code, expires_at) values (target_room, new_code, now() + interval '15 minutes')
  on conflict (room_id) do update set code = excluded.code, expires_at = excluded.expires_at;
end;
$$;

create table public.code_attempts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(), attempts integer not null default 0
);
alter table public.code_attempts enable row level security;
revoke all on public.code_attempts from public, anon, authenticated;
grant all on public.code_attempts to service_role;
create function public.request_join_by_hash(actor uuid, supplied_hash text)
returns void language plpgsql set search_path = public as $$
declare target uuid; attempt_count integer;
begin
  perform 1 from public.profiles where id = actor and enabled for update;
  if not found then raise exception 'Cuenta no disponible.'; end if;
  insert into public.code_attempts(user_id, attempts) values(actor, 1)
  on conflict(user_id) do update set
    attempts = case when code_attempts.started_at < now() - interval '15 minutes' then 1 else code_attempts.attempts + 1 end,
    started_at = case when code_attempts.started_at < now() - interval '15 minutes' then now() else code_attempts.started_at end
  returning attempts into attempt_count;
  if attempt_count > 10 then return; end if;
  select r.id into target from public.rooms r join public.room_codes c on c.room_id = r.id
  where r.code_hash = supplied_hash and c.expires_at > now() for update of r;
  if target is not null then perform public.submit_user_request(actor, 'join', target); end if;
end;
$$;
revoke all on function public.request_join_by_hash(uuid,text) from public, anon, authenticated;
grant execute on function public.request_join_by_hash(uuid,text) to service_role;

alter table public.photos add column people text[] not null default '{}';
alter table public.photos add column location text not null default '' check(char_length(location) <= 120);
alter table public.photos add column format text not null default 'jpg' check(format in ('jpg','jpeg','png','webp'));
alter table public.photos add column bytes integer not null default 0 check(bytes between 0 and 10485760);
alter table public.photos add column state text not null default 'ready' check(state in ('pending','ready','deleting'));
alter table public.photos add constraint photos_people_limit check(cardinality(people) <= 20 and char_length(array_to_string(people,',')) <= 1000);
drop policy "Photos are visible to active members or admins" on public.photos;
create policy "Photos are visible to active members or admins" on public.photos for select to authenticated
using (state = 'ready' and ((select public.is_admin()) or public.is_active_room_member(room_id)));

create function public.reserve_photo(actor uuid, target_room uuid, photo_id uuid, photo_description text, photo_people text[], photo_location text)
returns void language plpgsql set search_path = public as $$
declare capacity integer;
begin
  perform 1 from public.profiles where id = actor and enabled for update;
  if not found then raise exception 'Acceso denegado.'; end if;
  select photo_limit into capacity from public.rooms where id = target_room for update;
  if capacity is null or not (exists(select 1 from public.profiles where id = actor and role = 'admin' and enabled) or exists(select 1 from public.room_members where user_id = actor and room_id = target_room and status = 'active')) then raise exception 'Acceso denegado.'; end if;
  if (select count(*) from public.photos where room_id = target_room) >= capacity then raise exception 'La sala alcanzó su límite de fotos.'; end if;
  insert into public.photos(id, room_id, cloudinary_public_id, uploaded_by, description, people, location, state)
  values(photo_id, target_room, 'memento/' || target_room::text || '/' || photo_id::text, actor, photo_description, photo_people, photo_location, 'pending');
end;
$$;
revoke all on function public.reserve_photo(uuid,uuid,uuid,text,text[],text) from public, anon, authenticated;
grant execute on function public.reserve_photo(uuid,uuid,uuid,text,text[],text) to service_role;

create function public.guard_room_capacity() returns trigger language plpgsql set search_path = public as $$
begin
  if new.photo_limit < (select count(*) from public.photos where room_id = new.id) then raise exception 'El límite es menor que las fotos o cargas reservadas.'; end if;
  return new;
end;
$$;
create trigger guard_room_capacity before update of photo_limit on public.rooms for each row execute function public.guard_room_capacity();
