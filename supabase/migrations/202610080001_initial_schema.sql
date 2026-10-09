create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'member');
create type public.membership_status as enum ('pending', 'active', 'rejected', 'leave_requested', 'revoked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  code_hash text not null unique,
  photo_limit integer not null default 200 check (photo_limit between 1 and 10000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.membership_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  primary key (room_id, user_id)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  cloudinary_public_id text not null unique,
  description text check (char_length(description) <= 1000),
  taken_at date,
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now()
);

create index room_members_user_id_status_idx on public.room_members (user_id, status);
create index photos_room_id_uploaded_at_idx on public.photos (room_id, uploaded_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, email, display_name, avatar_url)
select
  id,
  coalesce(email, ''),
  raw_user_meta_data ->> 'full_name',
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.photos enable row level security;

create policy "Profiles are visible to their owner or admins"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));

create policy "Rooms are visible to active members or admins"
  on public.rooms for select to authenticated
  using (
    (select public.is_admin()) or exists (
      select 1 from public.room_members memberships
      where memberships.room_id = id
        and memberships.user_id = (select auth.uid())
        and memberships.status = 'active'
    )
  );

create policy "Members can see their own membership and admins can manage visibility"
  on public.room_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "Photos are visible to active members or admins"
  on public.photos for select to authenticated
  using (
    (select public.is_admin()) or exists (
      select 1 from public.room_members memberships
      where memberships.room_id = photos.room_id
        and memberships.user_id = (select auth.uid())
        and memberships.status = 'active'
    )
  );

revoke insert, update, delete on public.profiles, public.rooms, public.room_members, public.photos from anon, authenticated;
grant select on public.profiles, public.rooms, public.room_members, public.photos to authenticated;
