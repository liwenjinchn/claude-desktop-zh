// Read-only manual browser check; never enables application writes.
import http from 'node:http';
import { ClaudeChinesePlugin } from '../integrations/magpie/server.mjs';
import { closeWorkbenches } from '../integrations/magpie/workbench.mjs';
const hooks = await ClaudeChinesePlugin({}, { allowWrites: false, autoSync: false });
const page = await hooks.auth.methods[0].authorize();
console.log('Read-only workbench started.');
const entry = http.createServer((request, response) => {
  if (request.headers.host !== '127.0.0.1:43819' || request.url !== '/' || request.headers.origin || request.headers['sec-fetch-site'] === 'cross-site') { response.writeHead(403); response.end(); return; }
  response.writeHead(302, { location: page.url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }); response.end();
});
entry.listen(43819, '127.0.0.1');
async function close() { entry.close(); await closeWorkbenches(); }
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
