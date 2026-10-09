import { v2 as cloudinary } from 'npm:cloudinary@2';
export function mediaClient() {
  const cloud_name = Deno.env.get('CLOUDINARY_CLOUD_NAME');
  const api_key = Deno.env.get('CLOUDINARY_API_KEY');
  const api_secret = Deno.env.get('CLOUDINARY_API_SECRET');
  if (!cloud_name || !api_key || !api_secret) throw new Error('CLOUDINARY_CONFIG_MISSING');
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return { cloudinary, cloud_name, api_key, api_secret };
}
export function mediaUrl(publicId: string, format: string, attachment = false): string {
  const { cloudinary } = mediaClient();
  return cloudinary.utils.private_download_url(publicId, format, {
    type: 'authenticated',
    resource_type: 'image',
    expires_at: Math.floor(Date.now() / 1000) + 300,
    attachment,
  });
}
export async function destroyMedia(publicId: string): Promise<void> {
  const { cloudinary } = mediaClient();
  const result = await cloudinary.uploader.destroy(publicId, {
    type: 'authenticated',
    resource_type: 'image',
    invalidate: true,
  });
  if (!['ok', 'not found'].includes(result.result)) throw new Error('MEDIA_DELETE_FAILED');
}
export async function uploadMedia(
  file: File,
  publicId: string,
): Promise<{ format: string; bytes: number }> {
  const { cloudinary, cloud_name, api_key, api_secret } = mediaClient();
  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    public_id: publicId,
    type: 'authenticated',
    overwrite: false,
  };
  const form = new FormData();
  form.set('file', file);
  form.set('api_key', api_key);
  for (const [key, value] of Object.entries(params)) form.set(key, String(value));
  form.set('signature', cloudinary.utils.api_sign_request(params, api_secret));
  const reply = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud_name)}/image/upload`,
    { method: 'POST', body: form, signal: AbortSignal.timeout(45000) },
  );
  const data: unknown = await reply.json();
  if (
    !reply.ok ||
    !data ||
    typeof data !== 'object' ||
    !('format' in data) ||
    typeof data.format !== 'string' ||
    !['jpg', 'jpeg', 'png', 'webp'].includes(data.format) ||
    !('bytes' in data) ||
    typeof data.bytes !== 'number' ||
    data.bytes > 10485760
  )
    throw new Error('MEDIA_UPLOAD_FAILED');
  return { format: data.format, bytes: data.bytes };
}
