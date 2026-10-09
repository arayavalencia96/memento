import { createClient } from 'npm:@supabase/supabase-js@2';
import { destroyMedia } from '../_shared/cloudinary.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return reply({ message: 'Method not allowed' }, 405);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return reply({ message: 'Unauthorized' }, 401);
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  if (authError || !user) return reply({ message: 'Unauthorized' }, 401);
  const { data: profile, error: roleError } = await admin
    .from('profiles')
    .select('role,enabled')
    .eq('id', user.id)
    .maybeSingle();
  if (roleError) return reply({ message: 'No pudimos verificar los permisos.' }, 500);
  if (profile?.role !== 'admin' || !profile.enabled) return reply({ message: 'Forbidden' }, 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.roomId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.roomId))
    return reply({ message: 'Sala inválida.' }, 400);
  const { data: room, error: roomError } = await admin
    .from('rooms')
    .select('id,deleting')
    .eq('id', body.roomId)
    .maybeSingle();
  if (roomError) return reply({ message: 'No pudimos consultar la sala.' }, 500);
  if (!room)
    return body.action === 'delete'
      ? reply({ ok: true, result: { complete: true, remaining: 0 } })
      : reply({ message: 'Sala no disponible.' }, 404);
  if (room.deleting && body.action !== 'delete')
    return reply(
      {
        message:
          'La sala está en proceso de eliminación. Reintentá eliminarla para completar la limpieza.',
      },
      409,
    );

  if (body.action === 'update') {
    if (
      typeof body.name !== 'string' ||
      !body.name.trim() ||
      body.name.trim().length > 80 ||
      typeof body.description !== 'string' ||
      body.description.length > 500 ||
      !Number.isInteger(body.photoLimit) ||
      body.photoLimit < 1 ||
      body.photoLimit > 10000
    )
      return reply({ message: 'Datos inválidos.' }, 400);
    const { count, error: countError } = await admin
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', body.roomId);
    if (countError) return reply({ message: 'No pudimos verificar las fotos.' }, 500);
    if ((count ?? 0) > body.photoLimit)
      return reply(
        { message: 'El límite no puede ser menor que la cantidad de fotos actuales.' },
        409,
      );
    const { error } = await admin
      .from('rooms')
      .update({
        name: body.name.trim(),
        description: body.description.trim(),
        photo_limit: body.photoLimit,
      })
      .eq('id', body.roomId);
    return error ? reply({ message: 'No pudimos editar la sala.' }, 500) : reply({ ok: true });
  }
  if (body.action === 'delete') {
    if (body.backupConfirmed !== true)
      return reply(
        { message: 'Confirmá que guardaste una copia o que elegís eliminar sin ella.' },
        400,
      );
    const { error: beginError } = await admin.rpc('begin_room_deletion', {
      actor: user.id,
      target_room: body.roomId,
    });
    if (beginError)
      return reply(
        {
          message: beginError.message.includes('cargas recientes')
            ? 'Hay cargas recientes pendientes. Esperá a que terminen; las incompletas se pueden limpiar después de una hora.'
            : 'No pudimos iniciar la eliminación.',
        },
        409,
      );
    const { data: photos, error: photosError } = await admin
      .from('photos')
      .select('id,cloudinary_public_id')
      .eq('room_id', body.roomId)
      .order('id')
      .limit(5);
    if (photosError)
      return reply({ message: 'No pudimos consultar las fotos. Reintentá la eliminación.' }, 500);
    try {
      for (const photo of photos ?? []) {
        await destroyMedia(photo.cloudinary_public_id);
        const { error } = await admin
          .from('photos')
          .delete()
          .eq('id', photo.id)
          .eq('room_id', body.roomId);
        if (error) throw new Error('PHOTO_RECORD_DELETE_FAILED');
      }
    } catch {
      console.error('Room deletion pending retry', { roomId: body.roomId });
      return reply(
        {
          message:
            'La eliminación quedó incompleta. Se conservaron los registros pendientes. Reintentá eliminar esta sala.',
        },
        502,
      );
    }
    const { count, error: countError } = await admin
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', body.roomId);
    if (countError) return reply({ message: 'No pudimos verificar las fotos.' }, 500);
    if (count) return reply({ ok: true, result: { complete: false, remaining: count } });
    const { error } = await admin.from('rooms').delete().eq('id', body.roomId);
    return error
      ? reply(
          { message: 'No pudimos eliminar la sala. Reintentá para completar la limpieza.' },
          500,
        )
      : reply({ ok: true, result: { complete: true, remaining: 0 } });
  }
  if (body.action === 'rotate-code') {
    const pepper = Deno.env.get('ROOM_CODE_PEPPER');
    if (!pepper) return reply({ message: 'Falta configurar ROOM_CODE_PEPPER.' }, 500);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = crypto
        .getRandomValues(new Uint32Array(1))[0]
        .toString()
        .slice(-6)
        .padStart(6, '0');
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${code}:${pepper}`),
      );
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      const { error } = await admin.rpc('rotate_room_code', {
        target_room: body.roomId,
        new_hash: hash,
        new_code: code,
      });
      if (!error) return reply({ ok: true, code });
      if (error.code !== '23505') break;
    }
    return reply({ message: 'No pudimos generar el código.' }, 500);
  }
  return reply({ message: 'Acción inválida.' }, 400);
});
