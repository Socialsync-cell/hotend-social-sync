import { createHmac, timingSafeEqual, randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

export const random = () => randomBytes(32).toString('hex');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const hmac = (key, value, format = 'hex') => createHmac('sha256', key).update(value).digest(format);
export function equal(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
export function validShop(shop) { return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop || ''); }
export function verifyQuery(params, secret, proxy = false, now = Date.now()) {
  const sig = proxy ? 'signature' : 'hmac';
  if (!secret || params.getAll(sig).length !== 1) return false;
  for (const key of ['shop', 'timestamp', 'code', 'state']) if (params.getAll(key).length > 1) return false;
  const timestamp = Number(params.get('timestamp'));
  if (!timestamp || Math.abs(now / 1000 - timestamp) > 300) return false;
  const keys = [...new Set(params.keys())].filter(k => k !== sig).sort();
  const message = keys.map(k => `${k}=${params.getAll(k).join(',')}`).join(proxy ? '' : '&');
  return equal(hmac(secret, message), params.get(sig));
}
export function encrypt(value, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function decrypt(value, key) {
  const b = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), b.subarray(0, 12));
  cipher.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString());
}
export function signedRequest(value, secret) {
  if (!secret || typeof value !== 'string') throw new Error('Invalid signed request');
  const parts = value.split('.');
  if (parts.length !== 2 || !equal(hmac(secret, parts[1], 'base64url'), parts[0])) throw new Error('Invalid signed request');
  const data = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (data.algorithm !== 'HMAC-SHA256' || !data.user_id) throw new Error('Invalid signed request');
  return data;
}
export function safeURL(value, image = false) {
  try {
    const u = new URL(value);
    const domains = image ? ['fbcdn.net', 'cdninstagram.com', 'fbsbx.com'] : ['instagram.com', 'facebook.com', 'fb.com'];
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && domains.some(d => u.hostname === d || u.hostname.endsWith('.' + d)) ? u.href : '';
  } catch { return ''; }
}
