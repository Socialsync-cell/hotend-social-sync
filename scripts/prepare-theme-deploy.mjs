import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

export const APP_URL = 'https://social-sync-t82i.onrender.com';

export function prepareConfig(source, clientId) {
  if (!/^[a-f0-9]{32}$/i.test(clientId)) {
    throw new Error('Enter the 32-character Shopify Client ID (SHOPIFY_API_KEY in Render), not the numeric Meta App ID or an App Secret.');
  }
  source = source.replace(/\r\n/g, '\n');
  for (const field of ['client_id', 'application_url']) {
    if (!new RegExp(`^${field}\\s*=\\s*"[^"\\r\\n]*"\\s*$`, 'm').test(source)) {
      throw new Error(`Cannot safely locate ${field} in shopify.app.toml. No deployment configuration was written.`);
    }
  }
  if (!/^\[auth\]\s*$/m.test(source)) throw new Error('Missing [auth] configuration.');
  let updated = source
    .replace(/^client_id\s*=\s*"[^"\r\n]*"[^\S\r\n]*$/m, `client_id = "${clientId}"`)
    .replace(/^application_url\s*=\s*"[^"\r\n]*"[^\S\r\n]*$/m, `application_url = "${APP_URL}"`);
  let found = false;
  updated = updated.replace(/(^\[auth\][^\S\r\n]*\r?\n)([\s\S]*?)(?=^\[|$(?![\s\S]))/m, (match, header, body) => {
    if (!/^redirect_urls\s*=\s*\[[^\]\r\n]*\][^\S\r\n]*$/m.test(body)) {
      throw new Error('Cannot safely locate the auth redirect_urls array. No deployment configuration was written.');
    }
    found = true;
    return header + body.replace(/^redirect_urls\s*=\s*\[[^\]\r\n]*\][^\S\r\n]*$/m,
      `redirect_urls = [ "${APP_URL}/auth/shopify/callback" ]`);
  });
  if (!found) throw new Error('Cannot locate the [auth] settings.');
  return updated;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const sourcePath = resolve(root, 'shopify.app.toml');
  const outputPath = resolve(root, 'shopify.app.gallery.toml');
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--client-id')) {
    throw new Error('Usage: node scripts/prepare-theme-deploy.mjs [--client-id SHOPIFY_CLIENT_ID]');
  }
  const source = readFileSync(sourcePath, 'utf8');
  let clientId = args[1]?.trim();
  if (!clientId) {
    if (!process.stdin.isTTY) throw new Error('An interactive terminal or --client-id is required.');
    console.log('\nFind SHOPIFY_API_KEY in Render > Social Sync > Environment.');
    console.log('Use that Shopify Client ID. No App Secret is needed here.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try { clientId = (await rl.question('Shopify Client ID: ')).trim(); }
    finally { rl.close(); }
  }
  const output = prepareConfig(source, clientId);
  if (existsSync(outputPath)) {
    copyFileSync(outputPath, `${outputPath}.backup-${Date.now()}`);
  }
  writeFileSync(outputPath, output);
  console.log('\nPrepared shopify.app.gallery.toml for your existing Shopify app.');
  console.log(`Shopify Client ID: ${clientId}`);
  console.log(`App URL: ${APP_URL}`);
  console.log('Theme block: Social gallery');
  console.log('\nNext: Shopify validates the configuration and shows a release summary.');
  console.log('Check that the summary names your installed Social Sync Shopify app.');
  console.log('If it targets another app or proposes removing other extensions, cancel.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`\n${error.message}`); process.exitCode = 1; });
}
