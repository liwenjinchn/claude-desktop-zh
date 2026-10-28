import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCatalog, mergeCatalog, saveCatalog, bestCatalog } from '../lib/catalogs.mjs';
import { patchRuntime, patchSelector } from '../lib/patch.mjs';
import { decodeAddress } from '../lib/cache.mjs';
import { validateGateway } from '../lib/install.mjs';
import { inside } from '../lib/common.mjs';

test('rejects HTML, nonstring messages, prototype keys and arrays', () => {
  for (const text of ['<html>403</html>', '{"a":42}', '{"__proto__":"x"}', '[]']) assert.throws(() => parseCatalog(Buffer.from(text)));
});
test('falls back for missing and incompatible placeholders', () => {
  const result = mergeCatalog({ a: 'Hi {name}', b: '{count, plural, one {one} other {many}}', c: 'missing' }, { a: '你好 {who}', b: '{count, plural, one {一} other {多}}' });
  assert.equal(result.matched, 1); assert.deepEqual(result.mismatches, ['a']); assert.deepEqual(result.fallback, ['c']);
  assert.equal(result.messages.a, 'Hi {name}');
});
test('nested ICU options and literal words are not mistaken for arguments', () => {
  const result = mergeCatalog({ a: '{count, plural, one {One item for {user}} other {Many for {user}}}' }, { a: '{count, plural, one {給 {user} 一項} other {給 {user} 多項}}' });
  assert.equal(result.matched, 1);
  assert.equal(mergeCatalog({ a: '{count, plural, other {For {user}}}' }, { a: '{count, plural, other {給 {someone}}}' }).matched, 0);
});
test('locale loader patch follows renamed symbols and directs Chinese to its own catalog', () => {
  const langs = '["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"]';
  const fixture = `const languages=${langs},fallback=${langs};function Zz(){let e=[];try{if(typeof document<"u"){let t=document.querySelector('meta[name="i18n-catalogs"]')}}catch{}return e}function Load(e){for(let[t,n,r]of Zz())if(t===e)return{base:"unused",dynamic:"unused"}}`;
  const result = patchRuntime(fixture, 'zh-Hant', ['zh-Hans', 'zh-Hant']);
  assert.match(result, /function Zz\(\)\{let e=\[\["zh-Hans"/);
  assert.match(result, /function Load\(e\)\{if\(e==="zh-Hans"\)/);
  assert.match(result, /\/i18n\/dynamic\/zh-Hant\.json/);
  assert(!result.includes('base:"/i18n/en-US.json"'));
});
test('selects compatible catalog instead of newest file timestamp', t => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), '3p-zh-catalog-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const english = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => ['key' + i, 'value']));
  const compatible = Object.fromEntries(Object.keys(english).map(k => [k, '翻译']));
  saveCatalog(dir, 'zh-Hans', 'base', Buffer.from(JSON.stringify(compatible)), { source: 'test' });
  saveCatalog(dir, 'zh-Hans', 'base', Buffer.from(JSON.stringify(Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['other' + i, '值'])))), { source: 'test-newer' });
  assert.equal(bestCatalog(dir, 'zh-Hans', 'base', english).coverage, 1);
});
test('rejects modified catalog snapshots', t => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), '3p-zh-hash-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const saved = saveCatalog(dir, 'zh-Hant', 'dynamic', Buffer.from('{"a":"甲"}'), { source: 'test' });
  fs.writeFileSync(path.join(dir, 'zh-Hant/dynamic', saved.sha256 + '.json'), '{"a":"乙"}');
  assert.throws(() => bestCatalog(dir, 'zh-Hant', 'dynamic', { a: 'A' }), /hash mismatch/);
});
test('unknown frontend anchors are refused', () => {
  assert.throws(() => patchRuntime('function other(){}', 'zh-Hans', ['zh-Hans']), /anchors changed/);
  assert.throws(() => patchSelector('no language names', ['zh-Hans']), /anchor changed/);
});
test('rejects unavailable and invalid locale selection', () => {
  assert.throws(() => patchRuntime('', 'zh-Hant', ['zh-Hans']), /unavailable/);
  assert.throws(() => saveCatalog('.', '../x', 'base', Buffer.from('{}'), {}), /Language/);
});
test('cache addresses are bounded and external filenames cannot escape root', () => {
  assert.throws(() => decodeAddress('.', 0, 10), /address/);
  assert.throws(() => decodeAddress('.', 0x80000001, 1e9), /size/);
  assert.throws(() => inside('C:/managed', '../elsewhere'), /escapes/);
});
test('validates gateway profiles without carrying unrelated policies', () => {
  assert.throws(() => validateGateway({ inferenceProvider: 'bedrock' }), /gateway/);
  assert.throws(() => validateGateway({ inferenceProvider: 'gateway', inferenceGatewayBaseUrl: 'http://u:p@localhost:3425', inferenceGatewayApiKey: 'secret' }), /Invalid/);
  const result = validateGateway({ inferenceProvider: 'gateway', inferenceGatewayBaseUrl: 'http://127.0.0.1:3425', inferenceGatewayApiKey: 'local-test', unrelated: 'drop' });
  assert.equal(result.unrelated, undefined); assert.equal(result.inferenceGatewayApiKey, 'local-test');
});
