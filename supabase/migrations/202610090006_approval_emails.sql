create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  recipient text not null, display_name text not null, room_name text not null,
  status text not null default 'pending' check(status in ('pending','sending','sent')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  created_at timestamptz not null default now(), sent_at timestamptz
);
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from public, anon, authenticated;
grant all on public.email_outbox to service_role;
create index email_outbox_pending on public.email_outbox(available_at) where status <> 'sent';
create function public.queue_access_email() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.email_outbox(user_id,room_id,recipient,display_name,room_name)
    select p.id,r.id,p.email,coalesce(nullif(p.display_name,''),'Invitado'),r.name
    from public.profiles p,public.rooms r where p.id = new.user_id and r.id = new.room_id and p.enabled;
  end if;
  return new;
end;
$$;
revoke all on function public.queue_access_email() from public, anon, authenticated;
create trigger queue_access_email after insert or update of status on public.room_members for each row execute function public.queue_access_email();
create function public.claim_access_emails(batch_size integer default 5)
returns setof public.email_outbox language sql set search_path = public as $$
  update public.email_outbox set status = 'sending', attempts = attempts + 1, available_at = now() + interval '5 minutes'
  where id in (select id from public.email_outbox where status <> 'sent' and available_at <= now() order by created_at for update skip locked limit least(greatest(batch_size,1),5))
  returning *;
$$;
revoke all on function public.claim_access_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_access_emails(integer) to service_role;
