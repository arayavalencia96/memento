import { serviceClient } from './http.ts';
import { brevoErrorDetails, sanitizeEmailDiagnostic } from './email-diagnostics.ts';
const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export interface ApprovalEmail {
  id: string;
  user_id: string;
  room_id: string;
  recipient: string;
  display_name: string;
  room_name: string;
  attempts: number;
}
export function approvalHtml(email: ApprovalEmail, appUrl: string): string {
  const name = escapeHtml(email.display_name.trim().split(/\s+/)[0] || 'Invitado');
  const room = escapeHtml(email.room_name);
  const url = escapeHtml(`${appUrl.replace(/\/$/, '')}/rooms/${email.room_id}`);
  const logoUrl = escapeHtml(`${appUrl.replace(/\/$/, '')}/email-logo.png`);
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f0fb;font-family:Arial,sans-serif;color:#332b48"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:24px" cellpadding="0" cellspacing="0"><tr><td style="padding:40px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px"><img src="${logoUrl}" width="40" height="40" alt="" style="display:block;border:0" /></td><td style="font-size:24px;font-weight:bold;color:#332b48">MEMENTO<span style="color:#edaa9b">.</span></td></tr></table><p style="color:#8a68ba;font-size:12px;letter-spacing:2px;margin-top:36px">UN NUEVO LUGAR PARA TUS RECUERDOS</p><h1 style="font-size:28px;line-height:1.3">¡Hola, ${name}!</h1><p style="font-size:16px;line-height:1.8;color:#736582">Ya tenés acceso a la sala <strong style="color:#332b48">${room}</strong>. Te esperan momentos especiales para mirar, compartir y seguir guardando juntos.</p><table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0"><tr><td bgcolor="#8a68ba" style="border-radius:14px"><a href="${url}" style="display:inline-block;padding:16px 26px;color:white;text-decoration:none;font-weight:bold">Entrar a MEMENTO →</a></td></tr></table><p style="font-size:13px;line-height:1.7;color:#998ba5">Tu acceso es personal: iniciá sesión con la cuenta de Google que recibió este correo.</p><p style="padding-top:24px;border-top:1px solid #eee5f5;color:#998ba5;font-size:12px">Los momentos pasan. Los recuerdos quedan.<br />Con cariño, MEMENTO.</p></td></tr></table></td></tr></table></body></html>`;
}
export interface EmailReport {
  delivered: boolean;
  reason:
    | 'sent'
    | 'missing_configuration'
    | 'invalid_app_url'
    | 'queue_error'
    | 'brevo_error'
    | 'send_error'
    | 'pending_retry';
  missingVariables?: string[];
  providerStatus?: number;
  providerCode?: string;
}
export async function flushApprovalEmails(
  client: ReturnType<typeof serviceClient>,
): Promise<EmailReport> {
  try {
    return await sendPendingEmails(client);
  } catch {
    console.error('Email processing deferred');
    return { delivered: false, reason: 'send_error' };
  }
}
async function sendPendingEmails(client: ReturnType<typeof serviceClient>): Promise<EmailReport> {
  const key = Deno.env.get('BREVO_API_KEY');
  const sender = Deno.env.get('BREVO_SENDER_EMAIL');
  const rawUrl = Deno.env.get('APP_URL');
  if (!key || !sender || !rawUrl) {
    const missingVariables = [
      !key ? 'BREVO_API_KEY' : '',
      !sender ? 'BREVO_SENDER_EMAIL' : '',
      !rawUrl ? 'APP_URL' : '',
    ].filter(Boolean);
    console.error('Approval email configuration missing', { missingVariables });
    return { delivered: false, reason: 'missing_configuration', missingVariables };
  }
  let appUrl: URL;
  try {
    appUrl = new URL(rawUrl);
  } catch {
    return { delivered: false, reason: 'invalid_app_url' };
  }
  if (
    appUrl.protocol !== 'https:' &&
    !(appUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(appUrl.hostname))
  )
    return { delivered: false, reason: 'invalid_app_url' };
  const { data, error } = await client.rpc('claim_access_emails', { batch_size: 3 });
  if (error) {
    console.error('Email claim failed', { code: error.code });
    return { delivered: false, reason: 'queue_error' };
  }
  let report: EmailReport = { delivered: true, reason: 'sent' };
  for (const email of (data ?? []) as ApprovalEmail[]) {
    let failure: EmailReport | undefined;
    const startedAt = performance.now();
    const sensitiveValues = [
      key,
      sender,
      email.recipient,
      email.display_name,
      email.room_name,
      rawUrl,
    ];
    let stage = 'access_check';
    try {
      const { data: member, error: memberError } = await client
        .from('room_members')
        .select('status')
        .eq('room_id', email.room_id)
        .eq('user_id', email.user_id)
        .maybeSingle();
      const { data: user, error: userError } = await client
        .from('profiles')
        .select('enabled')
        .eq('id', email.user_id)
        .maybeSingle();
      if (memberError || userError) throw new Error('EMAIL_ACCESS_CHECK_FAILED');
      if (member?.status !== 'active' || !user?.enabled) {
        await client.from('email_outbox').delete().eq('id', email.id);
        continue;
      }
      stage = 'brevo_request';
      const result = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: 'MEMENTO', email: sender },
          to: [{ email: email.recipient, name: email.display_name }],
          subject: `Ya podés entrar a «${email.room_name}» · MEMENTO`,
          htmlContent: approvalHtml(email, appUrl.origin),
          textContent: `Hola, ${email.display_name.trim().split(/\s+/)[0]}. Ya tenés acceso a «${email.room_name}». Entrá a ${appUrl.origin}/rooms/${email.room_id} con tu cuenta de Google.`,
          headers: { idempotencyKey: email.id },
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!result.ok) {
        const payload: unknown = await result.json().catch(() => null);
        const details = brevoErrorDetails(payload, sensitiveValues);
        failure = {
          delivered: false,
          reason: 'brevo_error',
          providerStatus: result.status,
          providerCode: details.code,
        };
        console.error('Brevo rejected approval email', {
          id: email.id,
          attempt: email.attempts,
          endpoint: 'POST /v3/smtp/email',
          status: result.status,
          code: details.code,
          providerMessage: details.message,
          providerRequestId: sanitizeEmailDiagnostic(
            result.headers.get('x-request-id') ?? result.headers.get('request-id') ?? 'unavailable',
            sensitiveValues,
          ),
          durationMs: Math.round(performance.now() - startedAt),
        });
        throw new Error(`BREVO_${result.status}`);
      }
      stage = 'mark_sent';
      const { error: markError } = await client
        .from('email_outbox')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null,
          last_http_status: null,
        })
        .eq('id', email.id);
      if (markError) throw new Error('EMAIL_MARK_FAILED');
    } catch (error) {
      report = failure ?? { delivered: false, reason: 'send_error' };
      console.error('Approval email pending retry', {
        id: email.id,
        attempt: email.attempts,
        stage,
        durationMs: Math.round(performance.now() - startedAt),
        code:
          error instanceof Error
            ? sanitizeEmailDiagnostic(error.message, sensitiveValues)
            : 'UNKNOWN',
      });
      await client
        .from('email_outbox')
        .update({
          status: 'pending',
          last_error:
            report.reason === 'brevo_error'
              ? `BREVO_${report.providerStatus}_${report.providerCode}`
              : 'SEND_ERROR',
          last_http_status: report.providerStatus ?? null,
          available_at: new Date(
            Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(email.attempts, 6)),
          ).toISOString(),
        })
        .eq('id', email.id);
    }
  }
  const { count, error: countError } = await client
    .from('email_outbox')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'sent');
  if (countError) return { delivered: false, reason: 'queue_error' };
  if (report.delivered && count) return { delivered: false, reason: 'pending_retry' };
  return report;
}
