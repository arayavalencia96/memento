begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

insert into auth.users (id, email) values
 ('10000000-0000-0000-0000-000000000001', 'admin@test.local'),
 ('10000000-0000-0000-0000-000000000002', 'member@test.local'),
 ('10000000-0000-0000-0000-000000000003', 'outsider@test.local');
update public.profiles set role = 'admin' where id = '10000000-0000-0000-0000-000000000001';
insert into public.rooms (id, name, code_hash, created_by) values
 ('20000000-0000-0000-0000-000000000001', 'Test room', 'test-code-hash', '10000000-0000-0000-0000-000000000001');

select public.submit_user_request('10000000-0000-0000-0000-000000000002', 'join', '20000000-0000-0000-0000-000000000001');
select public.submit_user_request('10000000-0000-0000-0000-000000000002', 'join', '20000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.user_requests), 1, 'Repeated join requests are idempotent');
select is((select status::text from public.room_members), 'pending', 'Join request does not immediately grant access');
select throws_ok($$select public.decide_user_request((select id from public.user_requests limit 1), '10000000-0000-0000-0000-000000000002', true)$$, 'P0001', 'Acceso denegado.', 'Members cannot approve requests');
select public.decide_user_request((select id from public.user_requests limit 1), '10000000-0000-0000-0000-000000000001', true);
select is((select status::text from public.room_members), 'active', 'Approval activates membership');
select is((select status from public.user_requests limit 1), 'approved', 'Approval persists request history');

select public.submit_user_request('10000000-0000-0000-0000-000000000002', 'leave', '20000000-0000-0000-0000-000000000001');
select is((select status::text from public.room_members), 'active', 'Pending leave does not remove access');
select public.decide_user_request((select id from public.user_requests where kind = 'leave'), '10000000-0000-0000-0000-000000000001', false);
select is((select status::text from public.room_members), 'active', 'Denied leave retains access');
select public.submit_user_request('10000000-0000-0000-0000-000000000002', 'leave', '20000000-0000-0000-0000-000000000001');
select public.decide_user_request((select id from public.user_requests where kind = 'leave' and status = 'pending'), '10000000-0000-0000-0000-000000000001', true);
select is((select status::text from public.room_members), 'revoked', 'Approved leave revokes membership');
select public.admin_set_membership('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', true);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*)::integer from public.rooms), 1, 'Active member sees the room through RLS');
reset role;
update public.profiles set enabled = false where id = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select count(*)::integer from public.rooms), 0, 'Suspended member loses access with an existing identity');
reset role;
update public.profiles set enabled = true where id = '10000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select is((select count(*)::integer from public.rooms), 0, 'An unrelated account cannot list rooms');
select is((select count(*)::integer from public.user_requests), 0, 'An unrelated account cannot list other requests');
reset role;

select throws_ok($$select public.submit_user_request('10000000-0000-0000-0000-000000000001', 'delete_account', null)$$, 'P0001', 'Un administrador no puede solicitar su baja.', 'Admin account cannot request deletion');
select public.submit_user_request('10000000-0000-0000-0000-000000000002', 'delete_account', null);
select public.submit_user_request('10000000-0000-0000-0000-000000000002', 'delete_account', null);
select is((select count(*)::integer from public.user_requests where kind = 'delete_account'), 1, 'Account deletion request is idempotent');
select public.decide_user_request((select id from public.user_requests where kind = 'delete_account'), '10000000-0000-0000-0000-000000000001', true);
select is((select status from public.user_requests where kind = 'delete_account'), 'processing', 'Deletion approval claims the request before Auth deletion');
delete from auth.users where id = '10000000-0000-0000-0000-000000000002';
select is((select status from public.user_requests where kind = 'delete_account'), 'approved', 'Deleting Auth user completes request and cleans membership');

select * from finish();
rollback;
