import { authenticate, cors, failure, readBody, response, validId } from '../_shared/http.ts';
import { flushApprovalEmails } from '../_shared/email.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response({}, 'Método no permitido.', 405);
  try {
    const { client, user, profile } = await authenticate(request);
    if (profile.role !== 'admin') return response({}, 'Acceso denegado.', 403);
    const body = await readBody(request);
    if (body.action === 'flush-emails') {
      const email = await flushApprovalEmails(client);
      return response(
        email,
        email.delivered ? 'Correos procesados.' : 'Hay correos pendientes de envío.',
      );
    }
    if (body.action === 'decide') {
      if (!validId(body.requestId) || typeof body.approve !== 'boolean')
        return response({}, 'Solicitud inválida.', 400);
      const { data: targetUser, error } = await client.rpc('decide_user_request', {
        request_id: body.requestId,
        actor: user.id,
        approve: body.approve,
      });
      if (error)
        return response(
          {},
          'La solicitud no está pendiente o ya no puede resolverse. Actualizá la lista.',
          409,
        );
      if (targetUser) {
        const { error: deleteError } = await client.auth.admin.deleteUser(targetUser);
        if (deleteError) {
          await client
            .from('user_requests')
            .update({ status: 'pending', decided_by: null })
            .eq('id', body.requestId)
            .eq('status', 'processing');
          console.error('Account deletion failed', { code: deleteError.code });
          return response({}, 'No pudimos eliminar la cuenta. La solicitud sigue pendiente.', 500);
        }
      }
      const email = body.approve
        ? await flushApprovalEmails(client)
        : { delivered: true, reason: 'sent' };
      return response(
        { emailPending: !email.delivered, emailDiagnostic: email },
        email.delivered
          ? 'Solicitud resuelta.'
          : 'Solicitud resuelta. El correo quedó pendiente de envío.',
      );
    }
    if (!validId(body.userId)) return response({}, 'Usuario inválido.', 400);
    const { data: target, error: targetError } = await client
      .from('profiles')
      .select('role')
      .eq('id', body.userId)
      .maybeSingle();
    if (targetError) return response({}, 'No pudimos consultar el usuario.', 500);
    if (!target || target.role === 'admin')
      return response({}, 'Sólo se pueden administrar cuentas de usuarios comunes.', 403);
    if (body.action === 'set-enabled') {
      if (typeof body.enabled !== 'boolean') return response({}, 'Estado inválido.', 400);
      const { error } = await client
        .from('profiles')
        .update({ enabled: body.enabled })
        .eq('id', body.userId)
        .eq('role', 'member');
      if (error) return response({}, 'No pudimos actualizar la cuenta.', 500);
      return response({}, body.enabled ? 'Cuenta habilitada.' : 'Cuenta suspendida.');
    }
    if (body.action === 'set-membership') {
      if (
        !validId(body.roomId) ||
        typeof body.status !== 'string' ||
        !['active', 'revoked'].includes(body.status)
      )
        return response({}, 'Acceso inválido.', 400);
      const { error } = await client.rpc('admin_set_membership', {
        actor: user.id,
        target_user: body.userId,
        target_room: body.roomId,
        allow_access: body.status === 'active',
      });
      if (error)
        return response({}, 'No pudimos actualizar el acceso. Verificá el usuario y la sala.', 409);
      const email =
        body.status === 'active'
          ? await flushApprovalEmails(client)
          : { delivered: true, reason: 'sent' };
      return response(
        { emailPending: !email.delivered, emailDiagnostic: email },
        email.delivered
          ? 'Acceso actualizado.'
          : 'Acceso actualizado. El correo quedó pendiente de envío.',
      );
    }
    return response({}, 'Acción inválida.', 400);
  } catch (error) {
    return failure(error);
  }
});
