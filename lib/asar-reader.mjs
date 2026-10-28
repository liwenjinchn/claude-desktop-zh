// Read only packed regular files. Never extract or execute archive contents.
import fs from 'node:fs';
import { sha256 } from './common.mjs';

export function readAsar(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const length = fs.fstatSync(fd).size;
    const read = (size, offset) => {
      if (!Number.isSafeInteger(size) || !Number.isSafeInteger(offset) || size < 0 || offset < 0 || offset + size > length || size > 64 * 1024 * 1024) throw new Error('Invalid ASAR file bounds.');
      const bytes = Buffer.alloc(size);
      if (fs.readSync(fd, bytes, 0, size, offset) !== size) throw new Error('Truncated ASAR file.');
      return bytes;
    };
    const prefix = read(16, 0);
    const headerSize = prefix.readUInt32LE(4), jsonSize = prefix.readUInt32LE(12);
    if (prefix.readUInt32LE(0) !== 4 || headerSize < 8 || jsonSize > headerSize - 8 || headerSize > 16 * 1024 * 1024) throw new Error('Invalid ASAR header.');
    const header = JSON.parse(read(jsonSize, 16).toString('utf8'));
    const entries = new Map();
    function walk(files, base = '', depth = 0) {
      if (!files || typeof files !== 'object' || depth > 32) throw new Error('Invalid ASAR directory.');
      for (const [name, entry] of Object.entries(files)) {
        if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('Invalid ASAR entry name.');
        const relative = base + name;
        if (entry.files) walk(entry.files, relative + '/', depth + 1);
        else entries.set(relative, entry);
      }
    }
    walk(header.files);
    // Retain only frontend JS/catalogs; no archive paths are written to disk.
    const result = new Map();
    for (const [name, entry] of entries) {
      if (!/^assets\/.*\.js$/.test(name) && !['i18n/en-US.json', 'i18n/dynamic/en-US.json'].includes(name)) continue;
      if (entry.link || entry.unpacked || !/^\d+$/.test(entry.offset)) throw new Error('Unsupported ASAR frontend entry.');
      const offset = Number(entry.offset);
      if (!Number.isSafeInteger(offset)) throw new Error('Invalid ASAR file offset.');
      const bytes = read(entry.size, 8 + headerSize + offset);
      if (entry.integrity && (entry.integrity.algorithm !== 'SHA256' || sha256(bytes) !== entry.integrity.hash)) throw new Error('ASAR frontend integrity mismatch.');
      result.set(name, bytes);
    }
    return result;
  } finally { fs.closeSync(fd); }
}
