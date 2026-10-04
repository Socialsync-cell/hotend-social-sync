import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDB } from '../src/db.js';
import { config } from '../src/config.js';
import { createApp } from '../src/server.js';
import { Meta, MetaError, collect, normalize } from '../src/meta.js';
import { synchronizer } from '../src/sync.js';
import { hash, hmac, encrypt, decrypt, verifyQuery, signedRequest, safeURL } from '../src/security.js';

const key = 'ab'.repeat(32);
const live = { demo: false, shop: 'example.myshopify.com', shopKey: 'client', shopSecret: 'shop-secret', encryptionKey: key, metaId: 'meta-client', metaSecret: 'meta-secret', metaVersion: 'v24.0', origin: 'https://app.example.com', port: 0, support: 'support@example.com', syncMinutes: 15 };
const post = overrides => ({ id: 'instagram:post:100', remote_id: '100', platform: 'instagram', kind: 'post', author: 'maker', text: 'Hello', image: '', url: 'https://www.instagram.com/p/example/', created: new Date().toISOString(), ...overrides });
async function harness(t, transport, overrides = {}) {
  const store = openDB(':memory:');
  const app = createApp({ ...live, ...overrides }, store, transport);
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); store.db.close(); });
  const id = store.session(), session = store.db.prepare('SELECT * FROM sessions WHERE id=?').get(hash(id));
  const auth = { Cookie: `social_session=${id}`, Origin: live.origin, 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf };
  return { ...app, base, auth, session };
}

