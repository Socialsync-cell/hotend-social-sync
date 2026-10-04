import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { config as loadConfig } from './config.js';
import { openDB } from './db.js';
import { random, hash, hmac, equal, verifyQuery, encrypt, decrypt, signedRequest } from './security.js';
import { Meta } from './meta.js';
import { synchronizer } from './sync.js';
import { seed } from './seed.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fail = (status, message) => Object.assign(new Error(message), { status });
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function body(req) {
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 65536) throw fail(413, 'Request too large'); parts.push(part); }
  return Buffer.concat(parts);
}
function parseJSON(raw) { try { return JSON.parse(raw.toString()); } catch { throw fail(400, 'Invalid JSON'); } }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('='))); }

export function createApp(c, store = openDB(c.dataDir), fetcher = fetch) {
  const sync = synchronizer(store, c, () => new Meta(c, fetcher));
  if (c.demo) seed(store);
  const cookie = (name, value, age = 28800) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${c.demo ? '' : '; Secure'}`;
  const metaConfigured = () => !!(c.metaId && c.metaSecret);
  const sessionFor = req => {
    const id = cookies(req).social_session;
    return id && store.db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(hash(id), Date.now());
  };
  const connected = () => { const x = store.get('connection'); return x ? decrypt(x, c.encryptionKey) : null; };
  function headers(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://*.fbcdn.net https://*.cdninstagram.com https://*.fbsbx.com; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (!c.demo) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  const redirect = (res, to) => { res.writeHead(302, { Location: to }); res.end(); };
  async function file(res, path, type) { const data = await readFile(join(root, path)); res.writeHead(200, { 'Content-Type': type }); res.end(data); }
  const publicFiles = new Map([
    ['/assets/app.css', ['public/app.css', 'text/css']], ['/assets/app.js', ['public/app.js', 'text/javascript']],
    ['/assets/gallery.js', ['extensions/social-gallery/assets/gallery.js', 'text/javascript']],
    ['/assets/gallery.css', ['extensions/social-gallery/assets/gallery.css', 'text/css']],
    ['/assets/preview.js', ['public/preview.js', 'text/javascript']],
  ]);
  const server = http.createServer(async (req, res) => {
    headers(res);
    try {
      const url = new URL(req.url, c.origin), path = url.pathname, method = req.method;
      if (c.demo && ![`localhost:${c.port}`, `127.0.0.1:${c.port}`].includes(req.headers.host)) throw fail(403, 'Use localhost for the demo');
      if (method === 'GET' && path === '/health') return json(res, { ok: true });
      if (method === 'GET' && publicFiles.has(path)) return await file(res, ...publicFiles.get(path));
      if (c.demo && method === 'GET' && /^\/assets\/demo-(planter|vase|organiser)\.svg$/.test(path)) return await file(res, 'public/' + path.split('/').pop(), 'image/svg+xml');

      if (method === 'GET' && path === '/privacy') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/app.css"><title>Social gallery privacy</title><main class="legal"><h1>Social gallery privacy</h1><p>This store uses Hotend Social Sync to display selected content from connected Facebook and Instagram business accounts.</p><p>The app stores the author name supplied by Meta, post or comment text, media links, original post links, timestamps and display choices. Account access tokens are encrypted on the server. Shopify customer and order records are not requested.</p><p>Published content is visible to website visitors. Images load from Meta’s content servers, which receive the visitor’s IP address. Content unavailable for verification for 48 hours is withheld from the gallery. Stored social content is removed when the account is disconnected, the app is uninstalled, or an authenticated Meta deletion request is received.</p><p>To request removal of a post or ask about data use, contact ${escape(c.support || 'the store owner')} and include the original post link. The store operator can hide content immediately or disconnect to erase the complete social dataset.</p><p>The operator must keep this notice consistent with their actual deployment, backups and data practices.</p></main></html>`);
      }
      if (method === 'GET' && path === '/deletion-status') return json(res, { status: 'Deletion requests are processed immediately when a valid signed Meta request is received. Contact the store for help.' });
      if (method === 'POST' && ['/meta/deauthorize', '/meta/delete'].includes(path)) {
        const raw = await body(req);
        const value = req.headers['content-type']?.includes('application/json') ? parseJSON(raw).signed_request : new URLSearchParams(raw.toString()).get('signed_request');
        let data; try { data = signedRequest(value, c.metaSecret); } catch { throw fail(401, 'Invalid Meta signature'); }
        const current = connected();
        if (current?.userId === String(data.user_id)) store.clearSocial();
        const pending = store.get('metaPending');
        if (pending && decrypt(pending, c.encryptionKey).userId === String(data.user_id)) store.db.prepare("DELETE FROM settings WHERE key='metaPending'").run();
        return json(res, { url: `${c.origin}/deletion-status`, confirmation_code: random() });
      }
      if (method === 'POST' && ['/webhooks/uninstalled', '/webhooks/privacy'].includes(path)) {
        const raw = await body(req);
        if (!c.shopSecret || !equal(hmac(c.shopSecret, raw, 'base64'), req.headers['x-shopify-hmac-sha256']) || req.headers['x-shopify-shop-domain'] !== c.shop) throw fail(401, 'Invalid Shopify signature');
        const topic = req.headers['x-shopify-topic'];
        parseJSON(raw);
        if (path === '/webhooks/uninstalled' && topic !== 'app/uninstalled') throw fail(400, 'Unexpected webhook topic');
        if (path === '/webhooks/privacy' && !['shop/redact', 'customers/redact', 'customers/data_request'].includes(topic)) throw fail(400, 'Unexpected webhook topic');
        if (['app/uninstalled', 'shop/redact'].includes(topic)) {
          store.clearSocial(); store.set('installed', false); store.db.exec('DELETE FROM sessions; DELETE FROM states;');
        }
        return json(res, { ok: true });
      }
      if (method === 'GET' && path === '/proxy/feed') {
        if (c.demo || !verifyQuery(url.searchParams, c.shopSecret, true) || url.searchParams.get('shop') !== c.shop) throw fail(401, 'Invalid storefront signature');
        if (!store.get('installed')) return json(res, { posts: [] });
        return json(res, { posts: store.feed({ platform: url.searchParams.get('platform') || 'all', product: url.searchParams.get('product') || '', limit: Number(url.searchParams.get('limit')) || 12 }) });
      }

      if (method === 'GET' && path === '/auth/shopify') {
        if (c.demo) return redirect(res, '/');
        if (url.searchParams.get('shop') !== c.shop) throw fail(403, 'This app is configured for a different store');
        const binding = random(), state = store.state('shopify', hash(binding));
        res.setHeader('Set-Cookie', cookie('shopify_nonce', binding, 600));
        const target = new URL(`https://${c.shop}/admin/oauth/authorize`);
        target.search = new URLSearchParams({ client_id: c.shopKey, scope: 'write_app_proxy', redirect_uri: c.origin + '/auth/shopify/callback', state }).toString();
        return redirect(res, target.href);
      }
      if (method === 'GET' && path === '/auth/shopify/callback') {
        const p = url.searchParams, binding = cookies(req).shopify_nonce;
        if (c.demo || p.get('shop') !== c.shop || !verifyQuery(p, c.shopSecret) || !binding || !store.consume(p.get('state'), 'shopify', hash(binding))) throw fail(401, 'Shopify login could not be verified. Please start again.');
        let response;
        try { response = await fetcher(`https://${c.shop}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: c.shopKey, client_secret: c.shopSecret, code: p.get('code') }), signal: AbortSignal.timeout(15000), redirect: 'error' }); }
        catch { throw fail(502, 'Shopify login is temporarily unavailable'); }
        const token = await response.json();
        if (!response.ok || !token.access_token || !token.scope?.split(',').map(s => s.trim()).includes('write_app_proxy')) throw fail(401, 'Shopify did not grant the app proxy permission');
        store.set('installed', true);
        res.setHeader('Set-Cookie', [cookie('social_session', store.session()), cookie('shopify_nonce', '', 0)]);
        return redirect(res, '/');
      }

      let session = sessionFor(req);
      if (c.demo && method === 'GET' && path === '/' && !session) {
        const id = store.session(); res.setHeader('Set-Cookie', cookie('social_session', id));
        session = store.db.prepare('SELECT * FROM sessions WHERE id=?').get(hash(id));
      }
      if (!session && method === 'GET' && (path === '/' || path === '/preview')) return redirect(res, `/auth/shopify?shop=${encodeURIComponent(c.shop)}`);
      if (!session) throw fail(401, 'Your session has expired. Open the app from Shopify again.');
      if (method === 'GET' && path === '/') return await file(res, 'public/index.html', 'text/html; charset=utf-8');
      if (method === 'GET' && path === '/preview') return await file(res, 'public/preview.html', 'text/html; charset=utf-8');

      if (method === 'GET' && path === '/auth/meta/callback') {
        if (!store.consume(url.searchParams.get('state'), 'meta', session.id)) throw fail(401, 'Meta login expired. Please connect again.');
        if (url.searchParams.has('error') || !url.searchParams.get('code')) return redirect(res, '/?notice=meta-cancelled');
        const pending = await new Meta(c, fetcher).authorize(url.searchParams.get('code'), c.origin + '/auth/meta/callback');
        store.set('metaPending', encrypt(pending, c.encryptionKey));
        return redirect(res, '/?notice=choose-page');
      }
      if (method === 'GET' && path === '/api/state') {
        const connection = c.demo ? null : connected();
        const rawPending = store.get('metaPending');
        const pending = rawPending ? decrypt(rawPending, c.encryptionKey) : null;
        if (pending && pending.expires < Date.now()) store.db.prepare("DELETE FROM settings WHERE key='metaPending'").run();
        return json(res, {
          demo: c.demo, shop: c.shop, csrf: session.csrf, configured: metaConfigured(), syncMinutes: c.syncMinutes,
          preferences: store.get('preferences'), syncing: sync.active,
          connection: connection ? { pageName: connection.pageName, igName: connection.igName, connectedAt: connection.connectedAt } : null,
          pages: pending && pending.expires > Date.now() ? pending.pages.map(p => ({ id: p.id, name: p.name, instagram: p.instagram_business_account?.username || '' })) : [],
          posts: store.db.prepare('SELECT * FROM posts ORDER BY created DESC LIMIT 500').all(),
          runs: store.db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 8').all(),
        });
      }
      if (method === 'GET' && path === '/api/preview') return json(res, { posts: store.feed({ demo: c.demo, limit: 24 }) });
      if (!path.startsWith('/api/') || !['POST', 'PATCH', 'DELETE'].includes(method)) throw fail(404, 'Not found');
      if (req.headers.origin !== c.origin || !equal(req.headers['x-csrf-token'], session.csrf)) throw fail(403, 'Request could not be verified. Refresh the app and try again.');
      if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'Use JSON');
      const data = parseJSON(await body(req));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(400, 'Expected an object');
      if (method === 'POST' && path === '/api/logout') {
        store.db.prepare('DELETE FROM sessions WHERE id=?').run(session.id);
        res.setHeader('Set-Cookie', cookie('social_session', '', 0)); return json(res, { ok: true });
      }
      if (method === 'POST' && path === '/api/meta/connect') {
        if (c.demo) throw fail(409, 'Account connections are disabled in the local demo. Configure the live app first.');
        if (!metaConfigured()) throw fail(409, 'Set META_APP_ID and META_APP_SECRET on your app server first.');
        const state = store.state('meta', session.id);
        const target = new URL(`https://www.facebook.com/${c.metaVersion}/dialog/oauth`);
        target.search = new URLSearchParams({ client_id: c.metaId, redirect_uri: c.origin + '/auth/meta/callback', state, response_type: 'code', scope: 'pages_show_list,pages_read_engagement,pages_read_user_content,instagram_basic,instagram_manage_comments' }).toString();
        if (c.metaLoginConfigId) { target.searchParams.delete('scope'); target.searchParams.set('config_id', c.metaLoginConfigId); }
        return json(res, { url: target.href });
      }
      if (method === 'POST' && path === '/api/meta/select') {
        const encrypted = store.get('metaPending');
        if (!encrypted) throw fail(409, 'Connect Meta first');
        const pending = decrypt(encrypted, c.encryptionKey);
        if (pending.expires < Date.now()) throw fail(409, 'Page selection expired. Connect again.');
        const page = pending.pages.find(p => p.id === data.pageId);
        if (!page) throw fail(400, 'Choose a page from your connected account');
        store.clearSocial();
        store.set('connection', encrypt({ userId: String(pending.userId), pageId: page.id, pageName: page.name, igId: page.instagram_business_account?.id || '', igName: page.instagram_business_account?.username || '', token: page.access_token, connectedAt: Date.now() }, c.encryptionKey));
        void sync.run(); return json(res, { ok: true });
      }
      if (method === 'DELETE' && path === '/api/meta') { store.clearSocial(); return json(res, { ok: true }); }
      if (method === 'POST' && path === '/api/sync') {
        if (c.demo) throw fail(409, 'Demo content is local. Connect accounts in the live app to sync.');
        if (!store.get('connection')) throw fail(409, 'Connect your accounts first');
        const last = store.db.prepare('SELECT at FROM runs ORDER BY id DESC LIMIT 1').get();
        if (last && Date.now() - last.at < 60_000) throw fail(429, 'Please wait one minute before syncing again.');
        void sync.run(); return json(res, { ok: true }, 202);
      }
      if (method === 'PATCH' && path === '/api/preferences') {
        if (typeof data.autoPublish !== 'boolean' || typeof data.enabled !== 'boolean') throw fail(400, 'Invalid preferences');
        store.set('preferences', { autoPublish: data.autoPublish, enabled: data.enabled }); return json(res, { ok: true });
      }
      if (method === 'PATCH' && path.startsWith('/api/posts/')) {
        let id; try { id = decodeURIComponent(path.slice('/api/posts/'.length)); } catch { throw fail(400, 'Invalid item'); }
        if (!['published', 'pending', 'hidden'].includes(data.status) || typeof data.product !== 'string' || !/^[a-z0-9-]{0,200}$/.test(data.product)) throw fail(400, 'Invalid status or product handle');
        const result = store.db.prepare('UPDATE posts SET status=?,product=? WHERE id=?').run(data.status, data.product, id);
        if (!result.changes) throw fail(404, 'Item not found'); return json(res, { ok: true });
      }
      throw fail(404, 'Not found');
    } catch (error) {
      if (!res.headersSent) json(res, { error: error.status ? error.message : 'The request could not be completed. Check account setup and try again.' }, error.status || 500);
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return { server, store, sync };
}

if (process.argv[1] && (fileURLToPath(import.meta.url) === process.argv[1] || process.argv[1].endsWith('/demo.js'))) {
  const c = loadConfig();
  const { server, store, sync } = createApp(c);
  const timer = setInterval(() => { store.clean(); void sync.run(); }, c.syncMinutes * 60000);
  timer.unref();
  server.listen(c.port, c.host, () => { console.log(`Hotend Social Sync ${c.demo ? '(local demo)' : ''} listening on port ${c.port}`); void sync.run(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); server.close(() => { store.db.close(); process.exit(0); }); });
}
