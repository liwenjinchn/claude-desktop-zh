// macOS runtime localization.
//
// Claude's bundled frontend only ships a subset of official catalogs. The app
// itself exposes a developer-only main-process inspector (Developer → Enable
// Main Process Debugger). While it is open, this module sends the official
// catalogs into the existing app:// renderer and calls the app's own language
// store. It never writes the .app, app.asar, its signature, or the gateway.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { atomicWrite, assertPlainDirectory, inside, localeValue, readJSON } from './common.mjs';
import { activateRuntimeCatalog, runtimeSpec } from './runtime-localization.mjs';
import { detect3p } from './install.mjs';

export const INSPECTOR_PORT = 9229;
export const DEFAULT_APP = '/Applications/Claude.app';
const APP_EXECUTABLE = path.join('Contents', 'MacOS', 'Claude');
const DEV_SETTINGS = 'developer_settings.json';

export function macLayout(env = process.env) {
  const home = env.HOME || os.homedir();
  const base = path.join(home, 'Library', 'Application Support', 'claude-desktop-zh');
  return {
    base,
    catalogDirectory: path.join(base, 'catalogs'),
    stateDirectory: path.join(base, 'mac'),
  };
}

export function assertMacOS(platform = process.platform) {
  if (platform !== 'darwin') throw new Error('This command is macOS-only.');
}

export function findClaudeApp(source) {
  const candidates = source ? [source] : [DEFAULT_APP, path.join(os.homedir(), 'Applications', 'Claude.app')];
  for (const candidate of candidates) {
    const app = path.resolve(candidate);
    if (!fs.existsSync(path.join(app, APP_EXECUTABLE))) continue;
    if (!fs.existsSync(path.join(app, 'Contents', 'Resources', 'ion-dist', 'i18n', 'en-US.json'))) continue;
    return app;
  }
  if (source) throw new Error('The selected directory is not a readable Claude.app bundle: ' + path.resolve(source));
  throw new Error('Claude.app was not found in /Applications or ~/Applications. Pass --source <Claude.app>.');
}

export function appVersion(app) {
  try {
    return execFileSync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(app, 'Contents', 'Info.plist')], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch { return null; }
}

function processLines(exec) {
  return exec('ps', ['-axo', 'pid=,comm='], { encoding: 'utf8', timeout: 5000 }).split('\n');
}

// Match the executable path itself (ps comm), not helper processes whose
// arguments happen to contain the same path.
export function claudePids(app, exec = execFileSync) {
  const executable = path.resolve(app, APP_EXECUTABLE);
  const result = [];
  for (const line of processLines(exec)) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    if (match[2] === executable) result.push(Number(match[1]));
  }
  return result.sort((a, b) => a - b);
}

export function runningClaude(source) {
  const app = findClaudeApp(source);
  const pids = claudePids(app);
  if (pids.length > 1) throw new Error('More than one Claude.app process is running. Quit the extra instances before applying Chinese.');
  return { app, pid: pids[0] ?? null, executable: path.resolve(app, APP_EXECUTABLE) };
}

export function openClaude(app) {
  spawn('open', [app], { detached: true, stdio: 'ignore' }).unref();
}

export async function waitForClaudePid(app, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pids = claudePids(app);
    if (pids.length === 1) return pids[0];
    if (pids.length > 1) throw new Error('More than one Claude.app process started.');
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('Claude did not start within 20 seconds.');
}

export function macProfile(env = process.env) {
  const home = env.HOME || os.homedir();
  const candidates = [
    path.join(home, 'Library', 'Application Support', 'Claude-3p'),
    path.join(home, 'Library', 'Application Support', 'Claude'),
  ];
  const failures = [];
  for (const candidate of candidates) {
    try {
      const detected = detect3p(candidate);
      if (detected.configured3p && detected.provider === 'gateway') return detected;
    } catch (error) { failures.push(error.message); }
  }
  throw new Error('No 3p Gateway profile found under ~/Library/Application Support. Configure Claude for third-party Gateway mode first.');
}

export function readDeveloperSettings(profileDirectory) {
  const target = path.join(profileDirectory, DEV_SETTINGS);
  if (!fs.existsSync(target)) return { enabled: false, exists: false, path: target };
  try {
    const value = readJSON(target);
    return { enabled: value?.allowDevTools === true, exists: true, path: target };
  } catch {
    return { enabled: false, exists: true, path: target, malformed: true };
  }
}

