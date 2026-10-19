import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const pkg = read('package.json');
const folder = read('integrations/magpie/package.json');
assert.equal(pkg.name, 'magpie-claude-zh');
assert.notEqual(pkg.private, true);
assert.equal(pkg.main, './integrations/magpie/server.mjs');
assert.equal(pkg.exports, pkg.main);
assert.equal(folder.name, pkg.name);
assert.equal(folder.version, pkg.version);
assert.equal(folder.description, pkg.description);
const icon = fs.readFileSync(path.join(root, 'assets/logo.png'));
assert(icon.length <= 1024 * 1024, 'magpie icons must fit within 1 MB.');
assert.equal(pkg.magpie.icon, 'data:image/png;base64,' + icon.toString('base64'));
assert.equal(folder.magpie.icon, pkg.magpie.icon);
assert(icon.equals(fs.readFileSync(path.join(root, 'integrations/magpie/page/icon.png'))));
for (const file of [pkg.main, pkg.magpie.page.file, pkg.magpie.page.icon,
  'bin/claude-3p-zh.mjs', 'scripts/build-runtime-localization.mjs',
  'scripts/test-runtime-autoload.ps1', 'integrations/windows-runtime/RuntimeConsoleBridge.cs']) {
  assert(fs.statSync(path.join(root, file)).isFile(), 'Missing package file: ' + file);
}
assert(!pkg.dependencies && !pkg.optionalDependencies, 'Review runtime dependencies before publishing.');
console.error(`${pkg.name}@${pkg.version}: plugin entry, page and embedded icon verified.`);
