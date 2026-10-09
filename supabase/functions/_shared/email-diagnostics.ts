export interface BrevoErrorDetails {
  code: string;
  message: string;
}

export function sanitizeEmailDiagnostic(value: string, sensitiveValues: readonly string[]): string {
  let sanitized = value;
  for (const secret of sensitiveValues.filter(Boolean).sort((a, b) => b.length - a.length))
    sanitized = sanitized.split(secret).join('[REDACTED]');
  return sanitized
    .replace(/\b(?:xkeysib-|xsmtpsib-)[a-z0-9_-]+/gi, '[REDACTED_KEY]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/https?:\/\/[^\s<>"']+/gi, '[REDACTED_URL]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, 1000);
}

export function brevoErrorDetails(
  payload: unknown,
  sensitiveValues: readonly string[],
): BrevoErrorDetails {
  if (!payload || typeof payload !== 'object')
    return { code: 'unknown', message: 'Brevo returned a non-JSON or empty error response.' };
  const code =
    'code' in payload && typeof payload.code === 'string' && /^[a-z_]{1,80}$/i.test(payload.code)
      ? payload.code
      : 'unknown';
  const message =
    'message' in payload && typeof payload.message === 'string'
      ? sanitizeEmailDiagnostic(payload.message, sensitiveValues)
      : 'Brevo returned no error message.';
  return { code, message };
}
