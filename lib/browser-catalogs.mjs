// Explicit, user-initiated macOS Chrome download. Never reads cookies or enables
// remote debugging/AppleScript JavaScript. Only owns the tabs it creates.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { localeValue, assertPlainDirectory, inside } from './common.mjs';
import { parseCatalog, saveCatalog } from './catalogs.mjs';
import { runtimeSpec } from './runtime-localization.mjs';
import { findClaudeApp } from './macos.mjs';
const exec = promisify(execFile);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export const officialCatalogURL = (locale, kind) => {
  localeValue(locale);
  if (!['base', 'dynamic'].includes(kind)) throw new Error('Unsupported catalog kind.');
  return `https://claude.ai/i18n/${kind === 'dynamic' ? 'dynamic/' : ''}${locale}.json`;
};
const openScript = `on run argv
 tell application id "com.google.Chrome"
  set w to make new window
  set t to active tab of w
  set URL of t to item 1 of argv
  activate
  return (id of w as text) & "|" & (id of t as text)
 end tell
end run`;
// IDs and URLs are rechecked on every operation; unrelated tabs are untouched.
const ownedScript = `on run argv
 tell application id "com.google.Chrome"
  repeat with w in windows
   if (id of w as text) is item 1 of argv then
    repeat with t in tabs of w
     if (id of t as text) is item 2 of argv then
      if item 4 of argv is not "close" then
       if loading of t then return "loading"
       if URL of t is "about:blank" then return "loading"
      end if
      if URL of t is not item 3 of argv then error "Official catalog tab navigated away."
      if item 4 of argv is "close" then
       close t
      else
       if loading of t then return "loading"
       save t in (POSIX file (item 4 of argv)) as "only html"
      end if
      return "ok"
     end if
    end repeat
   end if
  end repeat
 end tell
 error "Official catalog tab was closed."
end run`;
async function script(source, args) {
  try { return (await exec('osascript', ['-e', source, ...args], { timeout: 8000, maxBuffer: 16384 })).stdout.trim(); }
  catch (e) {
    const detail = String(e.stderr || e.message);
    if (/not authorized|not permitted|1743/i.test(detail)) throw new Error('请允许 magpie 自动化 Google Chrome，然后重新点击更新；插件不会自动修改系统权限。');
    if (/navigated away|was closed/.test(detail)) throw new Error('官方词库页面已关闭或离开官方地址；本次更新已取消。');
    throw new Error('浏览器保存官方词库失败。请确认已安装 Google Chrome，并允许 magpie 控制它。');
  }
}
export async function downloadBrowserCatalog(url, folder, { run = script, sleep = wait, timeoutMs = 90000 } = {}) {
  const address = new URL(url);
  if (address.origin !== 'https://claude.ai' || !/^\/i18n\/(dynamic\/)?zh-Han[st]\.json$/.test(address.pathname) || address.search || address.hash || address.username || address.password) throw new Error('Only official catalog URLs are accepted.');
  const identity = await run(openScript, [url]);
  if (!/^\d+\|\d+$/.test(identity)) throw new Error('Cannot identify the new catalog tab.');
  const ids = identity.split('|');
  const end = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < end) {
    const file = path.join(folder, `download-${attempt++}.html`);
    const status = await run(ownedScript, [...ids, url, file]);
    if (status === 'ok') {
      // Chrome writes asynchronously and uses .html even for raw JSON.
      for (let n = 0; n < 6 && Date.now() < end; n++) {
        await sleep(500);
        try {
          const stat = fs.lstatSync(file);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 40 * 1024 * 1024) throw new Error('Invalid browser download.');
          const bytes = fs.readFileSync(file);
          parseCatalog(bytes); // Challenge HTML, partial downloads and login pages fail.
          await run(ownedScript, [...ids, url, 'close']);
          return bytes;
        } catch (e) {
          if (/Invalid browser download|已取消/.test(e.message)) throw e;
        }
      }
    }
    await sleep(1000);
  }
  throw new Error('浏览器尚未取得官方 JSON 词库。请在保留的 Chrome 页面完成网站验证后重试；旧词库未替换。');
}
export async function updateBrowserCatalogs(directory, locale, source, dependencies = {}) {
  if ((dependencies.platform ?? process.platform) !== 'darwin') throw new Error('Browser catalog update currently supports macOS Google Chrome only.');
  localeValue(locale);
  assertPlainDirectory(directory);
  const app = (dependencies.findApp ?? findClaudeApp)(source);
  const stage = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'claude-zh-browser-'));
  const download = dependencies.download ?? downloadBrowserCatalog;
  const validate = dependencies.validate ?? runtimeSpec;
  try {
    for (const kind of ['base', 'dynamic']) {
      const folder = path.join(stage, kind); fs.mkdirSync(folder);
      const url = officialCatalogURL(locale, kind);
      const data = await download(url, folder);
      saveCatalog(stage, locale, kind, data, { source: 'official-browser-download', url });
    }
    // Both catalogs must pass the existing runtime + 95% compatibility checks
    // together before any downloaded data enters the active catalog store.
    const spec = validate(app, stage, locale);
    const imported = [];
    for (const kind of ['base', 'dynamic']) {
      const from = path.join(stage, locale, kind), to = path.join(directory, locale, kind);
      fs.mkdirSync(to, { recursive: true });
      for (const name of fs.readdirSync(from)) {
        const target = inside(to, name), bytes = fs.readFileSync(path.join(from, name));
        if (fs.existsSync(target)) {
          if (!name.endsWith('.meta.json') && !fs.readFileSync(target).equals(bytes)) throw new Error('Existing catalog hash mismatch.');
          continue;
        }
        // Publish a complete immutable file atomically, without replacing an existing one.
        const temporary = path.join(to, `.browser-${process.pid}-${name}`);
        try {
          fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
          try { fs.linkSync(temporary, target); }
          catch (error) { if (error.code !== 'EEXIST' || (!name.endsWith('.meta.json') && !fs.readFileSync(target).equals(bytes))) throw error; }
        } finally { fs.rmSync(temporary, { force: true }); }
        if (!name.endsWith('.meta.json')) imported.push({ kind, sha256: name.slice(0, -5) });
      }
    }
    return { state: 'CatalogsUpdated', locale, source: 'official-browser-download', imported,
      baseMessages: Object.keys(spec.base).length, dynamicMessages: Object.keys(spec.dynamic).length };
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
