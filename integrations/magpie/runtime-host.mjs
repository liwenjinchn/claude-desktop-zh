import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { defaultLayout } from '../../lib/discover.mjs';
import { assertPlainDirectory, localeValue, sha256 } from '../../lib/common.mjs';

const pluginDirectory = fileURLToPath(new URL('.', import.meta.url));
const projectDirectory = fileURLToPath(new URL('../../', import.meta.url));
const canonical = value => JSON.stringify(value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(v => JSON.parse(canonical(v)))
    : Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))]))
  : value);
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function identifiesPlugin(spec) {
  if (path.isAbsolute(spec)) {
    return [projectDirectory, pluginDirectory, path.join(pluginDirectory, 'server.mjs')].some(directory => samePath(spec, directory));
  }
  if (/^magpie-claude-zh(?:@[^/\s]+)?$/.test(spec)) return true;
  // GitHub installs use github:owner/repo until npm has a matching release.
  // Keep the previous repository URL working through GitHub's rename redirect.
  return /^(?:github:|(?:git\+)?https:\/\/github\.com\/)polang233\/claude-desktop(?:-3p)?-zh(?:\.git)?(?:#[a-z0-9._/-]+)?$/i.test(spec);
}

export function registrySnapshot(directory, options) {
  const file = path.join(directory, 'plugins.json');
  const bytes = fs.readFileSync(file), list = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(list.plugins)) throw new Error('Unknown plugin registry.');
  const ours = list.plugins.filter(entry => typeof entry.spec === 'string' && identifiesPlugin(entry.spec));
  if (ours.length !== 1 || ours[0].off === true || canonical(ours[0].options ?? {}) !== canonical(options)) throw new Error('Plugin registry changed or does not identify this plugin.');
  return { file, hash: sha256(bytes) };
}

// The Windows watcher checks both owner identity and this registry revision
// before UI operations. A retired but busy magpie host cannot keep an old
// language watcher alive after options are saved or the plugin is disabled.
export function createRuntimeHost(input, options, controller, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  const startProcess = dependencies.spawn ?? spawn;
  const registry = dependencies.registrySnapshot ?? registrySnapshot;
  let current = { state: 'not-started', locale: options.locale ?? 'zh-Hans', automaticNextLaunch: false };
  let starting, child, stopFile, stateFile, stopRequested = false;
  function publish(next) {
    const previous = current;
    current = next;
    if (stateFile) {
      try { fs.writeFileSync(stateFile, JSON.stringify({ ...current, parentProcessId: process.pid }, null, 2)); } catch {}
    }
    const message = next.state === 'waiting-for-normal-exit' && previous.state !== next.state
      ? '请通过 Claude 的“文件 → 退出”正常退出，等待中文准备完成。'
      : next.state === 'watching' && previous.state !== next.state && next.setupChanged === true
        ? '中文已准备好，从原来的入口打开 Claude 即可。' : null;
    if (message) {
      try { Promise.resolve(input.client?.tui?.showToast({ body: { title: 'Claude 中文', message, variant: 'info' } })).catch(() => {}); } catch {}
    }
  }
  function stop() {
    stopRequested = true;
    if (stopFile) fs.writeFileSync(stopFile, 'Plugin requested normal watcher stop.\n');
    publish({ ...current, state: 'stopping', automaticNextLaunch: false });
  }
  async function start() {
    if (starting) return starting;
    starting = (async () => {
      if (stopRequested) { current = { ...current, state: 'stopped' }; return current; }
      if (platform !== 'win32' || options.mode === 'copy' || options.allowWrites === false || options.runtimeAutoLoad === false) {
        current = { ...current, state: 'disabled' }; return current;
      }
      if (!input?.directory || !path.isAbsolute(input.directory)) {
        current = { ...current, state: 'unsupported-host' }; return current;
      }
      try {
        const locale = localeValue(options.locale);
        const config = controller.runtimeConfiguration();
        const owner = registry(input.directory, options);
        const parentStartedBefore = new Date().toISOString();
        current = { state: 'preparing', locale, automaticNextLaunch: false };
        const base = dependencies.runtimeDirectory ?? path.join(defaultLayout().originalStateDirectory, 'runtime');
        assertPlainDirectory(base);
        fs.mkdirSync(base, { recursive: true });
        const run = fs.mkdtempSync(path.join(base, 'host-'));
        stopFile = path.join(run, 'stop');
        stateFile = path.join(run, 'status.json');
        publish({ ...current, reportDirectory: run });
        const bundle = await controller.prepareRuntime(path.join(run, 'language.js'));
        if (!bundle.profileDirectory || !path.isAbsolute(bundle.profileDirectory)) throw new Error('Missing original profile binding.');
        if (sha256(fs.readFileSync(owner.file)) !== owner.hash || stopRequested) {
          publish({ ...current, state: stopRequested ? 'stopped' : 'owner-changed' }); return current;
        }
        const args = ['-NoProfile', '-NonInteractive', '-File', path.join(config.cwd, 'scripts', 'test-runtime-autoload.ps1'),
          '-Manifest', bundle.automationManifest, '-Watch', '-ActivateClaude', '-BuildDirectory', path.join(run, 'bridge'),
          '-ParentProcessId', String(process.pid), '-ParentExecutable', process.execPath, '-ParentStartedBefore', parentStartedBefore,
          '-RegistryFile', owner.file, '-RegistrySha256', owner.hash, '-StopFile', stopFile,
          '-SetupProfileDirectory', bundle.profileDirectory, '-SetupStateDirectory', path.join(base, 'setup-state'),
          '-SetupNodeExecutable', config.executable, '-SetupCliPath', config.cli];
        child = startProcess('powershell.exe', args, { cwd: config.cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
        publish({ ...current, state: 'starting', reportDirectory: run });
        let pending = '';
        child.stdout.on('data', chunk => {
          pending = (pending + chunk.toString()).slice(-32768);
          let end;
          while ((end = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, end).trim(); pending = pending.slice(end + 1);
            if (line.startsWith('Watching original Claude')) publish({ ...current, state: 'watching', automaticNextLaunch: true });
            else if (line.startsWith('{')) {
              try {
                const result = JSON.parse(line);
                if (result.state === 'WaitingForNormalExit') publish({ ...current, state: 'waiting-for-normal-exit', setupState: result.state, automaticNextLaunch: false });
                else if (result.state === 'RuntimeSetupReady') publish({ ...current, setupState: result.state, setupChanged: result.changed === true, setupJournal: result.journal });
                else if (typeof result.state === 'string') publish({ ...current, lastResult: result.state, lastApplicationPid: result.applicationPid ?? 0 });
              } catch { /* Only fixed JSON result lines are consumed. */ }
            }
          }
        });
        // Drain stderr without publishing paths, settings or native diagnostics.
        child.stderr.on('data', () => { publish({ ...current, runnerReportedError: true }); });
        child.once('error', () => { publish({ ...current, state: 'watcher-start-failed', automaticNextLaunch: false }); });
        child.once('exit', code => { publish({ ...current, state: 'stopped', exitCode: code, automaticNextLaunch: false }); });
        child.unref?.();
        child.stdout.unref?.();
        child.stderr.unref?.();
        return current;
      } catch {
        if (child && stopFile) { try { fs.writeFileSync(stopFile, 'Stop after watcher initialization failure.\n'); } catch {} }
        publish({ ...current, state: 'preparation-failed', automaticNextLaunch: false });
        return current;
      }
    })();
    return starting;
  }
  return { start, stop, state: () => ({ ...current }) };
}
