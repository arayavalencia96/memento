import { createClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
export const response = (result: unknown, message = '', statusCode = 200) =>
  Response.json(
    { result, message, description: message, statusCode, ok: statusCode < 400 },
    { status: statusCode, headers: cors },
  );
export const serviceClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function authenticate(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('UNAUTHORIZED');
  const client = serviceClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error || !user) throw new Error('UNAUTHORIZED');
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role, enabled')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw new Error('PROFILE_ERROR');
  if (!profile?.enabled) throw new Error('DISABLED');
  return { client, user, profile };
}

export function failure(error: unknown): Response {
  const code = error instanceof Error ? error.message : '';
  if (code === 'UNAUTHORIZED') return response({}, 'Iniciá sesión para continuar.', 401);
  if (code === 'DISABLED') return response({}, 'Tu cuenta no tiene acceso a la aplicación.', 403);
  console.error('Request failed', { code });
  return response({}, 'No pudimos procesar la operación.', 500);
}

export const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}