export function accessibilityEnabled(exec = execFileSync) {
  try {
    return exec('osascript', ['-e', 'tell application "System Events" to get UI elements enabled'], { encoding: 'utf8', timeout: 5000 }).trim() === 'true';
  } catch { return false; }
}

function inspectorMenuScript(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid Claude process ID.');
  return `tell application "System Events"
  set p to first process whose unix id is ${pid}
  try
    set visible of p to true
  end try
  try
    set frontmost of p to true
  end try
  delay 0.4
  set target to missing value
  repeat with bar in menu bar items of menu bar 1 of p
    try
      repeat with mi in menu items of menu 1 of bar
        set n to name of mi
        if n is "Enable Main Process Debugger" or n is "启用主进程调试器" or n contains "Main Process Debugger" or n contains "主进程调试器" then
          set target to mi
          exit repeat
        end if
      end repeat
    end try
    if target is not missing value then exit repeat
  end repeat
  if target is missing value then error "The main process debugger menu item is unavailable. Set allowDevTools in developer_settings.json, restart Claude, and check that Developer Mode is not disabled by policy."
  click target
  return "clicked"
end tell`;
}

export async function openMainProcessInspector(pid, { manual = false, exec = execFileSync, app = null, port = INSPECTOR_PORT, timeoutMs = 8000 } = {}) {
  if (manual) return { opened: false, alreadyOpen: null, manual: true };
  if (await portOpen(port)) return { opened: false, alreadyOpen: true };
  if (app) { try { exec('open', [app], { timeout: 5000 }); } catch {} }
  if (!accessibilityEnabled(exec)) {
    throw new Error('macOS Accessibility permission is required to open Claude\'s developer menu. Grant it to Terminal (or magpie) in System Settings → Privacy & Security → Accessibility, or open Developer → Enable Main Process Debugger manually and rerun with --manual.');
  }
  // The menu item's displayed checkmark can lag behind inspector.close(); the
  // click handler uses the real inspector state, so click once when the port is closed.
  exec('osascript', ['-e', inspectorMenuScript(pid)], { encoding: 'utf8', timeout: 20000 });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return { opened: true, alreadyOpen: false };
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Claude's main process debugger did not open on 127.0.0.1:${port}. The developer menu item may be unavailable, or another inspector may be using the port.`);
}

export async function closeInspectorByMenu(pid, { exec = execFileSync, port = INSPECTOR_PORT } = {}) {
  if (!await portOpen(port)) return true;
  try {
    exec('osascript', ['-e', inspectorMenuScript(pid)], { encoding: 'utf8', timeout: 20000 });
  } catch { return false; }
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!await portOpen(port)) return true;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return false;
}

export async function waitForInspectorTarget(pid, executable, { port = INSPECTOR_PORT, timeoutMs = 12000, fetchImpl = fetch } = {}) {
  const expected = path.resolve(executable);
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1200) });
      if (response.ok) {
        const list = await response.json();
        const target = list.find(item => item.type === 'node' && typeof item.title === 'string' &&
          item.title.includes(`[${pid}]`) && item.title.includes(expected));
        if (target) return target;
        const other = list.find(item => item.type === 'node');
        if (other) throw new Error(`Port ${port} is already used by another Node inspector (${other.title || 'unknown target'}). Close it and retry.`);
      }
    } catch (error) { lastError = error; if (/already used/.test(error.message)) throw error; }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Claude's main process debugger did not open on 127.0.0.1:${port}. ${lastError ? lastError.message : 'The developer menu item may be unavailable.'}`);
}

