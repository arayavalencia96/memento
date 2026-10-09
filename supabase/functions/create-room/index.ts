import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });

const hashCode = async (code: string, pepper: string): Promise<string> => {
  const value = new TextEncoder().encode(`${code}:${pepper}`);
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const createCode = (): string =>
  crypto.getRandomValues(new Uint32Array(1))[0].toString().slice(-6).padStart(6, '0');

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ ok: false, message: 'Método no permitido.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ ok: false, message: 'Unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authorization } },
    },
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, message: 'Unauthorized' }, 401);

  const { name, description = null, photoLimit = 200 } = await request.json().catch(() => ({}));
  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 80) {
    return json({ ok: false, message: 'Invalid room name.' }, 400);
  }
  if (
    (typeof description !== 'string' && description !== null) ||
    (typeof description === 'string' && description.length > 500)
  )
    return json({ ok: false, message: 'Invalid description.' }, 400);
  if (!Number.isInteger(photoLimit) || photoLimit < 1 || photoLimit > 10000) {
    return json({ ok: false, message: 'Invalid photo limit.' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role,enabled')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Admin profile lookup failed', {
      code: profileError.code,
      message: profileError.message,
    });
    return json(
      {
        ok: false,
        code: 'PROFILE_LOOKUP_FAILED',
        message: 'Could not verify account permissions.',
      },
      500,
    );
  }
  if (profile?.role !== 'admin' || !profile.enabled)
    return json({ ok: false, message: 'Forbidden' }, 403);

  const pepper = Deno.env.get('ROOM_CODE_PEPPER');
  if (!pepper) return json({ ok: false, message: 'Server configuration error.' }, 500);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createCode();
    const codeHash = await hashCode(code, pepper);
    const { data, error } = await admin
      .rpc('create_room_with_code', {
        room_name: name.trim(),
        room_description: description,
        room_limit: photoLimit,
        room_hash: codeHash,
        room_creator: user.id,
        room_code: code,
      })
      .select('id, name, description, photo_limit, created_at')
      .single();

    if (!error) {
      const { data: entry } = await admin
        .from('room_codes')
        .select('expires_at')
        .eq('room_id', data.id)
        .single();
      return json(
        { ok: true, result: { room: { ...data, codeExpiresAt: entry?.expires_at }, code } },
        201,
      );
    }
    if (error.code !== '23505') {
      console.error('Room creation failed', { code: error.code });
      return json({ ok: false, message: 'Could not create room. Try again.' }, 500);
    }
  }

  return json({ ok: false, message: 'Could not create room. Try again.' }, 503);
});
