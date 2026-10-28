import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const npmCli = [process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  path.join(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(candidate => candidate && fs.existsSync(candidate));

test('published tarball installs and loads by package name with its runtime and page intact', { timeout: 60000 }, async t => {
  assert(npmCli, 'Run this test through npm test so npm_execpath is available.');
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'claude-zh-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const npm = (...args) => execFileSync(process.execPath, [npmCli, ...args], {
    cwd: project, encoding: 'utf8', windowsHide: true, timeout: 45000,
    env: { ...process.env, npm_config_cache: path.join(root, 'npm-cache') }
  });
  const [packed] = JSON.parse(npm('pack', '--json', '--ignore-scripts', '--pack-destination', root));
  const files = packed.files.map(file => file.path);
  for (const required of ['integrations/magpie/server.mjs', 'integrations/magpie/page/index.html',
    'integrations/magpie/page/icon.png', 'integrations/windows-runtime/RuntimeConsoleBridge.cs',
    'scripts/test-runtime-autoload.ps1', 'scripts/build-runtime-localization.mjs', 'assets/logo.png',
    'lib/macos.mjs', 'lib/asar-reader.mjs', 'lib/runtime-localization.mjs',
    'integrations/magpie/runtime-host.mjs', 'docs/macos.md',
    'lib/module-exports.mjs', 'lib/vendor/js-tokens.mjs', 'lib/vendor/js-tokens.LICENSE']) {
    assert(files.includes(required), 'Missing runtime asset: ' + required);
  }
  assert(!files.some(file => /^(?:\.handoff|\.catalogs|node_modules|test)\//.test(file)));
  assert(!files.some(file => /(?:^|\/)(?:HANDOFF\.md|next-agent\.md|\.env(?:\..*)?|.*\.(?:pem|key|log))$/.test(file)));
  const staging = path.join(root, 'install');
  fs.mkdirSync(staging);
  fs.writeFileSync(path.join(staging, 'package.json'), '{"private":true,"type":"module"}\n');
  npm('install', '--prefix', staging, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', path.join(root, packed.filename));
  const installed = path.join(staging, 'node_modules/magpie-claude-zh');
  const run = file => execFileSync(process.execPath, [file, 'help'], { cwd: staging, encoding: 'utf8', windowsHide: true });
  const version = JSON.parse(fs.readFileSync(path.join(project, 'package.json'))).version;
  assert(run(path.join(installed, 'bin/claude-3p-zh.mjs')).startsWith('claude-desktop-zh ' + version + ' '));
  run(path.join(installed, 'scripts/check-package.mjs'));
  const smoke = path.join(staging, 'smoke.mjs');
  fs.writeFileSync(smoke, `
    import { ClaudeChinesePlugin } from 'magpie-claude-zh';
    const hooks = await ClaudeChinesePlugin({}, { runtimeAutoLoad: false });
    const status = JSON.parse(await hooks.tool.claude_zh_sync_status.execute());
    console.log(JSON.stringify({ state: status.runtime.state, locale: status.runtime.locale }));
  `);
  assert.deepEqual(JSON.parse(run(smoke)), { state: 'disabled', locale: 'zh-Hans' });
  const { createController } = await import(pathToFileURL(path.join(installed, 'integrations/magpie/controller.mjs')));
  assert.equal(createController().runtimeConfiguration().cwd, installed);
  const pkg = JSON.parse(fs.readFileSync(path.join(installed, 'package.json')));
  assert(fs.existsSync(path.join(installed, pkg.magpie.page.file)));
  assert(fs.existsSync(path.join(installed, pkg.magpie.page.icon)));
  const { registrySnapshot } = await import(pathToFileURL(path.join(installed, 'integrations/magpie/runtime-host.mjs')));
  for (const spec of [installed, 'magpie-claude-zh@' + version, 'github:liwenjinchn/claude-desktop-zh', 'github:liwenjinchn/claude-desktop-zh#v' + version, 'https://github.com/liwenjinchn/claude-desktop-zh.git', 'github:polang233/claude-desktop-zh#v0.1.0']) {
    fs.writeFileSync(path.join(staging, 'plugins.json'), JSON.stringify({ plugins: [{ spec }] }));
    assert.equal(registrySnapshot(staging, {}).hash.length, 64);
  }
  assert.equal(pkg.repository.url, 'git+https://github.com/liwenjinchn/claude-desktop-zh.git');
  // Exercise the installed Mac watcher with an inert process/CLI fixture. This
  // validates package wiring, not a real Claude GUI or OS permissions.
  const { createRuntimeHost } = await import(pathToFileURL(path.join(installed, 'integrations/magpie/runtime-host.mjs')));
  const options = { runtimeAutoLoad: true, locale: 'zh-Hans' };
  fs.writeFileSync(path.join(staging, 'plugins.json'), JSON.stringify({ plugins: [{ spec: 'github:liwenjinchn/claude-desktop-zh', options }] }));
  let applications = 0;
  const host = createRuntimeHost({ directory: staging }, options, {}, {
    platform: 'darwin', macStateDirectory: path.join(root, 'mac-state'), macPollMs: 5,
    macPids: () => [123456], macLastApplied: () => null,
    macApply: async () => { applications++; return { state: 'Applied', pages: [{ id: 1 }] }; },
  });
  t.after(() => host.stop());
  await host.start();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(host.state().state, 'Applied');
  assert.equal(applications, 1);
  host.stop();
  assert.equal(host.state().automaticNextLaunch, false);
});
