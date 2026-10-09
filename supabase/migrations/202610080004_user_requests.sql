alter table public.profiles add column enabled boolean not null default true;
alter table public.photos alter column uploaded_by drop not null;
alter table public.photos drop constraint photos_uploaded_by_fkey;
alter table public.photos add constraint photos_uploaded_by_fkey foreign key (uploaded_by) references public.profiles(id) on delete set null;
alter table public.rooms alter column created_by drop not null;
alter table public.rooms drop constraint rooms_created_by_fkey;
alter table public.rooms add constraint rooms_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.room_members drop constraint room_members_decided_by_fkey;
alter table public.room_members add constraint room_members_decided_by_fkey foreign key (decided_by) references public.profiles(id) on delete set null;

create table public.user_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  kind text not null check (kind in ('join', 'leave', 'delete_account')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null
);
create unique index user_requests_one_open on public.user_requests (user_id, kind, coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status in ('pending', 'processing');
create index user_requests_status_date on public.user_requests (status, created_at desc);
alter table public.user_requests enable row level security;
revoke all on public.user_requests from anon, authenticated;
grant select on public.user_requests to authenticated;
grant select, insert, update, delete on public.user_requests to service_role;
create policy "Requests visible to owner and admin" on public.user_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

insert into public.user_requests (user_id, room_id, kind, created_at)
select user_id, room_id, 'join', requested_at from public.room_members where status = 'pending';
insert into public.user_requests (user_id, room_id, kind, created_at)
select user_id, room_id, 'leave', requested_at from public.room_members where status = 'leave_requested';
update public.room_members set status = 'active' where status = 'leave_requested';

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and enabled);
$$;

create function public.is_active_room_member(target_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_members m join public.profiles p on p.id = m.user_id
    where m.room_id = target_room and m.user_id = auth.uid() and m.status = 'active' and p.enabled
  );
$$;
revoke all on function public.is_active_room_member(uuid) from public, anon;
grant execute on function public.is_active_room_member(uuid) to authenticated;
drop policy "Rooms are visible to active members or admins" on public.rooms;
create policy "Rooms are visible to active members or admins" on public.rooms for select to authenticated
  using ((select public.is_admin()) or public.is_active_room_member(id));
drop policy "Photos are visible to active members or admins" on public.photos;
create policy "Photos are visible to active members or admins" on public.photos for select to authenticated
  using ((select public.is_admin()) or public.is_active_room_member(room_id));

create function public.submit_user_request(actor uuid, request_kind text, target_room uuid default null)
returns void language plpgsql set search_path = public as $$
declare member_status public.membership_status;
begin
  perform 1 from public.profiles where id = actor and enabled for update;
  if not found then raise exception 'Cuenta no disponible.'; end if;
  if exists(select 1 from public.user_requests where user_id = actor and kind = 'delete_account' and status = 'processing') then raise exception 'La cuenta está siendo eliminada.'; end if;
  if request_kind = 'delete_account' then
    if exists(select 1 from public.profiles where id = actor and role = 'admin') then raise exception 'Un administrador no puede solicitar su baja.'; end if;
    target_room := null;
  elsif request_kind in ('join', 'leave') then
    perform 1 from public.rooms where id = target_room for update;
    if not found then return; end if;
    select status into member_status from public.room_members where room_id = target_room and user_id = actor;
    if request_kind = 'join' then
      if member_status in ('active', 'rejected', 'revoked') then return; end if;
      insert into public.room_members (room_id, user_id, status) values (target_room, actor, 'pending') on conflict do nothing;
    elsif member_status is distinct from 'active' then
      raise exception 'No tenés acceso a esta sala.';
    end if;
  else raise exception 'Solicitud inválida.';
  end if;
  insert into public.user_requests (user_id, room_id, kind) values (actor, target_room, request_kind) on conflict do nothing;
end;
$$;
revoke all on function public.submit_user_request(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_user_request(uuid, text, uuid) to service_role;

create function public.decide_user_request(request_id uuid, actor uuid, approve boolean)
returns uuid language plpgsql set search_path = public as $$
declare req public.user_requests;
begin
  if not exists(select 1 from public.profiles where id = actor and role = 'admin' and enabled) then raise exception 'Acceso denegado.'; end if;
  select * into req from public.user_requests where id = request_id for update;
  if not found then raise exception 'La solicitud ya fue resuelta o no existe.'; end if;
  if req.kind = 'delete_account' and req.status = 'processing' and approve then return req.user_id; end if;
  if req.status <> 'pending' then raise exception 'La solicitud ya fue resuelta o no existe.'; end if;
  if req.user_id is null then raise exception 'La cuenta ya no existe.'; end if;
  if approve and req.kind in ('join', 'leave') and req.room_id is null then raise exception 'La sala ya no existe.'; end if;
  if req.kind = 'delete_account' and approve then
    if exists(select 1 from public.profiles where id = req.user_id and role = 'admin') then raise exception 'No se puede eliminar un administrador.'; end if;
    update public.user_requests set status = 'processing', decided_by = actor where id = req.id;
    return req.user_id;
  end if;
  if req.kind = 'join' then
    update public.room_members set status = case when approve then 'active'::public.membership_status else 'rejected'::public.membership_status end, decided_at = now(), decided_by = actor where room_id = req.room_id and user_id = req.user_id;
  elsif req.kind = 'leave' and approve then
    update public.room_members set status = 'revoked', decided_at = now(), decided_by = actor where room_id = req.room_id and user_id = req.user_id;
  end if;
  update public.user_requests set status = case when approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = actor where id = req.id;
  return null;
end;
$$;
revoke all on function public.decide_user_request(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.decide_user_request(uuid, uuid, boolean) to service_role;

create function public.finish_account_requests() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.user_requests set status = 'approved', decided_at = now() where user_id = old.id and kind = 'delete_account' and status = 'processing';
  update public.user_requests set status = 'rejected', decided_at = now() where user_id = old.id and status = 'pending';
  return old;
end;
$$;
create trigger finish_account_requests before delete on public.profiles for each row execute function public.finish_account_requests();

create function public.admin_set_membership(actor uuid, target_user uuid, target_room uuid, allow_access boolean)
returns void language plpgsql set search_path = public as $$
begin
  if not exists(select 1 from public.profiles where id = actor and role = 'admin' and enabled) then raise exception 'Acceso denegado.'; end if;
  perform 1 from public.profiles where id = target_user and role = 'member' for update;
  if not found then raise exception 'Usuario no disponible.'; end if;
  perform 1 from public.rooms where id = target_room for update;
  if not found then raise exception 'Sala no disponible.'; end if;
  insert into public.room_members (room_id, user_id, status, decided_at, decided_by)
  values (target_room, target_user, case when allow_access then 'active'::public.membership_status else 'revoked'::public.membership_status end, now(), actor)
  on conflict (room_id, user_id) do update set status = excluded.status, decided_at = now(), decided_by = actor;
  update public.user_requests set status = case when (kind = 'join' and allow_access) or (kind = 'leave' and not allow_access) then 'approved' else 'rejected' end,
    decided_at = now(), decided_by = actor
    where user_id = target_user and room_id = target_room and status = 'pending' and kind in ('join', 'leave');
end;
$$;
revoke all on function public.admin_set_membership(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_membership(uuid, uuid, uuid, boolean) to service_role;
