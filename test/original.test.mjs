import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyOriginal, restoreOriginal, switchOriginal, statusOriginal, checkOriginal, planOriginal } from '../lib/original.mjs';
import { saveCatalog } from '../lib/catalogs.mjs';
import { readJSON, sha256 } from '../lib/common.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'zh-original-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'application'), state = path.join(root, 'state'), catalogs = path.join(root, 'catalogs');
  const resources = path.join(source, 'resources');
  const english = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => ['key' + i, 'English']));
  fs.mkdirSync(path.join(resources, 'ion-dist', 'assets'), { recursive: true });
  fs.mkdirSync(path.join(resources, 'ion-dist', 'i18n', 'dynamic'), { recursive: true });
  fs.writeFileSync(path.join(source, 'claude.exe'), 'inert test fixture');
  fs.writeFileSync(path.join(resources, 'app.asar'), 'fixture archive');
  const langs = '["en-US","de-DE","pt-BR","id-ID"]';
  fs.writeFileSync(path.join(resources, 'ion-dist/assets/runtime.js'), `/* "spa:locale" */const a=${langs},b=${langs};function Zz(){let e=[];try{if(typeof document<"u"){let t=document.querySelector('meta[name="i18n-catalogs"]')}}catch{}return e}function Load(e){for(let[t,n,r]of Zz())if(t===e)return{base:"unused"}}`);
  fs.writeFileSync(path.join(resources, 'ion-dist/assets/selector.js'), 'const names={"en-US":{name:"English (United States)",localName:"English (United States)"},};');
  fs.writeFileSync(path.join(resources, 'ion-dist/i18n/en-US.json'), JSON.stringify(english));
  fs.writeFileSync(path.join(resources, 'ion-dist/i18n/dynamic/en-US.json'), '{"hello":"Hello"}');
  for (const locale of ['zh-Hans', 'zh-Hant']) {
    saveCatalog(catalogs, locale, 'base', Buffer.from(JSON.stringify(Object.fromEntries(Object.keys(english).map(k => [k, '中文'])))), { source: 'fixture' });
    saveCatalog(catalogs, locale, 'dynamic', Buffer.from('{"hello":"你好"}'), { source: 'fixture' });
  }
  const userdata = path.join(root, 'existing-userdata'); fs.mkdirSync(userdata);
  fs.writeFileSync(path.join(userdata, 'settings.json'), '{"mcpServers":{"example":{}},"theme":"dark","locale":"en-US"}');
  fs.writeFileSync(path.join(userdata, 'sessions.db'), 'existing sessions');
  const originals = ['ion-dist/assets/runtime.js', 'ion-dist/assets/selector.js', 'app.asar'].map(relative => [relative, sha256(fs.readFileSync(path.join(resources, relative)))]);
  return { root, source, state, catalogs, resources, userdata, originals };
}

test('original mode applies, switches, restores and reapplies without creating user data', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const dataBefore = fs.readdirSync(f.userdata).map(name => [name, fs.readFileSync(path.join(f.userdata, name), 'utf8')]);
  assert.equal(applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans').status, 'installed');
  assert.equal(statusOriginal(f.state).intact, true);
  assert.equal(planOriginal(undefined, f.state, f.catalogs, 'zh-Hant').locale, 'zh-Hant');
  assert.equal(checkOriginal(f.source, f.state).eligible, true);
  assert.equal(switchOriginal(f.state, f.catalogs, 'zh-Hant').locale, 'zh-Hant');
  assert.equal(statusOriginal(f.state).intact, true);
  assert.equal(restoreOriginal(f.state).status, 'restored');
  for (const [relative, hash] of f.originals) assert.equal(sha256(fs.readFileSync(path.join(f.resources, relative))), hash);
  assert(!fs.existsSync(path.join(f.resources, 'ion-dist/i18n/zh-Hans.json')));
  assert.equal(restoreOriginal(f.state).alreadyRestored, true);
  assert.equal(applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans').status, 'installed');
  restoreOriginal(f.state);
  assert.deepEqual(fs.readdirSync(f.userdata).map(name => [name, fs.readFileSync(path.join(f.userdata, name), 'utf8')]), dataBefore);
  assert(!fs.existsSync(path.join(f.source, 'local')));
  assert(!fs.existsSync(path.join(f.source, 'bootstrap')));
});

test('original restore refuses drift and corrupted backups before modifying any resource', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t); applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans');
  const state = readJSON(path.join(f.state, 'original-state.json'));
  const first = state.files[0];
  const bytes = fs.readFileSync(path.join(f.resources, first.path));
  fs.writeFileSync(path.join(f.state, state.files[1].backup), 'tampered');
  assert.throws(() => restoreOriginal(f.state), /Backup hash mismatch/);
  assert.deepEqual(fs.readFileSync(path.join(f.resources, first.path)), bytes);
  assert.equal(statusOriginal(f.state).intact, false);
});

test('protected packages are refused without changing permissions or creating state', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.source, 'AppxManifest.xml'), '<Package/>');
  assert.equal(checkOriginal(f.source).eligible, false);
  assert.throws(() => applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans'), /protected MSIX/);
  assert(!fs.existsSync(f.state));
  for (const [relative, hash] of f.originals) assert.equal(sha256(fs.readFileSync(path.join(f.resources, relative))), hash);
});

