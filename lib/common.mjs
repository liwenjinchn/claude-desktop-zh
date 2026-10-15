import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LOCALES = ['zh-Hans', 'zh-Hant'];
export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
export const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWrite(file, JSON.stringify(value, null, 2) + '\n');
}
export function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.3p-zh-' + crypto.randomUUID();
  try { fs.writeFileSync(temporary, data, { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function localeValue(value = 'zh-Hans') {
  if (!LOCALES.includes(value)) throw new Error('Language must be zh-Hans or zh-Hant.');
  return value;
}
export function inside(root, relative) {
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('Path escapes managed directory.');
  assertPlainDirectory(path.dirname(file));
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Managed file is a symbolic link.');
  return file;
}
export function assertPlainDirectory(root) {
  let current = path.resolve(root);
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic-link directory not supported: ' + current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export function filesBelow(root) {
  const result = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symbolic link not supported: ' + file);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) result.push(file);
    }
  }
  walk(root);
  return result;
}
export function asarFiles(archive) {
  const data = fs.readFileSync(archive);
  if (data.length < 16) throw new Error('Invalid ASAR header.');
  const size = data.readUInt32LE(12);
  if (size > data.length - 16) throw new Error('Invalid ASAR JSON size.');
  const header = JSON.parse(data.subarray(16, 16 + size));
  const base = 8 + data.readUInt32LE(4);
  const result = new Map();
  function walk(dir, prefix = '') {
    for (const [name, entry] of Object.entries(dir.files ?? {})) {
      const key = prefix + name;
      if (entry.files) walk(entry, key + '/');
      else if (!entry.unpacked && !entry.link && key.startsWith('.vite/build/') && key.endsWith('.js')) {
        const start = base + Number(entry.offset);
        if (!Number.isSafeInteger(start) || start < base || start + entry.size > data.length) throw new Error('Invalid ASAR entry.');
        result.set(key, data.subarray(start, start + entry.size).toString('utf8'));
      }
    }
  }
  walk(header);
  return result;
}