test('encrypted tokens reject tampering and incorrect keys', () => {
  const token = encrypt({ token: 'secret-value' }, key);
  assert.ok(!token.includes('secret-value'));
  assert.deepEqual(decrypt(token, key), { token: 'secret-value' });
  assert.throws(() => decrypt(token, 'cd'.repeat(32)));
  const b = Buffer.from(token, 'base64'); b[30] ^= 1; assert.throws(() => decrypt(b.toString('base64'), key));
});
test('Shopify proxy verification matches documented duplicate-parameter fixture', () => {
  const p = new URLSearchParams('extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=1&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555&signature=4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb');
  assert.equal(verifyQuery(p, 'hush', true, 1317327555000), true);
  assert.equal(verifyQuery(p, 'hush', true, Date.now()), false);
  p.append('shop', 'attacker.myshopify.com'); assert.equal(verifyQuery(p, 'hush', true, 1317327555000), false);
});
test('OAuth state is single-use and bound to the initiating browser', () => {
  const s = openDB(':memory:');
  const nonce = s.state('shopify', 'browser-a');
  assert.equal(s.consume(nonce, 'shopify', 'browser-b'), false);
  assert.equal(s.consume(nonce, 'shopify', 'browser-a'), true);
  assert.equal(s.consume(nonce, 'shopify', 'browser-a'), false); s.db.close();
});
test('hidden posts remain hidden after syncing and edited reviewed content becomes pending', () => {
  const s = openDB(':memory:'); s.upsert(post());
  s.db.prepare("UPDATE posts SET status='hidden'").run(); s.upsert(post({ text: 'Edited' }));
  assert.equal(s.feed().length, 0);
  s.db.prepare("UPDATE posts SET status='published'").run(); s.set('preferences', { autoPublish: false, enabled: true });
  s.upsert(post({ text: 'Edited again' })); assert.equal(s.db.prepare('SELECT status FROM posts').get().status, 'pending'); s.db.close();
});
test('public feed filters stale, unavailable, demo, pending, hidden and mismatched product content', () => {
  const s = openDB(':memory:');
  for (let i = 0; i < 7; i++) s.upsert(post({ id: String(i), demo: i === 4 }));
  s.db.exec("UPDATE posts SET seen=0 WHERE id='0'; UPDATE posts SET available=0 WHERE id='1'; UPDATE posts SET status='pending' WHERE id='2'; UPDATE posts SET status='hidden' WHERE id='3'; UPDATE posts SET product='pla' WHERE id='5';");
  assert.deepEqual(s.feed({ product: 'pla' }).map(p => p.id), ['5']);
  assert.equal(s.feed().length, 2);
  s.set('preferences', { autoPublish: true, enabled: false }); assert.equal(s.feed().length, 0); s.db.close();
});
test('live configuration fails closed without credentials; demo cannot bind publicly', () => {
  assert.throws(() => config({ NODE_ENV: 'production' }));
  assert.throws(() => config({ DEMO_MODE: 'true', HOST: '0.0.0.0' }));
  assert.throws(() => config({ DEMO_MODE: 'true', NODE_ENV: 'production' }));
});
test('media normalizer blocks injected links and uses video thumbnail', () => {
  assert.equal(safeURL('javascript:alert(1)'), '');
  assert.equal(safeURL('https://facebook.com.evil.example/x'), '');
  assert.equal(safeURL('https://facebook.com@evil.example/x'), '');
  const p = normalize('instagram', 'post', { id: '123', media_type: 'VIDEO', media_url: 'https://s.cdninstagram.com/movie.mp4', thumbnail_url: 'https://s.cdninstagram.com/thumb.jpg', permalink: 'https://www.instagram.com/p/x/', caption: '<script>alert(1)</script>' });
  assert.equal(p.image, 'https://s.cdninstagram.com/thumb.jpg');
  assert.equal(p.text, '<script>alert(1)</script>');
});
test('Meta pagination uses cursor with authorized endpoint, not remote next URL', async () => {
  const calls = [];
  const meta = new Meta(live, async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(calls.length === 1 ? { data: [{ id: '1' }], paging: { next: 'https://evil.example/steal', cursors: { after: 'cursor-two' } } } : { data: [{ id: '2' }] });
  });
  const list = await meta.list('123/feed', { fields: 'id' }, 'private-token');
  assert.equal(list.length, 2);
  assert.equal(new URL(calls[1].url).host, 'graph.facebook.com');
  assert.equal(new URL(calls[1].url).searchParams.get('after'), 'cursor-two');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer private-token');
  assert.ok(!calls[1].url.includes('private-token'));
});
test('expired Meta token yields a reconnect message without exposing upstream secrets', async () => {
  const meta = new Meta(live, async () => Response.json({ error: { code: 190, message: 'secret-token' } }, { status: 400 }));
  await assert.rejects(() => meta.request('me'), e => e instanceof MetaError && /Reconnect/.test(e.message) && !e.message.includes('secret-token'));
});
test('collector imports customer content but excludes business-authored posts and comments', async () => {
  const m = { async list(path) {
    const data = {
      '10/feed': [{ id: '10_1', from: { id: '10' }, message: 'Brand post', permalink_url: 'https://www.facebook.com/10/posts/1' }, { id: '10_2', from: { id: '20', name: 'Customer' }, message: 'Customer photo', permalink_url: 'https://www.facebook.com/10/posts/2' }],
      '10_1/comments': [{ id: '10_11', from: { id: '20', name: 'Customer' }, message: 'Love it' }, { id: '10_12', from: { id: '10' }, message: 'Thanks' }],
      '10_2/comments': [], '30/tags': [{ id: '31', caption: 'Tagged', permalink: 'https://www.instagram.com/p/a/', username: 'customer' }],
      '30/media': [{ id: '32', permalink: 'https://www.instagram.com/p/b/' }],
      '32/comments': [{ id: '33', username: 'customer', text: 'Nice' }, { id: '34', username: 'brand', text: 'Thanks' }],
    }; return data[path] || [];
  } };
  const result = await collect(m, { pageId: '10', igId: '30', igName: 'brand', token: 'x' });
  assert.equal(result.posts.length, 4); assert.equal(result.errors.length, 0);
  assert.ok(result.posts.every(p => !['Brand post', 'Thanks'].includes(p.text)));
});
test('disconnect during sync prevents repopulating erased content', async () => {
  const s = openDB(':memory:'); s.set('installed', true); s.set('connection', encrypt({ pageId: '10', token: 'x' }, key));
  let release; const gate = new Promise(resolve => { release = resolve; });
  const sync = synchronizer(s, live, () => ({ async list(path) { await gate; return path === '10/feed' ? [{ id: '10_1', from: { id: '20' }, message: 'test', permalink_url: 'https://www.facebook.com/10/posts/1' }] : []; } }));
  const run = sync.run(); s.clearSocial(); release(); await run;
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM posts').get().n, 0); s.db.close();
});
test('admin API requires session and CSRF; a valid mutation persists', async t => {
  const h = await harness(t);
  assert.equal((await fetch(h.base + '/api/state')).status, 401);
  h.store.upsert(post());
  const route = '/api/posts/' + encodeURIComponent('instagram:post:100');
  assert.equal((await fetch(h.base + route, { method: 'PATCH', headers: { ...h.auth, 'X-CSRF-Token': 'wrong' }, body: JSON.stringify({ status: 'hidden', product: '' }) })).status, 403);
  assert.equal((await fetch(h.base + route, { method: 'PATCH', headers: { ...h.auth, Origin: 'https://evil.example' }, body: '{}' })).status, 403);
  assert.equal((await fetch(h.base + route, { method: 'PATCH', headers: h.auth, body: JSON.stringify({ status: 'hidden', product: 'pla' }) })).status, 200);
  assert.equal(h.store.feed().length, 0);
});
test('public feed requires a valid signed request from the configured shop', async t => {
  const h = await harness(t); h.store.set('installed', true); h.store.upsert(post());
  const signed = shop => { const p = new URLSearchParams({ shop, timestamp: String(Math.floor(Date.now() / 1000)), path_prefix: '/apps/social-sync' }); p.set('signature', hmac(live.shopSecret, [...p.keys()].sort().map(k => `${k}=${p.get(k)}`).join(''))); return p; };
  assert.equal((await fetch(h.base + '/proxy/feed')).status, 401);
  assert.equal((await fetch(h.base + '/proxy/feed?' + signed('wrong.myshopify.com'))).status, 401);
  const r = await fetch(h.base + '/proxy/feed?' + signed(live.shop)); assert.equal(r.status, 200); assert.equal((await r.json()).posts.length, 1);
});
test('Shopify OAuth enforces nonce, signature and scope before granting a session', async t => {
  const h = await harness(t, async () => Response.json({ access_token: 'shop-token', scope: 'write_app_proxy' }));
  const start = await fetch(h.base + '/auth/shopify?shop=' + live.shop, { redirect: 'manual' });
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const cookie = start.headers.get('set-cookie').split(';')[0];
  const p = new URLSearchParams({ shop: live.shop, code: 'one-time-code', timestamp: String(Math.floor(Date.now() / 1000)), state });
  p.set('hmac', hmac(live.shopSecret, [...p.keys()].sort().map(k => `${k}=${p.get(k)}`).join('&')));
  assert.equal((await fetch(h.base + '/auth/shopify/callback?' + p, { redirect: 'manual' })).status, 401);
  const ok = await fetch(h.base + '/auth/shopify/callback?' + p, { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(ok.status, 302); assert.match(ok.headers.get('set-cookie'), /social_session=/); assert.equal(h.store.get('installed'), true);
  assert.equal((await fetch(h.base + '/auth/shopify/callback?' + p, { headers: { Cookie: cookie }, redirect: 'manual' })).status, 401);
});
test('uninstall webhook rejects forgery, then erases content and invalidates sessions', async t => {
  const h = await harness(t); h.store.upsert(post()); h.store.set('installed', true);
  const body = JSON.stringify({ myshopify_domain: live.shop });
  const headers = { 'Content-Type': 'application/json', 'X-Shopify-Shop-Domain': live.shop, 'X-Shopify-Topic': 'app/uninstalled', 'X-Shopify-Hmac-Sha256': hmac(live.shopSecret, body, 'base64') };
  assert.equal((await fetch(h.base + '/webhooks/uninstalled', { method: 'POST', body, headers: { ...headers, 'X-Shopify-Hmac-Sha256': 'bad' } })).status, 401);
  assert.equal(h.store.feed().length, 1);
  assert.equal((await fetch(h.base + '/webhooks/uninstalled', { method: 'POST', body, headers })).status, 200);
  assert.equal(h.store.feed().length, 0); assert.equal(h.store.get('installed'), false);
  assert.equal((await fetch(h.base + '/api/state', { headers: h.auth })).status, 401);
});
test('Meta data deletion only erases data belonging to the signed user', async t => {
  const h = await harness(t); h.store.upsert(post()); h.store.set('connection', encrypt({ userId: '123', token: 'secret' }, key));
  const sign = user_id => { const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id })).toString('base64url'); return `${hmac(live.metaSecret, payload, 'base64url')}.${payload}`; };
  const send = value => fetch(h.base + '/meta/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signed_request: value }) });
  assert.throws(() => signedRequest('bad.bad', live.metaSecret));
  assert.equal((await send(sign('other'))).status, 200); assert.equal(h.store.feed().length, 1);
  assert.equal((await send(sign('123'))).status, 200); assert.equal(h.store.feed().length, 0); assert.equal(h.store.get('connection'), null);
});
test('expired server sessions cannot retrieve account or content data', async t => {
  const h = await harness(t); h.store.db.exec('UPDATE sessions SET expires=0');
  assert.equal((await fetch(h.base + '/api/state', { headers: h.auth })).status, 401);
});
test('Meta login accepts an optional Business Login configuration without mixing scope modes', async t => {
  const h = await harness(t, undefined, { metaLoginConfigId: '123456' });
  const response = await fetch(h.base + '/api/meta/connect', { method: 'POST', headers: h.auth, body: '{}' });
  assert.equal(response.status, 200);
  const url = new URL((await response.json()).url);
  assert.equal(url.origin, 'https://www.facebook.com');
  assert.equal(url.searchParams.get('config_id'), '123456');
  assert.equal(url.searchParams.has('scope'), false);
  assert.equal(url.searchParams.get('redirect_uri'), live.origin + '/auth/meta/callback');
  assert.ok(h.store.consume(url.searchParams.get('state'), 'meta', h.session.id));
});
