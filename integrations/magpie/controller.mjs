import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

// This adapter runs in magpie's Bun host, not in the sandboxed page.
// Only fixed CLI commands are accepted; paths come from user-saved options.
export function createController(options = {}, runProcess = runCLI) {
  let busy = false;
  let lastSync = { state: 'not-run' };
  function configuration() {
    const project = path.resolve(required(options.projectDirectory, 'projectDirectory'));
    const metadata = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
    if (metadata.name !== 'claude-desktop-3p-zh') throw new Error('projectDirectory is not this project.');
    return { executable: options.nodeExecutable || 'node', cli: path.join(project, 'bin', 'claude-3p-zh.mjs'), cwd: project };
  }
  function locale() {
    const value = options.locale ?? 'zh-Hans';
    if (!['zh-Hans', 'zh-Hant'].includes(value)) throw new Error('Invalid saved locale.');
    return value;
  }
  function rootArgs() { return ['--root', required(options.managedRoot, 'managedRoot')]; }
  function catalogArgs() { return options.catalogDirectory ? ['--catalog-dir', options.catalogDirectory] : []; }
  async function command(action) {
    let args;
    switch (action) {
      case 'detect': args = ['detect-3p', '--profile-dir', required(options.profileDirectory, 'profileDirectory')]; break;
      case 'status': args = ['status', ...rootArgs()]; break;
      case 'plan': args = ['plan', '--source', required(options.sourceDirectory, 'sourceDirectory'), '--locale', locale(), ...catalogArgs()]; break;
      case 'import-cache': args = ['catalog', 'cache', '--cache', required(options.cacheDirectory, 'cacheDirectory'), '--locale', locale(), ...catalogArgs()]; break;
      case 'prepare': args = ['prepare-copy', '--source', required(options.sourceDirectory, 'sourceDirectory'), '--destination', required(options.managedRoot, 'managedRoot'), '--gateway-profile', required(options.gatewayProfile, 'gatewayProfile'), '--locale', locale(), ...catalogArgs()]; break;
      case 'switch': args = ['switch', ...rootArgs(), '--locale', locale(), ...catalogArgs()]; break;
      case 'restore': args = ['restore', ...rootArgs()]; break;
      default: throw new Error('Unsupported action.');
    }
    return runProcess(configuration(), args);
  }
  async function execute(action, confirmation = '') {
    if (busy) throw new Error('Another plugin operation is running.');
    const writes = ['prepare', 'switch', 'restore', 'import-cache'].includes(action);
    if (writes && (options.allowWrites !== true || confirmation !== action)) throw new Error('Writes disabled. Enable allowWrites in your plugin settings and confirm the exact action.');
    busy = true;
    try {
      if (action === 'prepare' || action === 'switch') {
        const detected = await command('detect');
        if (!detected.configured3p || detected.provider !== 'gateway') throw new Error('Saved profile directory is not configured for 3p Gateway.');
      }
      return await command(action);
    } finally { busy = false; }
  }
  async function sync() {
    if (options.autoSync !== true || options.allowWrites !== true) return { state: 'disabled' };
    if (busy) return { state: 'busy' };
    busy = true;
    try {
      const detected = await command('detect');
      if (!detected.configured3p || detected.provider !== 'gateway') return lastSync = { state: 'not-3p-gateway' };
      const current = await command('status');
      if (current.status !== 'installed' || !current.intact) return lastSync = { state: 'not-installed-or-modified' };
      if (current.locale === locale()) return lastSync = { state: 'up-to-date', locale: locale() };
      await command('switch'); // CLI refuses if the copy is running or another writer owns its lock.
      return lastSync = { state: 'switched', locale: locale() };
    } catch (error) { return lastSync = { state: 'deferred', reason: error.message }; }
    finally { busy = false; }
  }
  return { execute, sync, state: () => ({ ...lastSync }) };
}
function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Configure plugin option: ' + name);
  return value;
}
function runCLI(config, args) {
  return new Promise((resolve, reject) => {
    execFile(config.executable, [config.cli, ...args], { cwd: config.cwd, windowsHide: true, timeout: 45_000, maxBuffer: 8 * 1024 * 1024, shell: false }, (error, stdout, stderr) => {
      if (error) { reject(new Error(stderr.trim() || 'CLI failed or exceeded 45 seconds. Inspect the managed copy before retrying.')); return; }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('CLI did not return JSON.')); }
    });
  });
}
