'use strict';
let state, filter = 'all', activeTab = 'content';
const $ = s => document.querySelector(s);
const node = (tag, text, className) => { const e = document.createElement(tag); if (text) e.textContent = text; if (className) e.className = className; return e; };
function notice(message, error = false) { const e = $('#notice'); e.textContent = message; e.classList.toggle('error', error); e.hidden = !message; }
async function api(path, method = 'GET', value) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state?.csrf || '' }, ...(value !== undefined ? { body: JSON.stringify(value) } : {}) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Please try again.');
  return data;
}
async function action(button, task) {
  button.disabled = true;
  try { await task(); } catch (e) { notice(e.message, true); } finally { button.disabled = false; }
}
function tab(name) {
  activeTab = name;
  for (const id of ['content', 'connections', 'activity']) $(`#${id}-panel`).hidden = id !== name;
  document.querySelectorAll('.nav-item').forEach(e => e.classList.toggle('active', e.dataset.tab === name));
  $('#page-title').textContent = name === 'content' ? 'A little social proof. A lot of real people.' : name === 'connections' ? 'Your accounts. Your rules.' : 'Keep your community in sync.';
  if (name === 'content') $('#page-title').replaceChildren(document.createTextNode('A little social proof.'), document.createElement('br'), document.createTextNode('A lot of real people.'));
}
function renderPosts() {
  const search = $('#search').value.toLowerCase(), platform = $('#platform').value;
  const posts = state.posts.filter(p => (filter === 'all' || p.status === filter) && (platform === 'all' || p.platform === platform) && `${p.text} ${p.author}`.toLowerCase().includes(search));
  const grid = $('#content-grid'); grid.replaceChildren();
  for (const p of posts) {
    const card = node('article', '', 'post-card');
    if (p.image) { const img = node('img', '', 'card-media'); img.src = p.image; img.alt = p.demo ? 'Illustration for a sample post' : `Photo shared by ${p.author}`; img.loading = 'lazy'; img.addEventListener('error', () => img.remove(), { once: true }); card.append(img); }
    const meta = node('div', '', 'card-meta'), label = node('span', '', 'platform-label');
    label.append(node('span', p.platform === 'instagram' ? '◎' : 'f', `platform-icon ${p.platform}`), document.createTextNode(p.platform === 'instagram' ? 'Instagram' : 'Facebook'));
    const stale = !p.available || Date.now() - p.seen > 48 * 3600000;
    meta.append(label, node('span', stale ? 'Unavailable' : p.status[0].toUpperCase() + p.status.slice(1), `status-pill ${stale ? 'unavailable' : p.status}`));
    card.append(meta);
    const body = node('div', '', 'card-body');
    if (!p.image) body.append(node('div', '“', 'quote-mark'));
    body.append(node('div', p.author, 'author'), node('p', p.text, !p.image ? 'quote' : ''));
    const details = node('div', '', 'card-details');
    details.append(node('span', p.demo ? 'Sample content' : new Date(p.created).toLocaleDateString()), node('span', '·'), node('span', p.kind));
    if (!p.demo && p.url) { const link = node('a', 'View original ↗'); link.href = p.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link); }
    body.append(details); card.append(body);
    const actions = node('div', '', 'card-actions');
    for (const [title, status] of [[p.status === 'published' ? 'Move to pending' : 'Publish', p.status === 'published' ? 'pending' : 'published'], [p.status === 'hidden' ? 'Restore to pending' : 'Hide', p.status === 'hidden' ? 'pending' : 'hidden']]) {
      const button = node('button', title); button.addEventListener('click', () => action(button, async () => { await api(`/api/posts/${encodeURIComponent(p.id)}`, 'PATCH', { status, product: p.product }); await refresh(); })); actions.append(button);
    }
    card.append(actions);
    const product = node('details', '', 'card-product'); product.append(node('summary', p.product ? `Product: ${p.product}` : 'Assign a product'));
    const form = node('form', '', 'product-form'), input = node('input'); input.type = 'text'; input.value = p.product; input.placeholder = 'e.g. petg-filament'; input.pattern = '[a-z0-9-]*'; input.maxLength = 200; input.setAttribute('aria-label', 'Product handle');
    const save = node('button', 'Save'); save.type = 'submit'; form.append(input, save); form.addEventListener('submit', e => { e.preventDefault(); action(save, async () => { await api(`/api/posts/${encodeURIComponent(p.id)}`, 'PATCH', { status: p.status, product: input.value.trim() }); notice('Product assignment saved.'); await refresh(); }); }); product.append(form); card.append(product); grid.append(card);
  }
  if (!posts.length) { const empty = node('div', '', 'empty'); empty.append(node('h3', state.connection ? 'No content here yet.' : 'Your community starts here.'), node('p', state.posts.length ? 'Try a different filter or search.' : 'Connect your accounts to collect customer photos and comments.')); grid.append(empty); }
  $('#result-count').textContent = `Showing ${posts.length} of ${state.posts.length} loaded items${state.posts.length === 500 ? ' · latest 500 shown' : ''}`;
}
function renderState() {
  $('#demo-banner').hidden = !state.demo; $('#shop-name').textContent = state.shop;
  $('#stat-total').textContent = state.posts.length;
  $('#stat-published').textContent = state.posts.filter(p => p.status === 'published' && p.available && Date.now() - p.seen < 48 * 3600000).length;
  $('#stat-pending').textContent = state.posts.filter(p => p.status === 'pending').length;
  $('#mode-label').textContent = state.preferences.autoPublish ? 'Automatic' : 'Review first';
  $('#auto-publish').checked = state.preferences.autoPublish; $('#gallery-enabled').checked = state.preferences.enabled;
  $('#instagram-state').textContent = state.connection?.igName ? '@' + state.connection.igName : 'Not connected';
  $('#facebook-state').textContent = state.connection?.pageName || 'Not connected';
  $('#disconnect-meta').hidden = !state.connection;
  $('#connect-meta').textContent = state.connection ? 'Reconnect accounts' : 'Connect with Facebook';
  $('#connection-note').textContent = state.demo ? 'Connections are disabled in this local demo. Use the included setup guide to configure the live app.' : !state.configured ? 'Meta app credentials still need to be configured on the server.' : 'Only content made available by Meta and your account permissions can be imported.';
  $('#sync-now').disabled = state.syncing; $('#sync-now').textContent = state.syncing ? 'Syncing…' : '↻  Sync now';
  $('#page-picker').hidden = !state.pages.length; $('#page-options').replaceChildren();
  for (const p of state.pages) { const b = node('button', `${p.name}${p.instagram ? ' · @' + p.instagram : ''}`, 'button'); b.addEventListener('click', () => action(b, async () => { await api('/api/meta/select', 'POST', { pageId: p.id }); notice('Accounts connected. The first sync is starting.'); await refresh(); })); $('#page-options').append(b); }
  $('#sync-description').textContent = `Automatic sync runs every ${state.syncMinutes} minutes while the app server is running. Items not verified for 48 hours are withheld from the public gallery.`;
  const list = $('#activity-list'); list.replaceChildren();
  if (!state.runs.length) list.append(node('p', state.demo ? 'No live syncs in demo mode. The sample content is stored locally.' : 'No syncs yet. Connect your accounts to get started.'));
  for (const r of state.runs) { const row = node('article', '', 'run-row'); row.append(node('strong', r.ok ? 'Sync completed' : 'Sync needs attention'), node('p', r.message), node('time', new Date(r.at).toLocaleString())); list.append(row); }
  renderPosts();
}
async function refresh() { state = await api('/api/state'); renderState(); }
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => tab(b.dataset.tab)));
document.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.status; document.querySelectorAll('[data-status]').forEach(x => x.classList.toggle('selected', x === b)); renderPosts(); }));
$('#platform').addEventListener('change', renderPosts); $('#search').addEventListener('input', renderPosts);
$('#sync-now').addEventListener('click', e => action(e.currentTarget, async () => { await api('/api/sync', 'POST', {}); notice('Sync started. Check Sync activity for the result.'); await refresh(); }));
$('#connect-meta').addEventListener('click', e => action(e.currentTarget, async () => { const r = await api('/api/meta/connect', 'POST', {}); window.location.assign(r.url); }));
$('#save-settings').addEventListener('click', e => action(e.currentTarget, async () => { await api('/api/preferences', 'PATCH', { autoPublish: $('#auto-publish').checked, enabled: $('#gallery-enabled').checked }); notice('Preferences saved.'); await refresh(); }));
$('#disconnect-meta').addEventListener('click', () => $('#confirm-disconnect').showModal());
$('#cancel-disconnect').addEventListener('click', () => $('#confirm-disconnect').close());
$('#confirm-delete').addEventListener('click', e => action(e.currentTarget, async () => { await api('/api/meta', 'DELETE', {}); $('#confirm-disconnect').close(); notice('Accounts disconnected and imported content erased.'); await refresh(); }));
refresh().then(() => { const n = new URLSearchParams(location.search).get('notice'); if (n === 'choose-page') { tab('connections'); notice(state.pages.length ? 'Choose the Page you want to connect below.' : 'No accessible Pages were returned. Check your Meta Page permissions.', !state.pages.length); } if (n === 'meta-cancelled') notice('Meta connection was cancelled. You can try again in Connections.', true); }).catch(e => notice(e.message, true));
setInterval(() => { if (state?.syncing && activeTab !== 'connections' && !document.querySelector('details[open]')) refresh().catch(e => notice(e.message, true)); }, 5000);

