// Experimental resource-only MSIX probe. Builds a package; never installs it.
// Windows 11 unsigned content packages do not require a certificate or admin.
// https://learn.microsoft.com/windows/msix/package/unsigned-package
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { discoverPatchTargets } from '../lib/patch.mjs';
import { plan } from '../lib/install.mjs';

const escapeXML = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const unescapeXML = value => value.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? (0xedb88320 ^ (n >>> 1)) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// MSIX is OPC/ZIP. Store entries without compression so block boundaries and
// local-file-header lengths have one unambiguous representation.
export function resourcePackage(entries) {
  const files = new Map(), names = new Set();
  for (const [input, data] of entries) {
    const name = input.replaceAll('\\', '/');
    if (names.has(name.toLowerCase())) throw new Error('Duplicate MSIX resource path.');
    names.add(name.toLowerCase()); files.set(name, Buffer.from(data));
  }
  if (!files.has('AppxManifest.xml')) throw new Error('Package manifest required.');
  for (const name of files.keys()) {
    if (!/^[A-Za-z0-9_. /-]+$/.test(name) || name.split('/').some(part => !part || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)) || !/\.(xml|png|js|json|txt|css|html|map)$/i.test(name)) throw new Error('Only relative resource files allowed.');
    if (Buffer.byteLength(name) > 260) throw new Error('MSIX resource path too long.');
  }
  if (files.size > 1024 || [...files.values()].reduce((size, data) => size + data.length, 0) > 256 * 1024 * 1024) throw new Error('Resource probe package too large.');
  const blockMap = [...files].map(([name, data]) => {
    const blocks = [];
    for (let i = 0; i < data.length; i += 65536) blocks.push(`<Block Hash="${crypto.createHash('sha256').update(data.subarray(i, i + 65536)).digest('base64')}"/>`);
    return `<File Name="${escapeXML(name.replaceAll('/', '\\'))}" Size="${data.length}" LfhSize="${30 + Buffer.byteLength(name)}">${blocks.join('')}</File>`;
  }).join('');
  files.set('AppxBlockMap.xml', Buffer.from(`<?xml version="1.0" encoding="utf-8"?><BlockMap xmlns="http://schemas.microsoft.com/appx/2010/blockmap" HashMethod="http://www.w3.org/2001/04/xmlenc#sha256">${blockMap}</BlockMap>`));
  const types = new Set([...files.keys()].map(name => name.split('.').at(-1)));
  files.set('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${[...types].map(ext => `<Default Extension="${ext}" ContentType="${ext === 'xml' ? 'application/xml' : ext === 'png' ? 'image/png' : 'application/octet-stream'}"/>`).join('')}<Override PartName="/AppxManifest.xml" ContentType="application/vnd.ms-appx.manifest+xml"/><Override PartName="/AppxBlockMap.xml" ContentType="application/vnd.ms-appx.blockmap+xml"/></Types>`));
  const chunks = [], directory = [];
  let offset = 0;
  for (const [name, data] of files) {
    const filename = Buffer.from(name), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    chunks.push(header, filename, data); directory.push(central, filename); offset += header.length + filename.length + data.length;
  }
  const centralSize = directory.reduce((sum, chunk) => sum + chunk.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...directory, end]);
}

