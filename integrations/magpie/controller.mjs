import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { defaultLayout } from '../../lib/discover.mjs';

// Fixed CLI commands only. Explicit paths take priority; discovery is lazy so
// restoring a managed copy never depends on the original app or gateway.
export const WRITES = ['install', 'prepare', 'switch', 'restore', 'import-cache'];
export const ACTIONS = ['check', 'install', 'discover', 'detect', 'status', 'plan', 'import-cache', 'prepare', 'switch', 'restore', 'launch'];

export function createController(options = {}, runProcess = runCLI) {
  let busy = false;
  let lastSync = { state: 'not-run' };
  const defaults = defaultLayout();
  const root = options.managedRoot || defaults.managedRoot;
  const mode = options.mode ?? 'original';
  if (!['original', 'copy'].includes(mode)) throw new Error('Mode must be original or copy.');
  const stateDirectory = options.stateDirectory || defaults.originalStateDirectory || path.join(path.dirname(root), 'original');
  const catalog = options.catalogDirectory || defaults.catalogDirectory;
  function configuration() {
    const project = path.resolve(options.projectDirectory || fileURLToPath(new URL('../../', import.meta.url)));
    const metadata = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
    if (metadata.name !== 'magpie-claude-zh') throw new Error('projectDirectory is not this project.');
    // Bun on Windows can reject scandir in a readable WindowsApps package.
    // Use the project's required Node runtime for CLI filesystem operations.
    const executable = options.nodeExecutable || (process.platform === 'win32' && process.versions.bun ? 'node.exe' : process.execPath);
    return { executable, cli: path.join(project, 'bin', 'claude-3p-zh.mjs'), cwd: project };
  }
  function locale(value = options.locale ?? 'zh-Hans') {
    if (!['zh-Hans', 'zh-Hant'].includes(value)) throw new Error('Language must be zh-Hans or zh-Hant.');
    return value;
  }
  function optional(flag, value) { return value ? [flag, value] : []; }
  const catalogArgs = () => ['--catalog-dir', catalog];
  const profileArgs = () => optional('--profile-dir', options.profileDirectory);
  const sourceArgs = () => optional('--source', options.sourceDirectory);
  async function command(action, language = locale()) {
    let args;
    switch (action) {
      case 'discover': args = ['discover', ...sourceArgs(), ...profileArgs(), '--root', root, ...catalogArgs()]; break;
      case 'detect': args = ['detect-3p', ...profileArgs()]; break;
      case 'check': args = ['original-check', ...sourceArgs(), '--state-dir', stateDirectory]; break;
      case 'install': args = ['original-install', ...sourceArgs(), '--state-dir', stateDirectory, '--locale', language, ...catalogArgs()]; break;
      case 'status': args = mode === 'original' ? ['original-status', '--state-dir', stateDirectory] : ['status', '--root', root]; break;
      case 'plan': args = mode === 'original' ? ['original-plan', ...sourceArgs(), '--state-dir', stateDirectory, '--locale', language, ...catalogArgs()] : ['plan', ...sourceArgs(), '--locale', language, ...catalogArgs()]; break;
      case 'import-cache': args = ['catalog', 'cache', ...optional('--cache', options.cacheDirectory), '--locale', language, ...catalogArgs()]; break;
      case 'prepare': args = ['prepare-copy', ...sourceArgs(), '--destination', root, ...optional('--gateway-profile', options.gatewayProfile), ...profileArgs(), '--locale', language, ...catalogArgs()]; break;
      case 'switch': args = mode === 'original' ? ['original-switch', '--state-dir', stateDirectory, '--locale', language, ...catalogArgs()] : ['switch', '--root', root, '--locale', language, ...catalogArgs()]; break;
      case 'restore': args = mode === 'original' ? ['original-restore', '--state-dir', stateDirectory] : ['restore', '--root', root]; break;
      case 'launch': args = ['launch', '--root', root]; break;
      default: throw new Error('Unsupported action.');
    }
    return runProcess(configuration(), args);
  }
  async function execute(action, confirmation = '', selection = {}) {
    if (!ACTIONS.includes(action)) throw new Error('Unsupported action.');
    const language = locale(selection.locale);
    if (mode === 'original' && ['prepare', 'launch'].includes(action)) throw new Error('Copy actions require explicit mode: copy. Original mode never creates or launches a separate profile.');
    if (mode === 'copy' && ['install', 'check'].includes(action)) throw new Error('Original-install actions require mode: original.');
    if (action === 'launch' && confirmation !== action) throw new Error('Confirm the exact action.');
    if (busy) throw new Error('Another plugin operation is running.');
    if (WRITES.includes(action)) {
      if (options.allowWrites === false) throw new Error('Writes disabled by saved allowWrites: false.');
      if (confirmation !== action) throw new Error('Confirm the exact action.');
    }
    busy = true;
    try {
      if (action === 'prepare' || action === 'install') {
        if (action === 'install') {
          const check = await command('check');
          if (!check.eligible) throw new Error(check.reason || 'This installation does not support original-mode localization. No copy was created.');
        }
        // An explicitly chosen Gateway file is validated by prepare-copy itself.
        if (action === 'install' || !options.gatewayProfile) {
          const detected = await command('detect');
          if (!detected.configured3p || detected.provider !== 'gateway') throw new Error('Claude is not configured for 3p Gateway. Configure it in magpie first.');
        }
        try { await command('plan', language); }
        catch (error) {
          if (!/^(?:Error: )?Missing compatible zh-Han[st] base\/dynamic catalogs\./.test(error.message)) throw error;
          await command('import-cache', language);
          await command('plan', language);
        }
      }
      if (mode === 'original' && action === 'switch') {
        try { return await command('switch', language); }
        catch (error) {
          // original-switch validates state, hashes and stopped processes before
          // planning. A missing-catalog failure occurs before resource writes.
          if (!/^(?:Error: )?Missing compatible zh-Han[st] base\/dynamic catalogs\./.test(error.message)) throw error;
          await command('import-cache', language);
          return await command('switch', language);
        }
      }
      return await command(action, language);
    } finally { busy = false; }
  }
  async function sync() {
    if (options.autoSync !== true || options.allowWrites === false) return { state: 'disabled' };
    if (busy) return { state: 'busy' };
    busy = true;
    try {
      const detected = await command('detect');
      if (!detected.configured3p || detected.provider !== 'gateway') return lastSync = { state: 'not-3p-gateway' };
      const current = await command('status');
      if (current.status !== 'installed' || !current.intact) return lastSync = { state: 'not-installed-or-modified' };
      if (current.locale === locale()) return lastSync = { state: 'up-to-date', locale: locale() };
      await command('switch');
      return lastSync = { state: 'switched', locale: locale() };
    } catch (error) { return lastSync = { state: 'deferred', reason: error.message }; }
    finally { busy = false; }
  }
  return {
    execute, sync,
    runtimeConfiguration: configuration,
    async prepareRuntime(output) {
      if (mode !== 'original' || options.allowWrites === false) throw new Error('Runtime localization is disabled.');
      if (busy) throw new Error('Another plugin operation is running.');
      busy = true;
      try {
        const detected = await command('detect');
        if (!detected.configured3p || detected.provider !== 'gateway') throw new Error('Configure the original Claude for 3p Gateway first.');
        const config = configuration();
        const localCatalog = path.join(config.cwd, '.catalogs');
        const selectedCatalog = options.catalogDirectory ?? (fs.existsSync(localCatalog) ? localCatalog : catalog);
        const exportRuntime = () => runProcess(config, ['runtime-export', ...sourceArgs(), '--locale', locale(), '--catalog-dir', selectedCatalog, '--output', output]);
        try { return { ...await exportRuntime(), profileDirectory: detected.directory }; }
        catch (error) {
          if (!/^(?:Error: )?Missing compatible zh-Han[st] base\/dynamic catalogs\./.test(error.message)) throw error;
          try { await runProcess(config, ['catalog', 'cache', ...optional('--cache', options.cacheDirectory), '--locale', locale(), '--catalog-dir', selectedCatalog]); }
          catch (cacheError) {
            if (!/^(?:Error: )?No (?:language cache found\.|readable zh-Han[st] catalog in discovered caches\.)/.test(cacheError.message)) throw cacheError;
          }
          try { return { ...await exportRuntime(), profileDirectory: detected.directory }; }
          catch (missing) {
            if (!/^(?:Error: )?Missing compatible zh-Han[st] base\/dynamic catalogs\./.test(missing.message)) throw missing;
          }
          // Fresh installs need no manual cache/import command. Fetch accepts
          // official catalog URLs only; export still verifies compatibility.
          for (const kind of ['base', 'dynamic']) await runProcess(config, ['catalog', 'fetch', '--kind', kind, '--locale', locale(), '--catalog-dir', selectedCatalog]);
          return { ...await exportRuntime(), profileDirectory: detected.directory };
        }
      } finally { busy = false; }
    },
    state: () => ({ ...lastSync, busy, locale: locale(), allowWrites: options.allowWrites !== false }),
    paths: async () => {
      const discovered = await command('discover');
      return { mode, stateDirectory, source: options.sourceDirectory || discovered.source, root, profile: options.profileDirectory || discovered.profileDirectory,
        gateway: options.gatewayProfile || discovered.gatewayProfile, catalog, cache: options.cacheDirectory || '',
        caches: options.cacheDirectory ? [options.cacheDirectory] : discovered.caches || [], issues: discovered.issues || {},
        locale: locale(), allowWrites: options.allowWrites !== false, autoSync: false };
    }
  };
}
function runCLI(config, args) {
  return new Promise((resolve, reject) => {
    execFile(config.executable, [config.cli, ...args], { cwd: config.cwd, windowsHide: true, timeout: 45_000, maxBuffer: 8 * 1024 * 1024, shell: false }, (error, stdout, stderr) => {
      if (error) { reject(new Error(stderr.trim() || 'CLI failed or exceeded 45 seconds. Inspect the managed copy before retrying.')); return; }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('CLI did not return JSON.')); }
    });
  });
}
