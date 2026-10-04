import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
try {
  const app = readFileSync(new URL('shopify.app.gallery.toml', root), 'utf8');
  const extension = readFileSync(new URL('extensions/social-gallery/shopify.extension.toml', root), 'utf8');
  const client = app.match(/^client_id\s*=\s*"([^"]+)"/m)?.[1];
  const uid = extension.match(/^uid\s*=\s*"([^"]+)"/m)?.[1];
  if (client !== '85c2d34e4f7ec89a727699cd109ac94e' || uid !== '7c22134b-b4fc-0de6-9e04-ed710ae79f69a64a548c') {
    throw new Error('This folder no longer matches the deployed Hotend Social Sync app and extension. Use the complete carousel update ZIP.');
  }
  console.log(`Project: ${fileURLToPath(root)}`);
  console.log('Existing Hotend Social Sync app and Social gallery extension confirmed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
