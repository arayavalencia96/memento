alter table public.rooms add column deleting boolean not null default false;

create function public.begin_room_deletion(actor uuid, target_room uuid)
returns void language plpgsql set search_path = public as $$
begin
  if not exists(select 1 from public.profiles where id=actor and role='admin' and enabled) then
    raise exception 'Acceso denegado.';
  end if;
  perform 1 from public.rooms where id=target_room for update;
  if not found then return; end if;
  if exists(select 1 from public.photos where room_id=target_room and state='pending'
    and uploaded_at > now()-interval '1 hour') then
    raise exception 'Hay cargas recientes pendientes. Esperá a que terminen antes de eliminar la sala.';
  end if;
  update public.rooms set deleting=true where id=target_room;
end;
$$;
revoke all on function public.begin_room_deletion(uuid,uuid) from public, anon, authenticated;
grant execute on function public.begin_room_deletion(uuid,uuid) to service_role;

create function public.guard_deleting_room_photo()
returns trigger language plpgsql set search_path=public as $$
declare blocked boolean;
begin
  select deleting into blocked from public.rooms where id=new.room_id for update;
  if blocked then raise exception 'La sala está en proceso de eliminación.'; end if;
  return new;
end;
$$;
create trigger guard_deleting_room_photo before insert or update of room_id, state on public.photos
  for each row execute function public.guard_deleting_room_photo();

create function public.guard_room_delete()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from public.photos where room_id=old.id) then
    raise exception 'Primero se deben eliminar los archivos de las fotos.';
  end if;
  return old;
end;
$$;
create trigger guard_room_delete before delete on public.rooms
  for each row execute function public.guard_room_delete();
