// Read-only integration check against a caller-supplied official magpie host.js and Bun.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import assert from 'node:assert/strict';

const flags = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) => [process.argv[2 + i * 2], process.argv[3 + i * 2]]));
for (const name of ['--bun', '--host', '--profile-dir', '--managed-root']) if (!flags[name]) throw new Error('Missing ' + name);
const project = fileURLToPath(new URL('..', import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-zh-host-'));
const target = path.join(project, 'integrations', 'magpie'), waiting = new Map();
const child = spawn(flags['--bun'], ['run', flags['--host']], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, cwd: temporary, env: { ...process.env, MAGPIE_NO_ACCOUNTS: '1' } });
let stderr = '', next = 0;
child.stderr.on('data', chunk => { stderr += chunk; });
readline.createInterface({ input: child.stdout }).on('line', line => {
  let message; try { message = JSON.parse(line); } catch { return; }
  const pair = waiting.get(message.id); if (!pair) return;
  waiting.delete(message.id); clearTimeout(pair.timer);
  if (message.error) pair.reject(new Error(message.error.message)); else pair.resolve(message.result);
});
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Host timeout: ' + method)); }, 15000);
    waiting.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}
try {
  const init = await rpc('init', { directory: temporary, authPath: path.join(temporary, 'auth.json'), plugins: [{ spec: target, target, options: { projectDirectory: project, nodeExecutable: process.execPath, profileDirectory: flags['--profile-dir'], managedRoot: flags['--managed-root'] } }] });
  const names = init.plugins?.[0]?.tools?.map(tool => tool.name) ?? [];
  assert(names.includes('claude_zh_manage'), 'This host does not expose tool hooks. Upgrade magpie before relying on tools.');
  const call = args => rpc('tool', { spec: target, name: 'claude_zh_manage', args, ms: 12000, agent: 'integration-test' });
  const detected = JSON.parse((await call({ action: 'detect' })).text);
  const status = JSON.parse((await call({ action: 'status' })).text);
  await assert.rejects(call({ action: 'restore', confirm: 'restore' }), /Writes disabled/);
  console.log(JSON.stringify({ hostTools: names, detected3p: detected.configured3p, provider: detected.provider, managedStatus: status.status, writesRefused: true, realSettingsModified: false }, null, 2));
} finally {
  child.stdin.end(); child.kill();
  for (const pair of waiting.values()) clearTimeout(pair.timer);
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else { child.once('exit', resolve); setTimeout(resolve, 2000).unref(); } });
  fs.rmSync(temporary, { recursive: true, force: true });
}
