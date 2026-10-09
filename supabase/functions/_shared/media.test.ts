import { mediaUrl } from './cloudinary.ts';
import { approvalHtml, ApprovalEmail } from './email.ts';
function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}
Deno.test('media links are authenticated, signed and expire in five minutes', () => {
  Deno.env.set('CLOUDINARY_CLOUD_NAME', 'test-cloud');
  Deno.env.set('CLOUDINARY_API_KEY', 'test-key');
  Deno.env.set('CLOUDINARY_API_SECRET', 'test-secret');
  const url = new URL(mediaUrl('memento/room/photo', 'jpg'));
  assert(url.hostname === 'api.cloudinary.com', 'Use private download API');
  assert(url.searchParams.get('type') === 'authenticated', 'Require authenticated media');
  assert(
    Number(url.searchParams.get('expires_at')) >= Math.floor(Date.now() / 1000) + 299,
    'Five-minute expiry',
  );
  assert(Boolean(url.searchParams.get('signature')), 'Signed URL');
  assert(!url.toString().includes('test-secret'), 'Do not disclose secret');
  assert(
    new URL(mediaUrl('memento/room/photo', 'jpg', true)).searchParams.get('attachment') === 'true',
    'Attachment download',
  );
});
Deno.test('approval emails greet by first name and escape user-controlled content', () => {
  const email: ApprovalEmail = {
    id: 'event',
    user_id: 'user',
    room_id: 'room',
    recipient: 'guest@example.com',
    display_name: 'Ana María',
    room_name: '<script>alert(1)</script>',
    attempts: 0,
  };
  const html = approvalHtml(email, 'https://memento.example.com');
  assert(html.includes('¡Hola, Ana!'), 'First name greeting');
  assert(!html.includes('<script>'), 'Escape room name');
  assert(html.includes('&lt;script&gt;'), 'Retain escaped name');
  assert(html.includes('https://memento.example.com/rooms/room'), 'Correct room CTA');
  assert(html.includes('MEMENTO<span'), 'Uppercase brand');
  assert(html.includes('src="https://memento.example.com/email-logo.png"'), 'Public PNG logo');
  assert(!html.includes('favicon.svg'), 'Avoid SVG in email clients');
});
