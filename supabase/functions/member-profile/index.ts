import { authenticate, cors, failure, readBody, response } from '../_shared/http.ts';
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response({}, 'Método no permitido.', 405);
  try {
    const { client, user } = await authenticate(request);
    const body = await readBody(request);
    if (
      typeof body.displayName !== 'string' ||
      !body.displayName.trim() ||
      body.displayName.trim().length > 80
    )
      return response({}, 'Nombre inválido.', 400);
    const { error } = await client
      .from('profiles')
      .update({ display_name: body.displayName.trim() })
      .eq('id', user.id);
    if (error) throw new Error('PROFILE_UPDATE_FAILED');
    return response({}, 'Perfil actualizado.');
  } catch (error) {
    return failure(error);
  }
});
