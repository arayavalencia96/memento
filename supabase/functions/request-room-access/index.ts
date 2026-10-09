import { authenticate, cors, failure, readBody, response } from '../_shared/http.ts';
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response({}, 'Método no permitido.', 405);
  try {
    const { client, user } = await authenticate(request);
    const { code } = await readBody(request);
    const pepper = Deno.env.get('ROOM_CODE_PEPPER');
    if (!pepper) throw new Error('MISSING_PEPPER');
    const value = typeof code === 'string' && /^\d{6}$/.test(code) ? code : 'invalid';
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${value}:${pepper}`),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const { error } = await client.rpc('request_join_by_hash', {
      actor: user.id,
      supplied_hash: hash,
    });
    if (error) throw new Error('REQUEST_JOIN_FAILED');
    return response(
      {},
      'No tenés acceso a esta sala. Si el código es válido, el administrador recibirá tu solicitud.',
      202,
    );
  } catch (error) {
    return failure(error);
  }
});
