create or replace function public.submit_user_request(actor uuid, request_kind text, target_room uuid default null)
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
      if member_status = 'active' then return; end if;
      insert into public.room_members (room_id, user_id, status) values (target_room, actor, 'pending')
      on conflict (room_id, user_id) do update set
        status = 'pending', requested_at = now(), decided_at = null, decided_by = null
        where room_members.status <> 'pending';
    elsif member_status is distinct from 'active' then
      raise exception 'No tenés acceso a esta sala.';
    end if;
  else raise exception 'Solicitud inválida.';
  end if;
  insert into public.user_requests (user_id, room_id, kind) values (actor, target_room, request_kind) on conflict do nothing;
end;
$$;

alter table public.user_requests add column activity_at timestamptz
  generated always as (coalesce(decided_at, created_at)) stored;
create index user_requests_user_activity on public.user_requests(user_id, activity_at desc, id desc);

create table public.notification_reads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at timestamptz not null
);
alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from public, anon, authenticated;
grant select on public.notification_reads to authenticated;
grant all on public.notification_reads to service_role;
create policy "Own notification read state" on public.notification_reads for select to authenticated
  using (user_id = (select auth.uid()));

create function public.mark_notifications_read(cutoff timestamptz)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); saved timestamptz;
begin
  if actor is null or not exists(select 1 from public.profiles where id = actor and enabled) then
    raise exception 'Acceso denegado.';
  end if;
  if cutoff is null or cutoff > now() then raise exception 'Fecha inválida.'; end if;
  insert into public.notification_reads(user_id, seen_at) values (actor, cutoff)
    on conflict(user_id) do update set seen_at = greatest(notification_reads.seen_at, excluded.seen_at)
    returning seen_at into saved;
  return saved;
end;
$$;
revoke all on function public.mark_notifications_read(timestamptz) from public, anon;
grant execute on function public.mark_notifications_read(timestamptz) to authenticated;

alter publication supabase_realtime add table public.notification_reads;
