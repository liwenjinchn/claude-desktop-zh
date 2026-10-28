import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAsar } from '../lib/asar-reader.mjs';
import { runtimeSpec } from '../lib/runtime-localization.mjs';
import { saveCatalog } from '../lib/catalogs.mjs';
import { sha256 } from '../lib/common.mjs';

function fixture(t, modify = () => {}) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'zh-asar-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'Claude.app'), catalog = path.join(root, 'catalog');
  const file = path.join(app, 'Contents/Resources/ion-dist.asar');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const runtime = '/* "spa:locale" meta[name="i18n-catalogs"] */var Store=make((e,t)=>({messages:{},messagesLocale:null,gates:[]}));export{Store as Public};';
  const english = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => ['key' + i, 'Hello {name}']));
  const zh = Object.fromEntries(Object.keys(english).map(key => [key, '你好 {name}']));
  const files = new Map([['assets/v1/runtime.js', Buffer.from(runtime)], ['i18n/en-US.json', Buffer.from(JSON.stringify(english))], ['i18n/dynamic/en-US.json', Buffer.from('{"hello":"Hello"}')]]);
  const header = { files: {} }; let offset = 0;
  for (const [name, bytes] of files) {
    const parts = name.split('/'); let parent = header;
    for (const part of parts.slice(0, -1)) parent = parent.files[part] ??= { files: {} };
    parent.files[parts.at(-1)] = { size: bytes.length, offset: String(offset), integrity: { algorithm: 'SHA256', hash: sha256(bytes) } };
    offset += bytes.length;
  }
  modify(header);
  const json = Buffer.from(JSON.stringify(header)), headerSize = 8 + Math.ceil(json.length / 4) * 4;
  const prefix = Buffer.alloc(8 + headerSize); prefix.writeUInt32LE(4, 0); prefix.writeUInt32LE(headerSize, 4); prefix.writeUInt32LE(headerSize - 4, 8); prefix.writeUInt32LE(json.length, 12); json.copy(prefix, 16);
  fs.writeFileSync(file, Buffer.concat([prefix, ...files.values()]));
  saveCatalog(catalog, 'zh-Hans', 'base', Buffer.from(JSON.stringify(zh)));
  saveCatalog(catalog, 'zh-Hans', 'dynamic', Buffer.from('{"hello":"你好"}'));
  return { app, catalog, file, runtime };
}

test('archived frontend builds a runtime spec without changing the application', t => {
  const f = fixture(t), before = sha256(fs.readFileSync(f.file));
  const spec = runtimeSpec(f.app, f.catalog, 'zh-Hans');
  assert.equal(spec.runtimeUrl, '/assets/v1/runtime.js');
  assert.equal(spec.storeExport, 'Public');
  assert.equal(spec.runtimeSha256, sha256(Buffer.from(f.runtime)));
  assert.equal(spec.base.key0, '你好 {name}');
  assert.equal(sha256(fs.readFileSync(f.file)), before);
});

test('ASAR reader rejects out-of-bounds entries and integrity drift', t => {
  const bounds = fixture(t, h => { h.files.assets.files.v1.files['runtime.js'].offset = '999999999'; });
  assert.throws(() => readAsar(bounds.file), /bounds/);
  const drift = fixture(t, h => { h.files.assets.files.v1.files['runtime.js'].integrity.hash = '0'.repeat(64); });
  assert.throws(() => readAsar(drift.file), /integrity mismatch/);
});

test('ASAR reader refuses links and truncated headers', t => {
  const linked = fixture(t, h => { h.files.assets.files.v1.files['runtime.js'].link = 'elsewhere'; });
  assert.throws(() => readAsar(linked.file), /Unsupported/);
  fs.writeFileSync(linked.file, Buffer.from('bad'));
  assert.throws(() => readAsar(linked.file), /bounds/);
});
