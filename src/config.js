import { resolve } from 'node:path';

export function config(env = process.env) {
  const demo = env.DEMO_MODE === 'true';
  const c = {
    demo, port: Number(env.PORT || 3000), host: env.HOST || (demo ? '127.0.0.1' : '0.0.0.0'),
    origin: (env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
    shop: env.SHOP_DOMAIN || (demo ? 'demo.myshopify.com' : ''),
    shopKey: env.SHOPIFY_API_KEY || '', shopSecret: env.SHOPIFY_API_SECRET || '',
    encryptionKey: env.ENCRYPTION_KEY || '', metaId: env.META_APP_ID || '', metaSecret: env.META_APP_SECRET || '',
    metaLoginConfigId: env.META_LOGIN_CONFIG_ID || '',
    metaVersion: env.META_API_VERSION || 'v24.0', dataDir: resolve(env.DATA_DIR || (demo ? './data/demo' : './data/live')),
    syncMinutes: Math.max(5, Number(env.SYNC_MINUTES || 15)), support: env.SUPPORT_EMAIL || '',
  };
  if (!/^v\d+\.0$/.test(c.metaVersion) || !Number.isFinite(c.syncMinutes)) throw new Error('Invalid API version or sync interval');
  if (demo && (env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost', '::1'].includes(c.host))) throw new Error('Demo must run locally, outside production');
  if (!demo) {
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(c.shop)) throw new Error('Set SHOP_DOMAIN to your myshopify.com domain');
    if (new URL(c.origin).protocol !== 'https:') throw new Error('APP_URL must use HTTPS');
    if (!c.shopKey || !c.shopSecret || !/^[a-f0-9]{64}$/i.test(c.encryptionKey) || !c.support) throw new Error('Set Shopify credentials, ENCRYPTION_KEY and SUPPORT_EMAIL');
  }
  return c;
}