test('failed backup preparation is journaled and retry safely rebuilds partial backups', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t), copy = fs.copyFileSync;
  let copies = 0;
  fs.copyFileSync = (...args) => {
    if (++copies === 2) { fs.writeFileSync(args[1], 'partial copy'); throw new Error('injected backup failure'); }
    return copy(...args);
  };
  try { assert.throws(() => applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans'), /injected backup failure/); }
  finally { fs.copyFileSync = copy; }
  assert.equal(statusOriginal(f.state).status, 'preparing');
  for (const [relative, hash] of f.originals) assert.equal(sha256(fs.readFileSync(path.join(f.resources, relative))), hash);
  assert.equal(applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans').status, 'installed');
  restoreOriginal(f.state);
  for (const [relative, hash] of f.originals) assert.equal(sha256(fs.readFileSync(path.join(f.resources, relative))), hash);
});

test('cancelling failed switch preparation preserves the previous installed transaction', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  const hant = path.join(f.catalogs, 'zh-Hant');
  const stored = path.join(f.root, 'held-hant');
  fs.renameSync(hant, stored);
  applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans');
  fs.renameSync(stored, hant);
  const existing = path.join(f.resources, 'ion-dist/i18n/zh-Hant.json');
  fs.writeFileSync(existing, '{"preexisting":true}');
  const copy = fs.copyFileSync;
  fs.copyFileSync = () => { throw new Error('injected switch backup failure'); };
  try { assert.throws(() => switchOriginal(f.state, f.catalogs, 'zh-Hant'), /injected switch/); }
  finally { fs.copyFileSync = copy; }
  assert.equal(restoreOriginal(f.state).cancelledPreparation, true);
  assert.equal(statusOriginal(f.state).status, 'installed');
  assert.equal(statusOriginal(f.state).locale, 'zh-Hans');
  assert.equal(fs.readFileSync(existing, 'utf8'), '{"preexisting":true}');
  switchOriginal(f.state, f.catalogs, 'zh-Hant');
  restoreOriginal(f.state);
  assert.equal(fs.readFileSync(existing, 'utf8'), '{"preexisting":true}');
});

test('source drift during backup preparation fails before any patch writes', { skip: process.platform !== 'win32' }, t => {
  for (const relative of ['app.asar', 'ion-dist/assets/runtime.js', 'ion-dist/i18n/zh-Hans.json']) {
    const f = fixture(t), copy = fs.copyFileSync;
    let changed = false;
    fs.copyFileSync = (...args) => {
      const result = copy(...args);
      if (!changed) { changed = true; fs.writeFileSync(path.join(f.resources, relative), 'external update'); }
      return result;
    };
    try { assert.throws(() => applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans'), /changed during preparation/); }
    finally { fs.copyFileSync = copy; }
    assert.equal(readJSON(path.join(f.state, 'original-state.json')).status, 'preparing');
    assert.equal(fs.readFileSync(path.join(f.resources, relative), 'utf8'), 'external update');
    const selector = f.originals.find(([name]) => name.endsWith('selector.js'));
    assert.equal(sha256(fs.readFileSync(path.join(f.resources, selector[0]))), selector[1]);
    assert.equal(restoreOriginal(f.state).cancelledPreparation, true);
    assert.equal(statusOriginal(f.state).status, 'not-installed');
  }
});

test('source is revalidated after the applying journal and before resource writes', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t), rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    const applying = to === path.join(f.state, 'original-state.json') && readJSON(from).status === 'applying';
    const result = rename(from, to);
    if (applying) fs.writeFileSync(path.join(f.resources, 'app.asar'), 'external update at commit');
    return result;
  };
  try { assert.throws(() => applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans'), /version changed during preparation/); }
  finally { fs.renameSync = rename; }
  assert.equal(statusOriginal(f.state).status, 'applying');
  assert.equal(statusOriginal(f.state).intact, false);
  for (const [relative, hash] of f.originals.filter(([name]) => name.endsWith('.js'))) assert.equal(sha256(fs.readFileSync(path.join(f.resources, relative))), hash);
  assert(!fs.existsSync(path.join(f.resources, 'ion-dist/i18n/zh-Hans.json')));
});

test('original check requires executable and Windows source identity ignores case', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.source, 'claude.exe'));
  assert.equal(checkOriginal(f.source).eligible, false);
  fs.writeFileSync(path.join(f.source, 'claude.exe'), 'inert test fixture');
  applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans');
  assert.equal(checkOriginal(f.source.toUpperCase(), f.state).eligible, true);
  assert.equal(applyOriginal(f.source.toUpperCase(), f.state, f.catalogs, 'zh-Hant').status, 'installed');
  restoreOriginal(f.state);
});

test('application lock is shared across different state directories', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.resources, '.3p-zh-original-lock'), 'other process');
  assert.throws(() => applyOriginal(f.source, f.state, f.catalogs, 'zh-Hans'), /Cannot lock/);
  assert(!fs.existsSync(f.state));
});
