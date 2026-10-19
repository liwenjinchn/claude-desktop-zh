#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { readJSON, writeJSON } from '../lib/common.mjs';
import { runProfileTest, canonicalLocation } from '../lib/profile-test.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const error = code => { const value = new Error(code); value.code = code; throw value; };
export function parseArguments(argv) {
  const flags = new Map();
  const accepted = new Set(['mode', 'source', 'profile', 'catalog-dir', 'output-parent', 'locale', 'timeout-seconds', 'poll-seconds', 'stable-seconds', 'wrapper-pid']);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2), value = argv[i + 1];
    if (!argv[i]?.startsWith('--') || !accepted.has(key) || flags.has(key) || !value || value.startsWith('--')) error('TESTER_ARGUMENTS');
    flags.set(key, value);
  }
  const integer = (key, fallback) => flags.has(key) && !/^\d+$/.test(flags.get(key)) ? error('TESTER_ARGUMENTS') : Number(flags.get(key) ?? fallback);
  return {
    mode: flags.get('mode') ?? 'Preflight', source: flags.get('source'), profile: flags.get('profile'),
    catalogDirectory: flags.get('catalog-dir') ?? path.join(repo, '.catalogs'),
    outputParent: flags.get('output-parent') ?? path.join(repo, '.handoff', 'profile-tests'),
    locale: flags.get('locale') ?? 'zh-Hans', timeoutSeconds: integer('timeout-seconds', 600), pollSeconds: integer('poll-seconds', 3),
    stableSeconds: integer('stable-seconds', 6), wrapperPid: integer('wrapper-pid', 0)
  };
}
export function createDependencies() {
  let observedProcesses = [];
  return {
    now: () => performance.now(),
    log: message => console.log(message),
    probe: options => {
      const request = path.join(options.privateDirectory, 'probe-request.json');
      const resultFile = path.join(options.privateDirectory, 'probe-result.json');
      if (fs.existsSync(resultFile)) {
        // Only this probe's fixed result file in the unique owned run is replaced.
        fs.unlinkSync(resultFile);
      }
      writeJSON(request, { source: options.source, profile: options.profile, runnerPid: process.pid, wrapperPid: options.wrapperPid, observedProcesses, resultFile });
      const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(repo, 'scripts', 'profile-process-probe.ps1'), '-RequestFile', request], { stdio: 'ignore', windowsHide: true });
      if (result.error || result.status !== 0) error('TESTER_PROCESS_UNKNOWN');
      let sample;
      try { sample = readJSON(resultFile); } catch { error('TESTER_PROCESS_UNKNOWN'); }
      if (!Array.isArray(sample.observedProcesses) || sample.observedProcesses.some(item => !Number.isInteger(item.pid) || item.pid < 1 || typeof item.created !== 'string')) error('TESTER_PROCESS_UNKNOWN');
      const identities = new Map([...observedProcesses, ...sample.observedProcesses].map(item => [`${item.pid}:${item.created}`, item]));
      observedProcesses = [...identities.values()];
      return sample;
    },
    cli: (command, args, directory) => {
      if (!['plan', 'prepare-copy', 'status'].includes(command)) error('TESTER_CLI_COMMAND');
      const stdout = path.join(directory, `cli-${command}.json`), stderr = path.join(directory, `cli-${command}.stderr`);
      const out = fs.openSync(stdout, 'wx'), err = fs.openSync(stderr, 'wx');
      let result;
      try {
        result = spawnSync(process.execPath, [path.join(repo, 'bin', 'claude-3p-zh.mjs'), command, ...args], { cwd: repo, stdio: ['ignore', out, err], windowsHide: true });
      } finally { fs.closeSync(out); fs.closeSync(err); }
      if (result.error || result.status !== 0) error('TESTER_CLI_FAILED');
      try { return readJSON(stdout); } catch { error('TESTER_CLI_RESULT'); }
    }
  };
}
export async function main(argv) {
  try {
    if (process.platform !== 'win32' || Number(process.versions.node.split('.')[0]) < 22) error('TESTER_PLATFORM');
    const options = parseArguments(argv);
    // Data inside this checkout must stay under the ignored local handoff directory.
    const output = canonicalLocation(options.outputParent).toLowerCase(), checkout = canonicalLocation(repo).toLowerCase();
    const handoff = path.join(checkout, '.handoff');
    if ((output === checkout || output.startsWith(checkout + path.sep)) && output !== handoff && !output.startsWith(handoff + path.sep)) error('TESTER_OUTPUT_IN_GIT');
    const result = await runProfileTest(options, createDependencies());
    console.log('Report: ' + path.join(result.root, 'report.json'));
    console.log('Launch safety: blocked. UI settings, list and history: not verified.');
    return result.exitCode;
  } catch (exception) {
    const code = /^(?:TESTER|PROFILE)_[A-Z_]+$/.test(exception.code ?? '') ? exception.code : 'TESTER_START_FAILED';
    console.error(code);
    return 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
