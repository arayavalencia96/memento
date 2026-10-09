alter table public.email_outbox add column last_error text;
alter table public.email_outbox add column last_http_status integer;

do $$
declare target text;
begin
  if not exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach target in array array['user_requests','room_members','profiles'] loop
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target) then
      execute format('alter publication supabase_realtime add table public.%I',target);
    end if;
  end loop;
end;
$$;
