import { brevoErrorDetails, sanitizeEmailDiagnostic } from './email-diagnostics.ts';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

Deno.test('Brevo diagnostics retain the reason but redact secrets and personal data', () => {
  const details = brevoErrorDetails(
    {
      code: 'permission_denied',
      message:
        'Sending disabled for guest@example.com; key xkeysib-test-secret; Ana; Our room; https://private.example/room\nContact support.',
      unrelated: 'must not be logged',
    },
    ['xkeysib-test-secret', 'Ana', 'Our room'],
  );
  assert(details.code === 'permission_denied', 'Keep provider code');
  assert(details.message.includes('Sending disabled'), 'Keep reason');
  assert(details.message.includes('Contact support.'), 'Keep remediation');
  for (const sensitive of [
    'guest@example.com',
    'test-secret',
    'Ana',
    'Our room',
    'private.example',
  ])
    assert(!details.message.includes(sensitive), 'Redact sensitive values');
  assert(!details.message.includes('\n'), 'Remove log control characters');
  assert(
    !JSON.stringify(details).includes('must not be logged'),
    'Ignore unrelated response fields',
  );
});

Deno.test('Brevo diagnostics handle absent or malformed provider messages', () => {
  for (const payload of [
    null,
    '<html>error</html>',
    { code: 403 },
    { message: { key: 'secret' } },
  ]) {
    const details = brevoErrorDetails(payload, []);
    assert(details.code === 'unknown', 'Safe code fallback');
    assert(details.message.length > 0, 'Useful fallback message');
  }
});

Deno.test('Email diagnostic redaction happens before truncation', () => {
  const sanitized = sanitizeEmailDiagnostic(
    `Bearer sensitive-token xsmtpsib-secret ${'x'.repeat(1200)}`,
    [],
  );
  assert(sanitized.length === 1000, 'Bound log size');
  assert(!sanitized.includes('sensitive-token'), 'Redact bearer token');
  assert(!sanitized.includes('xsmtpsib-secret'), 'Redact SMTP key');
});
