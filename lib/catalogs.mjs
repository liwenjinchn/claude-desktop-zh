import fs from 'node:fs';
import path from 'node:path';
import { LOCALES, localeValue, readJSON, writeJSON, sha256 } from './common.mjs';

export function parseCatalog(data) {
  if (data.length > 40 * 1024 * 1024) throw new Error('Catalog is larger than 40 MiB.');
  const value = JSON.parse(Buffer.from(data).toString('utf8').replace(/^\uFEFF/, ''));
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Catalog must be a JSON object.');
  const entries = Object.entries(value);
  if (!entries.length || entries.some(([k, v]) => ['__proto__', 'constructor', 'prototype'].includes(k) || typeof v !== 'string')) throw new Error('Catalog must contain string messages with safe keys.');
  return value;
}
// Extract arguments while distinguishing plural/select bodies from arguments.
// This is a compatibility check, not a complete ICU syntax validator.
export function placeholders(message) {
  const names = new Set();
  function text(start, nested = false) {
    let i = start;
    while (i < message.length) {
      if (message[i] === "'" && /[{}']/.test(message[i + 1] ?? '')) {
        if (message[i + 1] === "'") { i += 2; continue; }
        const end = message.indexOf("'", i + 1); i = end < 0 ? message.length : end + 1; continue;
      }
      if (message[i] === '}' && nested) return i + 1;
      if (message[i] !== '{') { i++; continue; }
      const head = message.slice(i + 1).match(/^\s*([\w$.-]+)\s*([,}])/);
      if (!head) { i++; continue; }
      names.add(head[1]); i += 1 + head[0].length;
      if (head[2] === '}') continue;
      const type = message.slice(i).match(/^\s*([a-zA-Z]+)\s*([,}])/);
      if (!type) throw new Error('Malformed ICU argument.');
      i += type[0].length;
      if (type[2] === '}') continue;
      if (!['select', 'plural', 'selectordinal'].includes(type[1])) {
        const end = message.indexOf('}', i); if (end < 0) throw new Error('Unclosed ICU argument.'); i = end + 1; continue;
      }
      while (i < message.length) {
        const space = message.slice(i).match(/^\s*(?:offset:\s*\d+\s*)?/)[0]; i += space.length;
        if (message[i] === '}') { i++; break; }
        const option = message.slice(i).match(/^(?:=?[\w.-]+)\s*\{/);
        if (!option) throw new Error('Malformed ICU option.');
        i = text(i + option[0].length, true);
      }
    }
    if (nested) throw new Error('Unclosed ICU submessage.');
    return i;
  }
  text(0); return [...names].sort().join('|');
}
export function mergeCatalog(english, translated) {
  const messages = Object.create(null), fallback = [], mismatches = [];
  let matched = 0;
  for (const [key, message] of Object.entries(english)) {
    if (!Object.hasOwn(translated, key)) { messages[key] = message; fallback.push(key); }
    else {
      let compatible = false;
      try { compatible = placeholders(message) === placeholders(translated[key]); } catch { /* Use English when comparison is inconclusive. */ }
      if (!compatible) { messages[key] = message; mismatches.push(key); }
      else { messages[key] = translated[key]; matched++; }
    }
  }
  return { messages, matched, total: Object.keys(english).length, coverage: matched / Object.keys(english).length, fallback, mismatches };
}
export function saveCatalog(directory, locale, kind, data, provenance) {
  localeValue(locale);
  if (!['base', 'dynamic'].includes(kind)) throw new Error('Catalog kind must be base or dynamic.');
  const messages = parseCatalog(data);
  if (kind === 'base' && Object.keys(messages).length < 1000) throw new Error('Base catalog must contain at least 1,000 messages.');
  const bytes = Buffer.from(JSON.stringify(messages));
  const digest = sha256(bytes), folder = path.join(directory, locale, kind);
  writeJSON(path.join(folder, digest + '.json'), messages);
  writeJSON(path.join(folder, digest + '.meta.json'), { locale, kind, sha256: digest, importedAt: new Date().toISOString(), keys: Object.keys(messages).length, ...provenance });
  return { locale, kind, sha256: digest, keys: Object.keys(messages).length };
}
export function bestCatalog(directory, locale, kind, english) {
  const folder = path.join(directory, localeValue(locale), kind);
  if (!fs.existsSync(folder)) return null;
  const candidates = fs.readdirSync(folder).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).map(name => {
    const data = parseCatalog(fs.readFileSync(path.join(folder, name)));
    if (sha256(Buffer.from(JSON.stringify(data))) !== name.slice(0, -5)) throw new Error('Catalog hash mismatch: ' + name);
    const merged = mergeCatalog(english, data);
    return { ...merged, sha256: name.slice(0, -5) };
  });
  return candidates.sort((a, b) => b.matched - a.matched || a.sha256.localeCompare(b.sha256))[0] ?? null;
}
export async function fetchCatalog(directory, locale, kind, url) {
  localeValue(locale);
  const target = new URL(url);
  const expected = kind === 'dynamic' ? `/i18n/dynamic/${locale}.json` : `/i18n/${locale}.json`;
  if (target.origin !== 'https://claude.ai' || target.pathname !== expected || target.username || target.password) throw new Error('Only the corresponding official claude.ai catalog URL is accepted.');
  const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Official catalog returned HTTP ${response.status}. Use catalog import or catalog cache; no login bypass is attempted.`);
  const length = Number(response.headers.get('content-length'));
  if (length > 40 * 1024 * 1024) throw new Error('Catalog download too large.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 40 * 1024 * 1024) throw new Error('Catalog download too large.'); chunks.push(chunk); }
  return saveCatalog(directory, locale, kind, Buffer.concat(chunks), { source: 'official-download', url: target.href });
}
export function availableLocales(directory) {
  return LOCALES.filter(locale => fs.existsSync(path.join(directory, locale, 'base')));
}