export class InspectorClient {
  constructor(ws) {
    this.ws = ws; this.nextId = 1; this.pending = new Map(); ws.onerror = () => {};
    ws.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      const resolve = message.id && this.pending.get(message.id);
      if (!resolve) return;
      this.pending.delete(message.id);
      resolve(message);
    };
    ws.onclose = () => {
      for (const resolve of this.pending.values()) resolve({ error: { message: 'Inspector connection closed.' } });
      this.pending.clear();
    };
  }

  static async connect(url, { timeoutMs = 10000 } = {}) {
    if (typeof WebSocket !== 'function') throw new Error('This Node.js runtime has no WebSocket client. Use Node.js 22+.');
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Inspector connection timed out.')), timeoutMs);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('Inspector connection failed.')); };
    });
    return new InspectorClient(ws);
  }

  send(method, params = {}, { timeoutMs = 30000 } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out.`)); }, timeoutMs);
      this.pending.set(id, message => { clearTimeout(timer); resolve(message); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, { timeoutMs = 60000 } = {}) {
    if (!this.runtimeEnabled) {
      const enabled = await this.send('Runtime.enable', {}, { timeoutMs: 5000 });
      if (enabled.error) throw new Error(enabled.error.message || 'Runtime.enable failed.');
      this.runtimeEnabled = true;
    }
    const response = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    }, { timeoutMs });
    if (response.error) throw new Error(response.error.message || 'Inspector evaluation failed.');
    if (response.result?.exceptionDetails) {
      const detail = response.result.exceptionDetails;
      throw new Error(detail.exception?.description || detail.text || 'Inspector evaluation failed.');
    }
    return response.result?.result?.value;
  }

  close() { try { this.ws.close(); } catch {} }

  static async closeInspector(client, { port = INSPECTOR_PORT } = {}) {
    try {
      await Promise.race([
        client.evaluate("process.mainModule.require('node:inspector').close(); 'closed'", { timeoutMs: 2000 }),
        new Promise(resolve => setTimeout(resolve, 1500)),
      ]);
    } catch { /* The inspector closes the connection before it can answer. */ }
    client.close();
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (!await portOpen(port)) return true;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return false;
  }
}

export async function portOpen(port, host = '127.0.0.1', timeoutMs = 500) {
  const net = await import('node:net');
  return await new Promise(resolve => {
    const socket = net.connect({ port, host });
    const done = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export function buildMacActivationCode(spec) {
  const activate = activateRuntimeCatalog.toString();
  return `(async () => {
  const spec = ${JSON.stringify(spec)};
  if (globalThis.claudeChineseRuntime) {
    const current = globalThis.claudeChineseRuntime.status();
    if (current.locale === spec.locale && !current.restored) return { skipped: true, status: current };
    globalThis.claudeChineseRuntime.restore();
  }
  const activation = (${activate})(spec);
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Activation timed out after 25 seconds.')), 25000));
  await Promise.race([activation, timeout]);
  const deadline = Date.now() + 15000;
  let status = globalThis.claudeChineseRuntime ? globalThis.claudeChineseRuntime.status() : null;
  while (Date.now() < deadline) {
    status = globalThis.claudeChineseRuntime ? globalThis.claudeChineseRuntime.status() : null;
    if (status && status.messagesLocale === spec.locale && !status.restored) {
      return { skipped: false, status };
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Chinese catalog application was not acknowledged. ' + JSON.stringify(status));
})()`;
}

export const RESTORE_CODE = `(() => {
  if (!globalThis.claudeChineseRuntime) return { restored: false, reason: 'not-active' };
  const before = globalThis.claudeChineseRuntime.status();
  globalThis.claudeChineseRuntime.restore();
  return { restored: true, before, stillActive: !!globalThis.claudeChineseRuntime };
})()`;

function mainProcessExpression(codePath, { restore = false, locale = '' } = {}) {
  const codeSource = restore ? JSON.stringify(RESTORE_CODE) : `fs.readFileSync(${JSON.stringify(codePath)}, 'utf8')`;
  return `(async () => {
  const req = process.mainModule.require.bind(process.mainModule);
  const fs = req('fs');
  const { webContents } = req('electron');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    wait(ms).then(() => { throw new Error(label + ' timed out.'); }),
  ]);
  const code = ${codeSource};
  const desired = ${JSON.stringify(locale)};
  const deadline = Date.now() + 30000;
  let pages = [];
  while (Date.now() < deadline) {
    pages = webContents.getAllWebContents().filter(w => !w.isDestroyed() && w.getURL().startsWith('app://localhost/'));
    if (pages.length) break;
    await wait(300);
  }
  if (!pages.length) throw new Error('No app://localhost window. Open the 3p Claude window before applying Chinese.');
  const results = [];
  for (const w of pages) {
    // Never print page text, titles, conversation data, or gateway credentials.
    const base = { id: w.id, origin: 'app://localhost' };
    try {
      ${restore
        ? `const result = await withTimeout(w.executeJavaScript(code, true), 10000, 'Page restore');`
        : `const current = await withTimeout(w.executeJavaScript('globalThis.claudeChineseRuntime ? globalThis.claudeChineseRuntime.status() : null', true), 5000, 'Status probe');
      if (current && current.locale === desired && !current.restored) {
        results.push({ ...base, result: { skipped: true, status: current } });
        continue;
      }
      const result = await withTimeout(w.executeJavaScript(code, true), 30000, 'Page activation');`}
      results.push({ ...base, result });
    } catch (error) { results.push({ ...base, error: String(error && error.message || error) }); }
  }
  return results;
})()`;
}

export async function injectCodeIntoPages(client, codePath, locale) {
  return await client.evaluate(mainProcessExpression(codePath, { locale }), { timeoutMs: 90000 });
}

export async function restoreInPages(client) {
  return await client.evaluate(mainProcessExpression(null, { restore: true }), { timeoutMs: 30000 });
}

function resolveCatalogDirectory(options) {
  if (options.catalogDirectory) return path.resolve(options.catalogDirectory);
  if (fs.existsSync(path.resolve('.catalogs'))) return path.resolve('.catalogs');
  return macLayout().catalogDirectory;
}

function resolveStateDirectory(options) {
  return path.resolve(options.stateDirectory || macLayout().stateDirectory);
}

function writeState(directory, name, value) {
  assertPlainDirectory(directory);
  fs.mkdirSync(directory, { recursive: true });
  atomicWrite(path.join(directory, name), JSON.stringify(value, null, 2) + '\n');
}

function summarizePages(pages) {
  return pages.map(page => ({
    id: page.id, origin: page.origin ?? 'app://localhost',
    skipped: page.result?.skipped === true,
    status: page.result?.status ?? null,
    restored: page.result?.restored ?? null,
    error: page.error ?? null,
  }));
}

export async function applyMacLocalization(options = {}, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  assertMacOS(platform);
  const findApp = dependencies.findApp ?? findClaudeApp;
  const pids = dependencies.pids ?? claudePids;
  const getProfile = dependencies.profile ?? macProfile;
  const devtools = dependencies.devtools ?? readDeveloperSettings;
  const specFor = dependencies.spec ?? runtimeSpec;
  const openInspector = dependencies.openInspector ?? openMainProcessInspector;
  const waitTarget = dependencies.waitTarget ?? waitForInspectorTarget;
  const connect = dependencies.connect ?? (url => InspectorClient.connect(url));
  const inject = dependencies.inject ?? injectCodeIntoPages;
  const closeClient = dependencies.closeClient ?? InspectorClient.closeInspector;
  const app = findApp(options.source);
  let pid = pids(app)[0] ?? null;
  if (pid === null && options.launch) {
    openClaude(app);
    pid = await waitForClaudePid(app);
  }
  if (pid === null) throw new Error('Claude is not running. Open the 3p window first, or pass --launch.');
  const running = pids(app);
  if (running.length > 1) throw new Error('More than one Claude.app process is running. Quit the extra instances before applying Chinese.');
  const profile = getProfile(options.profileDirectory);
  if (!profile.configured3p || profile.provider !== 'gateway') throw new Error('Original Claude is not configured for 3p Gateway.');
  const dev = devtools(profile.directory);
  if (!dev.enabled) {
    return { state: 'RuntimeSetupRequired', locale: options.locale ?? 'zh-Hans', profileDirectory: profile.directory,
      note: 'Quit Claude normally, run runtime-setup, then reopen it. allowDevTools must be enabled before the app starts.' };
  }
  const locale = localeValue(options.locale);
  const spec = specFor(app, resolveCatalogDirectory(options), locale);
  const code = buildMacActivationCode(spec);
  const stateDirectory = resolveStateDirectory(options);
  assertPlainDirectory(stateDirectory);
  fs.mkdirSync(stateDirectory, { recursive: true });
  const codePath = inside(stateDirectory, `language-${locale}.js`);
  atomicWrite(codePath, code);
  atomicWrite(codePath + '.spec.json', JSON.stringify(spec));
  const opened = await openInspector(pid, { manual: options.manual === true, app });
  let pages;
  let client;
  try {
    const target = await waitTarget(pid, path.resolve(app, APP_EXECUTABLE), { port: INSPECTOR_PORT });
    client = await connect(target.webSocketDebuggerUrl);
    pages = await inject(client, codePath, locale);
  } finally {
    if (client && opened.opened && options.keepInspector !== true) {
      const closed = await closeClient(client).catch(() => false);
      client.close();
      if (!closed) closeInspectorByMenu(pid);
    } else if (client) client.close();
    else if (opened.opened && options.keepInspector !== true) closeInspectorByMenu(pid);
  }
  if (!Array.isArray(pages) || !pages.length) throw new Error('No app://localhost window was found. Open the 3p Claude window before applying Chinese.');
  const failed = pages.filter(page => page.error);
  const record = {
    schema: 1, state: failed.length === pages.length ? 'Failed' : failed.length ? 'PartiallyApplied' : 'Applied',
    appliedAt: new Date().toISOString(), locale, app, appVersion: appVersion(app), pid,
    runtimeSha256: spec.runtimeSha256, baseMessages: Object.keys(spec.base).length, dynamicMessages: Object.keys(spec.dynamic).length,
    inspectorOpened: opened.opened === true, pages: summarizePages(pages),
  };
  writeState(stateDirectory, 'last-apply.json', record);
  if (failed.length === pages.length) throw new Error('Chinese was not applied: ' + failed.map(page => page.error).join('; '));
  return record;
}

export async function restoreMacLocalization(options = {}, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  assertMacOS(platform);
  const findApp = dependencies.findApp ?? findClaudeApp;
  const pids = dependencies.pids ?? claudePids;
  const getProfile = dependencies.profile ?? macProfile;
  const devtools = dependencies.devtools ?? readDeveloperSettings;
  const openInspector = dependencies.openInspector ?? openMainProcessInspector;
  const waitTarget = dependencies.waitTarget ?? waitForInspectorTarget;
  const connect = dependencies.connect ?? (url => InspectorClient.connect(url));
  const restore = dependencies.restore ?? restoreInPages;
  const closeClient = dependencies.closeClient ?? InspectorClient.closeInspector;
  const app = findApp(options.source);
  const running = pids(app);
  if (running.length === 0) throw new Error('Claude is not running.');
  if (running.length > 1) throw new Error('More than one Claude.app process is running. Quit the extra instances first.');
  const pid = running[0];
  const profile = getProfile(options.profileDirectory);
  if (!profile.configured3p || profile.provider !== 'gateway') throw new Error('Original Claude is not configured for 3p Gateway.');
  const dev = devtools(profile.directory);
  if (!dev.enabled) throw new Error('allowDevTools is not enabled. Open Developer → Enable Main Process Debugger manually, or restore the setting after quitting Claude.');
  const opened = await openInspector(pid, { manual: options.manual === true, app });
  let pages;
  let client;
  try {
    const target = await waitTarget(pid, path.resolve(app, APP_EXECUTABLE), { port: INSPECTOR_PORT });
    client = await connect(target.webSocketDebuggerUrl);
    pages = await restore(client);
  } finally {
    if (client && opened.opened && options.keepInspector !== true) {
      const closed = await closeClient(client).catch(() => false);
      client.close();
      if (!closed) closeInspectorByMenu(pid);
    } else if (client) client.close();
    else if (opened.opened && options.keepInspector !== true) closeInspectorByMenu(pid);
  }
  const stateDirectory = resolveStateDirectory(options);
  const record = {
    schema: 1, state: 'Restored', restoredAt: new Date().toISOString(), app, appVersion: appVersion(app), pid,
    pages: summarizePages(pages || []),
  };
  writeState(stateDirectory, 'last-restore.json', record);
  return record;
}

export async function macStatus(options = {}) {
  const app = findClaudeApp(options.source);
  const pids = claudePids(app);
  let profile = null, dev = null;
  try { profile = macProfile(); dev = readDeveloperSettings(profile.directory); } catch {}
  const stateDirectory = resolveStateDirectory(options);
  const read = name => { try { return readJSON(path.join(stateDirectory, name)); } catch { return null; } };
  return {
    platform: 'darwin', app, appVersion: appVersion(app), running: pids.length > 0, pid: pids[0] ?? null,
    profileDirectory: profile?.directory ?? null, configured3p: !!profile, devtoolsEnabled: dev?.enabled === true,
    inspectorOpen: await portOpen(INSPECTOR_PORT), lastApply: read('last-apply.json'), lastRestore: read('last-restore.json'),
  };
}
