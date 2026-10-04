import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareConfig, APP_URL } from '../scripts/prepare-theme-deploy.mjs';

const clientId = 'ab'.repeat(16);
const config = readFileSync(new URL('../shopify.app.toml', import.meta.url), 'utf8');

test('deployment config targets the supplied Shopify app and real Render callback', () => {
  const result = prepareConfig(config, clientId);
  assert.match(result, new RegExp(`^client_id = "${clientId}"$`, 'm'));
  assert.ok(result.includes(`application_url = "${APP_URL}"`));
  assert.ok(result.includes(`redirect_urls = [ "${APP_URL}/auth/shopify/callback" ]`));
  assert.doesNotMatch(result, /REPLACE_WITH_|social\.example\.com/);
  assert.equal(result.slice(result.indexOf('[app_proxy]')), config.slice(config.indexOf('[app_proxy]')));
  assert.match(result, /embedded = false/);
  assert.match(result, /scopes = "write_app_proxy"/);
});

test('deployment config rejects a Meta ID, secrets with prefixes and injected TOML', () => {
  for (const value of ['28895996436751160', '', 'shpss_' + 'ab'.repeat(16), `${clientId}"\nembedded = true`]) {
    assert.throws(() => prepareConfig(config, value), /Shopify Client ID/);
  }
});

test('deployment config supports Windows line endings and repeated preparation', () => {
  const result = prepareConfig(config.replace(/\r?\n/g, '\r\n'), clientId);
  assert.equal(result, prepareConfig(config, clientId));
  assert.equal(prepareConfig(result, clientId), result);
});

test('deployment preparation fails closed when required config fields are missing', () => {
  for (const field of [/^client_id.*\n/m, /^application_url.*\n/m, /^\[auth\].*\n/m, /^redirect_urls.*\n/m]) {
    assert.throws(() => prepareConfig(config.replace(field, ''), clientId));
  }
});
