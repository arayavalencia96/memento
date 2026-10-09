import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;`);
for (const file of (await readdir('supabase/migrations')).sort()) {
  const sql = (await readFile(`supabase/migrations/${file}`, 'utf8')).replace(
    'create extension if not exists pgcrypto;',
    '',
  );
  await db.exec(sql);
  console.log(`Migration OK: ${file}`);
}
const admin = '10000000-0000-0000-0000-000000000001';
const guest = '10000000-0000-0000-0000-000000000002';
const outsider = '10000000-0000-0000-0000-000000000003';
await db.query(
  `insert into auth.users(id,email,raw_user_meta_data) values ($1,'admin@example.com','{"full_name":"Admin"}'),($2,'guest@example.com','{"full_name":"Ana María"}'),($3,'outsider@example.com','{}')`,
  [admin, guest, outsider],
);
await db.query(`update public.profiles set role='admin' where id=$1`, [admin]);
const result = await db.query(
  `select (public.create_room_with_code('Familia','Recuerdos',1,$1,'hash-1','012345')).id`,
  [admin],
);
const room = result.rows[0].id;
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
await db.query(`select public.request_join_by_hash($1,'hash-1')`, [guest]);
assert.equal(await scalar(`select count(*)::int from public.user_requests`), 1);
await db.query(`select public.request_join_by_hash($1,'hash-1')`, [guest]);
assert.equal(await scalar(`select count(*)::int from public.user_requests`), 1);
await db.query(
  `update public.room_codes set expires_at=now()-interval '1 minute' where room_id=$1`,
  [room],
);
await db.query(`select public.request_join_by_hash($1,'hash-1')`, [outsider]);
assert.equal(
  await scalar(`select count(*)::int from public.user_requests where user_id=$1`, [outsider]),
  0,
);
await db.query(`select public.rotate_room_code($1,'hash-2','654321')`, [room]);
assert.equal(
  await scalar(
    `select expires_at > now()+interval '14 minutes' from public.room_codes where room_id=$1`,
    [room],
  ),
  true,
);
const requestId = await scalar(`select id from public.user_requests where user_id=$1`, [guest]);
await assert.rejects(db.query(`select public.decide_user_request($1,$2,true)`, [requestId, guest]));
await db.query(`select public.decide_user_request($1,$2,true)`, [requestId, admin]);
assert.equal(await scalar(`select count(*)::int from public.email_outbox`), 1);
await db.query(`select public.admin_set_membership($1,$2,$3,true)`, [admin, guest, room]);
assert.equal(await scalar(`select count(*)::int from public.email_outbox`), 1);
const photo = '20000000-0000-0000-0000-000000000001';
await db.query(`select public.submit_user_request($1,'leave',$2)`, [guest, room]);
const leaveId = await scalar(
  `select id from public.user_requests where user_id=$1 and kind='leave' and status='pending'`,
  [guest],
);
await db.query(`select public.decide_user_request($1,$2,true)`, [leaveId, admin]);
await db.query(`select public.request_join_by_hash($1,'hash-2')`, [guest]);
assert.equal(
  await scalar(`select status from public.room_members where room_id=$1 and user_id=$2`, [
    room,
    guest,
  ]),
  'pending',
);
const rejoinId = await scalar(
  `select id from public.user_requests where user_id=$1 and kind='join' and status='pending'`,
  [guest],
);
assert.notEqual(rejoinId, requestId);
await db.query(`select public.request_join_by_hash($1,'hash-2')`, [guest]);
assert.equal(
  await scalar(
    `select count(*)::int from public.user_requests where user_id=$1 and kind='join' and status='pending'`,
    [guest],
  ),
  1,
);
await db.query(`select public.decide_user_request($1,$2,false)`, [rejoinId, admin]);
await db.query(`select public.request_join_by_hash($1,'hash-2')`, [guest]);
const retryId = await scalar(
  `select id from public.user_requests where user_id=$1 and kind='join' and status='pending'`,
  [guest],
);
assert.notEqual(retryId, rejoinId);
await db.query(`select public.decide_user_request($1,$2,true)`, [retryId, admin]);
assert.equal(await scalar(`select count(*)::int from public.email_outbox`), 2);
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [guest]);
await db.exec('set role authenticated');
await db.query(`select public.mark_notifications_read(now())`);
assert.equal(await scalar(`select count(*)::int from public.notification_reads`), 1);
await assert.rejects(db.query(`select public.mark_notifications_read(now()+interval '1 day')`));
await db.exec('reset role');
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [outsider]);
await db.exec('set role authenticated');
assert.equal(await scalar(`select count(*)::int from public.notification_reads`), 0);
await assert.rejects(db.query(`update public.notification_reads set seen_at=now()`));
await db.exec('reset role');
await db.query(
  `select public.reserve_photo($1,$2,$3,'Un recuerdo',array['Ana','Luna'],'Mendoza')`,
  [guest, room, photo],
);
await assert.rejects(
  db.query(`select public.reserve_photo($1,$2,gen_random_uuid(),'','{}','')`, [guest, room]),
  /límite/,
);
await assert.rejects(
  db.query(`select public.reserve_photo($1,$2,gen_random_uuid(),'','{}','')`, [outsider, room]),
  /Acceso/,
);
await db.query(`update public.photos set state='ready' where id=$1`, [photo]);
async function visibleAs(userId) {
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return {
      rooms: await scalar('select count(*)::int from public.rooms'),
      photos: await scalar('select count(*)::int from public.photos'),
      codes: await scalar('select count(*)::int from public.room_codes'),
    };
  } finally {
    await db.exec('reset role');
  }
}
assert.deepEqual(await visibleAs(guest), { rooms: 1, photos: 1, codes: 0 });
assert.deepEqual(await visibleAs(outsider), { rooms: 0, photos: 0, codes: 0 });
assert.deepEqual(await visibleAs(admin), { rooms: 1, photos: 1, codes: 1 });
await db.query(`update public.profiles set enabled=false where id=$1`, [guest]);
assert.deepEqual(await visibleAs(guest), { rooms: 0, photos: 0, codes: 0 });
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [outsider]);
await db.exec('set role authenticated');
await assert.rejects(db.query(`update public.profiles set role='admin' where id=$1`, [outsider]));
await assert.rejects(
  db.query(`select public.reserve_photo($1,$2,gen_random_uuid(),'','{}','')`, [outsider, room]),
);
await db.exec('reset role');
await db.query(`delete from auth.users where id=$1`, [guest]);
assert.equal(
  await scalar(`select uploaded_by is null from public.photos where id=$1`, [photo]),
  true,
);
assert.equal(await scalar(`select count(*)::int from public.email_outbox`), 0);
const deleteRoom = await scalar(
  `select (public.create_room_with_code('Borrar','',10,$1,'hash-delete','111111')).id`,
  [admin],
);
const deletePhoto = '20000000-0000-0000-0000-000000000002';
await db.query(`select public.reserve_photo($1,$2,$3,'','{}','')`, [
  admin,
  deleteRoom,
  deletePhoto,
]);
await assert.rejects(
  db.query(`select public.begin_room_deletion($1,$2)`, [outsider, deleteRoom]),
  /Acceso/,
);
await assert.rejects(
  db.query(`select public.begin_room_deletion($1,$2)`, [admin, deleteRoom]),
  /cargas recientes/,
);
assert.equal(await scalar(`select deleting from public.rooms where id=$1`, [deleteRoom]), false);
await db.query(`update public.photos set state='ready' where id=$1`, [deletePhoto]);
await assert.rejects(db.query(`delete from public.rooms where id=$1`, [deleteRoom]), /archivos/);
await db.query(`select public.begin_room_deletion($1,$2)`, [admin, deleteRoom]);
assert.equal(await scalar(`select deleting from public.rooms where id=$1`, [deleteRoom]), true);
await assert.rejects(
  db.query(`select public.reserve_photo($1,$2,gen_random_uuid(),'','{}','')`, [admin, deleteRoom]),
  /eliminación/,
);
await db.query(`delete from public.photos where id=$1`, [deletePhoto]);
await db.query(`delete from public.rooms where id=$1`, [deleteRoom]);
assert.equal(await scalar(`select count(*)::int from public.rooms where id=$1`, [deleteRoom]), 0);
await db.close();
console.log(
  'Database checks passed: migrations, expiry, quota, RLS, admin-only writes, email queue and anonymization.',
);
