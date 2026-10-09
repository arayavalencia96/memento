import { authenticate, cors, failure, readBody, response, validId } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response({}, 'Método no permitido.', 405);
  try {
    const { client, user, profile } = await authenticate(request);
    const body = await readBody(request);
    if (typeof body.kind !== 'string' || !['leave', 'delete_account'].includes(body.kind))
      return response({}, 'Solicitud inválida.', 400);
    if (body.kind === 'delete_account' && profile.role === 'admin')
      return response({}, 'Un administrador no puede solicitar su baja.', 403);
    if (body.kind === 'leave' && !validId(body.roomId))
      return response({}, 'No tenés acceso a esta sala.', 403);
    const { error } = await client.rpc('submit_user_request', {
      actor: user.id,
      request_kind: body.kind,
      target_room: body.kind === 'leave' ? body.roomId : null,
    });
    if (error)
      return response({}, 'No pudimos enviar la solicitud. Actualizá y verificá tu acceso.', 409);
    return response({}, 'Solicitud enviada al administrador.', 202);
  } catch (error) {
    return failure(error);
  }
});
