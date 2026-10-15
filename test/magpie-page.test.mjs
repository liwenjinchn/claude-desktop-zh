import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('magpie settings page saves language through its documented bridge without running commands', async () => {
  const source = fs.readFileSync(new URL('../integrations/magpie/page/app.js', import.meta.url), 'utf8');
  const choices = ['zh-Hans', 'zh-Hant'].map(value => ({ value, checked: false, addEventListener() {} }));
  const elements = { save: { addEventListener(name, callback) { this.callback = callback; } }, status: {}, command: {} };
  let saved;
  await vm.runInNewContext(source, {
    document: { querySelectorAll: () => choices, getElementById: id => elements[id] },
    magpie: { ready: Promise.resolve(), options: { get: async () => ({}), set: async value => { saved = value; return value; } } }
  });
  assert(choices[0].checked); assert.match(elements.command.textContent, /zh-Hans/);
  choices[0].checked = false; choices[1].checked = true;
  await elements.save.callback();
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), { locale: 'zh-Hant' });
  assert.match(elements.status.textContent, /偏好已保存/);
  assert(!source.includes('fetch(')); assert(!source.includes('child_process'));
});
