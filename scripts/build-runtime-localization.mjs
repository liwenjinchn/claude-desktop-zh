// Builds a manual, reversible DevTools experiment. Does not start or modify Claude.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRuntimeLocalization } from '../lib/runtime-localization.mjs';

export {
  activateRuntimeCatalog, runtimeSpec, buildRuntimeLocalization,
  runtimeAutomationSource, runtimePickerAutomationSource,
} from '../lib/runtime-localization.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, catalogDirectory, locale, output] = process.argv.slice(2);
  if (!source || !catalogDirectory || !locale || !output) throw new Error('Usage: node scripts/build-runtime-localization.mjs SOURCE CATALOG_DIR zh-Hans|zh-Hant OUTPUT.js');
  console.log(JSON.stringify(buildRuntimeLocalization(source, catalogDirectory, locale, output), null, 2));
}
