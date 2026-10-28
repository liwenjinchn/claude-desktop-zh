import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { defaultLayout } from '../../lib/discover.mjs';
import { assertPlainDirectory, localeValue, readJSON, sha256 } from '../../lib/common.mjs';
import { claudePids, findClaudeApp, macLayout } from '../../lib/macos.mjs';

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
  return /^(?:github:|(?:git\+)?https:\/\/github\.com\/)(?:polang233|liwenjinchn)\/claude-desktop(?:-3p)?-zh(?:-mac)?(?:\.git)?(?:#[a-z0-9._/-]+)?$/i.test(spec);
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
  const macStateDirectory = dependencies.macStateDirectory ?? macLayout().stateDirectory;
  const macPids = dependencies.macPids ?? (() => {
    return claudePids(findClaudeApp(options.sourceDirectory));
  });
  const macLastApplied = dependencies.macLastApplied ?? (() => {
    try { return readJSON(path.join(macStateDirectory, 'last-apply.json')); } catch { return null; }
  });
  const macApply = dependencies.macApply ?? ((locale, runtimeOwner, runtimeOwnerInstance) => controller.execute('mac-apply', 'mac-apply', { locale, runtimeOwner, runtimeOwnerInstance }));
  const macPollMs = dependencies.macPollMs ?? 3000;
  let current = { state: 'not-started', locale: options.locale ?? 'zh-Hans', automaticNextLaunch: false };
  let starting, child, stopFile, stateFile, stopRequested = false;
  const macOwner = randomUUID();
  let macRegistry = null;
  let macTimer = null, macApplying = false, macSeenPid = null, macAttempts = 0, macStateFile = null, macLockFile = null;
  function publish(next) {
    const previous = current;
    current = next;
    if (stateFile) {
      try { fs.writeFileSync(stateFile, JSON.stringify({ ...current, parentProcessId: process.pid }, null, 2)); } catch {}
    }
    if (macStateFile) {
      try { fs.writeFileSync(macStateFile, JSON.stringify({ ...current, parentProcessId: process.pid }, null, 2)); } catch {}
    }
    const macMessage = platform === 'darwin'
      ? next.state === 'watching' && previous.state !== next.state
        ? '已启用启动时自动加载；打开 Claude 后会自动加载中文。'
        : next.state === 'Applied' && previous.state !== next.state
          ? 'Claude 中文已加载。'
          : next.state === 'needs-accessibility' && previous.state !== next.state
            ? '需要给 magpie 授予辅助功能权限，才能自动加载中文。'
            : next.state === 'needs-setup' && previous.state !== next.state
              ? '请先正常退出 Claude，准备 allowDevTools 后再打开。'
              : null
      : null;
    const message = macMessage ?? (next.state === 'waiting-for-normal-exit' && previous.state !== next.state
      ? '请通过 Claude 的“文件 → 退出”正常退出，等待中文准备完成。'
      : next.state === 'watching' && previous.state !== next.state && next.setupChanged === true
        ? '中文已准备好，从原来的入口打开 Claude 即可。' : null);
    if (message) {
      try { Promise.resolve(input.client?.tui?.showToast({ body: { title: 'Claude 中文', message, variant: 'info' } })).catch(() => {}); } catch {}
    }
  }
  function stop() {
    const superseded = platform === 'darwin' && macOwnerChanged();
    stopRequested = true;
    if (macTimer) { clearInterval(macTimer); macTimer = null; }
    if (macLockFile) {
      try {
        const lock = readJSON(macLockFile);
        if (lock?.instance === macOwner) fs.unlinkSync(macLockFile);
      } catch {}
    }
    if (stopFile) fs.writeFileSync(stopFile, 'Plugin requested normal watcher stop.\n');
    if (superseded) { current = { ...current, state: 'stopped', automaticNextLaunch: false }; return; }
    publish({ ...current, state: platform === 'darwin' ? 'stopped' : 'stopping', automaticNextLaunch: false });
  }
  function macOwnerChanged() {
    if (!macLockFile) return false;
    try { return readJSON(macLockFile)?.instance !== macOwner; } catch { return true; }
  }
  function macRegistryChanged() {
    try { return !macRegistry || sha256(fs.readFileSync(macRegistry.file)) !== macRegistry.hash; }
    catch { return true; }
  }
  async function macTick() {
    if (stopRequested || macApplying) return;
    if (macOwnerChanged()) {
      // A newer plugin host owns the watcher. Stop without overwriting its state.
      stopRequested = true;
      if (macTimer) { clearInterval(macTimer); macTimer = null; }
      return;
    }
    if (macRegistryChanged()) { stop(); return; }
    let pids;
    try { pids = macPids() || []; } catch {
      publish({ ...current, state: 'discovery-failed', automaticNextLaunch: true, note: '无法识别 Claude 安装资源；请检查版本兼容性。' });
      return;
    }
    const pid = pids[0] ?? null;
    if (!pid) {
      if (macSeenPid !== null) { macSeenPid = null; macAttempts = 0; }
      if (current.state !== 'waiting-for-claude') publish({ ...current, state: 'waiting-for-claude', automaticNextLaunch: true, appliedPid: null });
      return;
    }
    if (pid !== macSeenPid) { macSeenPid = pid; macAttempts = 0; current = { ...current, note: undefined, lastResult: undefined }; }
    if (current.state === 'Applied' && current.appliedPid === pid) return;
    if (macAttempts >= 8) {
      if (current.state !== 'apply-failed' && current.state !== 'needs-accessibility' && current.state !== 'needs-setup') {
        publish({ ...current, state: 'apply-failed', automaticNextLaunch: true, appliedPid: pid });
      }
      return;
    }
    if (macAttempts === 0) {
      const last = macLastApplied();
      if (last && last.state === 'Applied' && last.pid === pid && last.locale === localeValue(options.locale)) {
        publish({ ...current, state: 'Applied', automaticNextLaunch: true, appliedPid: pid, lastResult: 'already-applied' });
        return;
      }
    }
    macApplying = true;
    try {
      const result = await macApply(localeValue(options.locale), macLockFile, macOwner);
      if (stopRequested || macOwnerChanged()) return;
      if (macRegistryChanged()) { stop(); return; }
      if (result?.state === 'RuntimeSetupRequired') {
        macAttempts = 8;
        publish({ ...current, state: 'needs-setup', automaticNextLaunch: true, appliedPid: pid });
        return;
      }
      macAttempts = 0;
      const state = result?.state === 'PartiallyApplied' ? 'PartiallyApplied' : result?.state === 'Applied' ? 'Applied' : 'apply-failed';
      publish({ ...current, state, automaticNextLaunch: true, appliedPid: pid, lastResult: result?.state, pages: Array.isArray(result?.pages) ? result.pages.length : 0 });
    } catch (error) {
      if (stopRequested || macOwnerChanged()) return;
      if (macRegistryChanged()) { stop(); return; }
      const message = String(error?.message || error);
      if (/Accessibility permission/i.test(message)) {
        macAttempts = 8;
        publish({ ...current, state: 'needs-accessibility', automaticNextLaunch: true, appliedPid: pid, note: '给 magpie 授予辅助功能权限后重试。' });
      } else if (/not running|No 3p Gateway|not configured for 3p|allowDevTools is not enabled/i.test(message)) {
        macAttempts = 8;
        publish({ ...current, state: 'apply-failed', automaticNextLaunch: true, appliedPid: pid, note: '请确认 Claude 是第三方 Gateway 模式并已开启 allowDevTools。' });
      } else {
        macAttempts += 1;
        publish({ ...current, state: 'waiting-for-claude', automaticNextLaunch: true, appliedPid: pid, note: 'Claude 窗口尚未就绪，正在重试。' });
      }
    } finally { macApplying = false; }
  }
  function startMacWatcher() {
    if (options.runtimeAutoLoad === false) {
      current = { ...current, state: 'disabled', automaticNextLaunch: false };
      return current;
    }
    let locale;
    try { locale = localeValue(options.locale); } catch { current = { ...current, state: 'disabled' }; return current; }
    if (!input?.directory || !path.isAbsolute(input.directory)) {
      current = { ...current, state: 'unsupported-host', automaticNextLaunch: false }; return current;
    }
    try { macRegistry = registry(input.directory, options); }
    catch { current = { ...current, state: 'owner-changed', automaticNextLaunch: false }; return current; }
    macStateFile = path.join(macStateDirectory, 'watcher.json');
    macLockFile = path.join(macStateDirectory, 'watcher.lock');
    try {
      fs.mkdirSync(path.dirname(macStateFile), { recursive: true });
      fs.writeFileSync(macLockFile, JSON.stringify({ instance: macOwner, pid: process.pid, startedAt: new Date().toISOString(), registryFile: macRegistry.file, registrySha256: macRegistry.hash }, null, 2));
    } catch { current = { ...current, state: 'preparation-failed', automaticNextLaunch: false }; return current; }
    publish({ ...current, state: 'watching', locale, automaticNextLaunch: true, appliedPid: macSeenPid });
    macTimer = setInterval(() => { void macTick(); }, macPollMs);
    macTimer.unref?.();
    void macTick();
    return current;
  }
  async function start() {
    if (starting) return starting;
    starting = (async () => {
      if (stopRequested) { current = { ...current, state: 'stopped' }; return current; }
      if (platform === 'darwin' && options.mode !== 'copy' && options.allowWrites !== false) {
        // The renderer keeps its own language store. A light watcher applies
        // after each new Claude process; it never launches or closes Claude.
        return startMacWatcher();
      }
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
