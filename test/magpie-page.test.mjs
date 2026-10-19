import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('magpie settings page saves language through its documented bridge without running commands', async () => {
  const source = fs.readFileSync(new URL('../integrations/magpie/page/app.js', import.meta.url), 'utf8');
  const choices = ['zh-Hans', 'zh-Hant'].map(value => ({ value, checked: false, addEventListener() {} }));
  const elements = { save: { addEventListener(name, callback) { this.callback = callback; } }, status: {}, 'runtime-auto': { checked: false } };
  let saved, failSave = false;
  await vm.runInNewContext(source, {
    document: { querySelectorAll: () => choices, getElementById: id => elements[id] },
    magpie: { ready: Promise.resolve(), options: { get: async () => ({ nodeExecutable: 'saved-node' }), set: async value => { if (failSave) throw Error('Unavailable'); saved = value; return value; } } }
  });
  assert(choices[0].checked); assert(elements['runtime-auto'].checked);
  choices[0].checked = false; choices[1].checked = true;
  await elements.save.callback();
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), { nodeExecutable: 'saved-node', locale: 'zh-Hant', runtimeAutoLoad: true });
  assert.match(elements.status.textContent, /已保存.*下次/);
  assert(!source.includes('fetch(')); assert(!source.includes('child_process'));
  elements['runtime-auto'].checked = false;
  await elements.save.callback();
  assert.equal(saved.runtimeAutoLoad, false);
  assert.match(elements.status.textContent, /关闭/);
  failSave = true;
  await elements.save.callback();
  assert.match(elements.status.textContent, /保存失败/);
  assert.equal(elements.save.disabled, false);
});
