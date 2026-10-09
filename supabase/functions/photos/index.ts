import { authenticate, cors, failure, readBody, response, validId } from '../_shared/http.ts';
import { destroyMedia, mediaUrl, uploadMedia } from '../_shared/cloudinary.ts';

function metadata(
  body: Record<string, unknown>,
): { description: string; people: string[]; location: string } | null {
  const { description = '', people = [], location = '' } = body;
  if (
    typeof description !== 'string' ||
    description.length > 1000 ||
    typeof location !== 'string' ||
    location.length > 120 ||
    !Array.isArray(people) ||
    people.length > 20 ||
    !people.every(
      (name: unknown) => typeof name === 'string' && name.trim().length > 0 && name.length <= 80,
    ) ||
    people.join(',').length > 1000
  )
    return null;
  return {
    description: description.trim(),
    people: people.map((name: string) => name.trim()),
    location: location.trim(),
  };
}
async function validImage(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return (
    (file.type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (file.type === 'image/png' &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) ||
    (file.type === 'image/webp' &&
      new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP')
  );
}
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response({}, 'Método no permitido.', 405);
  try {
    const { client, user, profile } = await authenticate(request);
    const multipart = request.headers.get('content-type')?.includes('multipart/form-data');
    if (Number(request.headers.get('content-length')) > 11000000)
      return response({}, 'La foto no puede superar los 10 MB.', 413);
    const form = multipart ? await request.formData() : null;
    const body = form ? Object.fromEntries(form.entries()) : await readBody(request);
    const roomId = body.roomId;
    if (!validId(roomId)) return response({}, 'No tenés acceso a esta sala.', 403);
    const { data: room, error: roomError } = await client
      .from('rooms')
      .select('id,name,description,photo_limit,deleting')
      .eq('id', roomId)
      .maybeSingle();
    if (roomError) throw new Error('ROOM_LOOKUP_FAILED');
    if (!room) return response({}, 'No tenés acceso a esta sala.', 403);
    if (room.deleting) return response({}, 'La sala está en proceso de eliminación.', 409);
    if (profile.role !== 'admin') {
      const { data: membership, error } = await client
        .from('room_members')
        .select('status')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw new Error('MEMBERSHIP_LOOKUP_FAILED');
      if (membership?.status !== 'active') return response({}, 'No tenés acceso a esta sala.', 403);
    }
    if (body.action === 'list') {
      const page =
        typeof body.page === 'number' && Number.isInteger(body.page) && body.page >= 0
          ? body.page
          : 0;
      const { data, error } = await client
        .from('photos')
        .select(
          'id,description,people,location,uploaded_by,uploaded_at,cloudinary_public_id,format',
        )
        .eq('room_id', roomId)
        .eq('state', 'ready')
        .order('uploaded_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * 40, page * 40 + 39);
      if (error) throw new Error('PHOTOS_LOOKUP_FAILED');
      const ids = [
        ...new Set(
          (data ?? [])
            .map((photo) => photo.uploaded_by)
            .filter((id): id is string => typeof id === 'string'),
        ),
      ];
      const authors = ids.length
        ? await client.from('profiles').select('id,display_name').in('id', ids)
        : { data: [], error: null };
      if (authors.error) throw new Error('AUTHOR_LOOKUP_FAILED');
      const incomplete =
        profile.role === 'admin'
          ? await client
              .from('photos')
              .select('id,uploaded_at')
              .eq('room_id', roomId)
              .eq('state', 'pending')
              .lt('uploaded_at', new Date(Date.now() - 3600000).toISOString())
              .order('uploaded_at')
              .limit(40)
          : { data: [], error: null };
      if (incomplete.error) throw new Error('INCOMPLETE_LOOKUP_FAILED');
      return response(
        {
          room,
          incomplete: (incomplete.data ?? []).map((item) => ({
            id: item.id,
            uploadedAt: item.uploaded_at,
          })),
          photos: (data ?? []).map((photo) => ({
            id: photo.id,
            description: photo.description ?? '',
            people: photo.people,
            location: photo.location,
            uploadedBy: photo.uploaded_by,
            uploadedAt: photo.uploaded_at,
            authorName:
              authors.data?.find((author) => author.id === photo.uploaded_by)?.display_name ||
              'Usuario',
            url: mediaUrl(photo.cloudinary_public_id, photo.format),
            canEdit: profile.role === 'admin' || photo.uploaded_by === user.id,
          })),
          hasMore: (data ?? []).length === 40,
        },
        'Álbum cargado.',
      );
    }
    if (body.action === 'upload' && form) {
      const file = form.get('file');
      const rawPeople: unknown = JSON.parse(String(form.get('people') ?? '[]'));
      const meta = metadata({
        description: form.get('description') ?? '',
        location: form.get('location') ?? '',
        people: rawPeople,
      });
      if (
        !(file instanceof File) ||
        !file.size ||
        file.size > 10485760 ||
        !meta ||
        !(await validImage(file))
      )
        return response(
          {},
          'Elegí una foto JPG, PNG o WebP de hasta 10 MB y revisá sus datos.',
          400,
        );
      const id = crypto.randomUUID();
      const publicId = `memento/${roomId}/${id}`;
      const { error: reserveError } = await client.rpc('reserve_photo', {
        actor: user.id,
        target_room: roomId,
        photo_id: id,
        photo_description: meta.description,
        photo_people: meta.people,
        photo_location: meta.location,
      });
      if (reserveError)
        return response(
          {},
          reserveError.message.includes('límite')
            ? 'La sala alcanzó su límite de fotos.'
            : 'No pudimos reservar espacio para la foto.',
          409,
        );
      try {
        const media = await uploadMedia(file, publicId);
        const { error } = await client
          .from('photos')
          .update({ ...media, state: 'ready' })
          .eq('id', id)
          .eq('state', 'pending');
        if (error) throw new Error('PHOTO_SAVE_FAILED');
        return response({ id }, 'Foto subida.', 201);
      } catch (error) {
        // La reserva se conserva ante una respuesta incierta para no liberar cuota con un archivo huérfano.
        console.error('Photo upload pending cleanup', {
          photoId: id,
          code: error instanceof Error ? error.message : 'UNKNOWN',
        });
        return response(
          {},
          'No pudimos completar la carga. El espacio quedó reservado para revisión del administrador.',
          502,
        );
      }
    }
    if (!validId(body.photoId)) return response({}, 'Foto no disponible.', 404);
    const { data: photo, error: photoError } = await client
      .from('photos')
      .select('id,uploaded_by,cloudinary_public_id,format,state,uploaded_at')
      .eq('id', body.photoId)
      .eq('room_id', roomId)
      .maybeSingle();
    if (photoError) throw new Error('PHOTO_LOOKUP_FAILED');
    if (!photo) return response({}, 'Foto no disponible.', 404);
    if (body.action === 'cleanup') {
      if (
        profile.role !== 'admin' ||
        photo.state !== 'pending' ||
        Date.parse(photo.uploaded_at) > Date.now() - 3600000
      )
        return response({}, 'Esta carga todavía no se puede limpiar.', 409);
      await destroyMedia(photo.cloudinary_public_id);
      const { error } = await client
        .from('photos')
        .delete()
        .eq('id', photo.id)
        .eq('state', 'pending');
      if (error) throw new Error('CLEANUP_FAILED');
      return response({}, 'Carga incompleta eliminada. Espacio liberado.');
    }
    if (photo.state !== 'ready') return response({}, 'Foto no disponible.', 404);
    if (body.action === 'backup-download') {
      const media = await fetch(mediaUrl(photo.cloudinary_public_id, photo.format, true), {
        signal: AbortSignal.timeout(60000),
      });
      if (!media.ok || !media.body)
        return response({}, 'No pudimos descargar la foto para la copia.', 502);
      return new Response(media.body, {
        headers: {
          ...cors,
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-store',
        },
      });
    }
    if (body.action === 'download' || body.action === 'view')
      return response(
        { url: mediaUrl(photo.cloudinary_public_id, photo.format, body.action === 'download') },
        'Enlace temporal generado.',
      );
    if (profile.role !== 'admin' && photo.uploaded_by !== user.id)
      return response({}, 'Solo el autor o un administrador puede modificar esta foto.', 403);
    if (body.action === 'edit') {
      const meta = metadata(body);
      if (!meta) return response({}, 'Datos inválidos.', 400);
      const { error } = await client
        .from('photos')
        .update(meta)
        .eq('id', photo.id)
        .eq('state', 'ready');
      if (error) throw new Error('PHOTO_UPDATE_FAILED');
      return response({}, 'Foto actualizada.');
    }
    if (body.action === 'delete') {
      await destroyMedia(photo.cloudinary_public_id);
      const { error } = await client.from('photos').delete().eq('id', photo.id);
      if (error) throw new Error('PHOTO_DELETE_FAILED');
      return response({}, 'Foto eliminada.');
    }
    return response({}, 'Acción inválida.', 400);
  } catch (error) {
    return failure(error);
  }
});