export function buildProbe(source, outputParent, options = {}) {
  const packageRoot = path.dirname(path.resolve(source));
  const originalManifest = fs.readFileSync(path.join(packageRoot, 'AppxManifest.xml'), 'utf8');
  const identity = originalManifest.match(/<Identity\s+([\s\S]*?)\/>/)?.[1];
  if (!identity) throw new Error('MSIX identity missing.');
  const attribute = name => unescapeXML(identity.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? '');
  if (attribute('Name') !== 'Claude') throw new Error('Expected installed Claude package.');
  if (attribute('ProcessorArchitecture') !== 'x64') throw new Error('Resource probe currently supports x64 packages only.');
  const output = fs.mkdtempSync(path.join(path.resolve(outputParent), 'msix-resource-'));
  const packageName = 'ClaudeChinese.ResourceProbe.' + crypto.randomBytes(6).toString('hex');
  const marker = 'claude-zh-resource-probe-' + crypto.randomUUID();
  const publisher = options.publisher ?? 'CN=ClaudeChineseResourceProbe, OID.2.25.311729368913984317654407730594956997722=1';
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap4="http://schemas.microsoft.com/appx/manifest/uap/windows10/4" xmlns:uap6="http://schemas.microsoft.com/appx/manifest/uap/windows10/6" xmlns:rescap6="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities/6" IgnorableNamespaces="uap4 uap6 rescap6">
<Identity Name="${packageName}" Publisher="${escapeXML(publisher)}" Version="1.0.0.0" ProcessorArchitecture="x64"/>
<Properties><DisplayName>Claude Chinese resource probe</DisplayName><PublisherDisplayName>Local resource probe</PublisherDisplayName><Logo>logo.png</Logo><uap6:AllowExecution>false</uap6:AllowExecution><rescap6:ModificationPackage>true</rescap6:ModificationPackage></Properties>
<Resources><Resource Language="en-US"/></Resources>
<Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.22000.0" MaxVersionTested="10.0.26300.0"/><uap4:MainPackageDependency Name="Claude" Publisher="${escapeXML(attribute('Publisher'))}"/></Dependencies>
</Package>`;
  const runtime = discoverPatchTargets(path.join(source, 'resources')).runtime;
  // A comment has no runtime behavior. Test both documented VFS redirection and
  // a relative root entry without touching any base-package file.
  const relative = 'app/resources/' + runtime.relative.replaceAll('\\', '/');
  const vfs = 'VFS/ProgramFilesX64/WindowsApps/' + path.basename(packageRoot) + '/';
  const contents = Buffer.from(runtime.text + '\n/* ' + marker + ' */\n');
  const entries = new Map([
    ['AppxManifest.xml', manifest],
    ['logo.png', fs.readFileSync(path.join(packageRoot, 'assets/StoreLogo.png'))],
    [relative, contents], [vfs + relative, contents],
    ['app/resources/claude-zh-probe.txt', marker],
    [vfs + 'app/resources/claude-zh-probe.txt', marker]
  ]);
  let languagePlan;
  if (options.locale) {
    languagePlan = plan(source, options.catalogDirectory, options.locale);
    for (const [relative, bytes] of languagePlan.patch) {
      const name = 'app/resources/' + relative.replaceAll('\\', '/');
      entries.set(name, bytes); entries.set(vfs + name, bytes);
    }
  }
  const file = path.join(output, 'probe.msix');
  fs.writeFileSync(file, resourcePackage(entries), { flag: 'wx' });
  const resourceBytes = entries.get(relative);
  const report = { packageName, publisher, file, source: path.resolve(source), originalVersion: attribute('Version'), resource: path.join(source, 'resources', runtime.relative), originalSHA256: crypto.createHash('sha256').update(runtime.text).digest('hex'), probeSHA256: crypto.createHash('sha256').update(resourceBytes).digest('hex'), marker, installsPackage: false, locale: options.locale, coverage: languagePlan?.report.coverage, applicationSHA256: languagePlan?.application.asarSHA256 ?? crypto.createHash('sha256').update(fs.readFileSync(path.join(source, 'resources/app.asar'))).digest('hex'), overlayVerified: false };
  fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, outputParent, ...flags] = process.argv.slice(2), options = {};
  if (!source || !outputParent || flags.length % 2) throw new Error('Usage: node scripts/msix-resource-probe.mjs <installed-app> <existing-output-parent> [--publisher <certificate-subject>] [--locale zh-Hans|zh-Hant --catalog-dir <directory>]');
  for (let i = 0; i < flags.length; i += 2) {
    const key = { '--publisher': 'publisher', '--locale': 'locale', '--catalog-dir': 'catalogDirectory' }[flags[i]];
    if (!key || options[key] !== undefined || !flags[i + 1] || flags[i + 1].startsWith('--')) throw new Error('Invalid resource-probe arguments.');
    options[key] = flags[i + 1];
  }
  if (options.locale && !options.catalogDirectory) throw new Error('Language payload requires --catalog-dir.');
  console.log(JSON.stringify(buildProbe(source, outputParent, options), null, 2));
}
