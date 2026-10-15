import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { localeValue, sha256 } from './common.mjs';
import { parseCatalog, saveCatalog } from './catalogs.mjs';

export function decodeAddress(root, address, size) {
  if (!(address >>> 31) || !Number.isSafeInteger(size) || size <= 0 || size > 40 * 1024 * 1024) throw new Error('Unsupported cache address or size.');
  const type = (address >>> 28) & 7;
  if (type === 0) {
    const file = path.join(root, 'f_' + (address & 0x0fffffff).toString(16).padStart(6, '0'));
    const buffer = fs.readFileSync(file);
    if (buffer.length < size) throw new Error('Truncated external cache file.');
    return buffer.subarray(0, size);
  }
  const blockSize = [0, 36, 256, 1024, 4096][type];
  if (!blockSize) throw new Error('Unsupported cache block type.');
  const file = path.join(root, 'data_' + ((address >>> 16) & 255));
  const offset = 8192 + (address & 65535) * blockSize;
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(size);
    if (fs.readSync(fd, buffer, 0, size, offset) !== size) throw new Error('Truncated cache stream.');
    return buffer;
  } finally { fs.closeSync(fd); }
}
export function extractCache(root, locale) {
  localeValue(locale);
  const index = fs.readFileSync(path.join(root, 'data_1'));
  const results = [], skipped = [];
  for (let offset = 8192; offset + 256 <= index.length; offset += 256) {
    const keySize = index.readUInt32LE(offset + 32);
    if (keySize < 25 || keySize > 155 || index.readUInt32LE(offset + 36) !== 0) continue;
    let url;
    try { url = new URL(index.subarray(offset + 100, offset + 100 + keySize).toString('utf8')); } catch { continue; }
    if (url.origin !== 'https://claude.ai') continue;
    const kind = url.pathname === `/i18n/${locale}.json` ? 'base' : url.pathname === `/i18n/dynamic/${locale}.json` ? 'dynamic' : null;
    if (!kind) continue;
    try {
      const headers = decodeAddress(root, index.readUInt32LE(offset + 56), index.readUInt32LE(offset + 40));
      const body = decodeAddress(root, index.readUInt32LE(offset + 60), index.readUInt32LE(offset + 44));
      const encoding = headers.toString('latin1').match(/content-encoding:\s*([^\x00\r\n]+)/i)?.[1].trim().toLowerCase();
      const data = encoding === 'br' ? zlib.brotliDecompressSync(body, { maxOutputLength: 40 * 1024 * 1024 }) : encoding === 'gzip' ? zlib.gunzipSync(body, { maxOutputLength: 40 * 1024 * 1024 }) : body;
      parseCatalog(data);
      results.push({ kind, url: url.href, data, responseHash: sha256(data) });
    } catch (error) { skipped.push({ url: url.href, reason: error.message }); }
  }
  return { results, skipped };
}
export function importCache(root, directory, locale) {
  const { results, skipped } = extractCache(root, locale);
  const seen = new Set();
  const imported = [];
  for (const item of results) {
    if (seen.has(item.responseHash)) continue;
    seen.add(item.responseHash);
    imported.push(saveCatalog(directory, locale, item.kind, item.data, { source: 'local-http-cache', url: item.url, responseHash: item.responseHash }));
  }
  if (!imported.length) throw new Error(`No readable ${locale} catalog in this Chromium block cache. Open normal mode in this language once, or import JSON explicitly. Simple-cache and sparse records are not supported in v0.1.`);
  return { imported, skipped };
}
