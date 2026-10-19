import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ACTIONS, WRITES, createController } from './controller.mjs';

const ASSETS = new Map([
  ['/', [fileURLToPath(new URL('./workbench/index.html', import.meta.url)), 'text/html; charset=utf-8']],
  ['/app.js', [fileURLToPath(new URL('./workbench/app.js', import.meta.url)), 'text/javascript; charset=utf-8']],
  ['/style.css', [fileURLToPath(new URL('./workbench/style.css', import.meta.url)), 'text/css; charset=utf-8']]
]);
const LOCALES = ['zh-Hans', 'zh-Hant'];
const CONFIRMED_ACTIONS = new Set([...WRITES, 'launch']);
const MAX_JOBS = 32;
const IDLE_TIMEOUT = 15 * 60 * 1000;
const running = new Set();
const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};

// The plugin and page share the controller's operation lock. The standalone
// factory retains its process injection for isolated tests.
export function createWorkbench(options = {}, runProcess, sharedController) {
  const controller = sharedController || createController(options, runProcess);
  const token = crypto.randomBytes(32).toString('hex');
  const jobs = new Map();
  let listening, closing, closed = false, idleTimer, activeJob;

  function touch() {
    clearTimeout(idleTimer);
    if (closed) return;
    idleTimer = setTimeout(() => {
      if (activeJob) touch();
      else void close();
    }, IDLE_TIMEOUT);
    idleTimer.unref?.();
  }
  function requireSession(request, response) {
    const presented = request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!presented || !crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(token))) {
      send(response, 401, { error: 'Open the address supplied by the plugin to start a local session.' });
      return false;
    }
    touch();
    return true;
  }
  function trustedRequest(request) {
    const address = server.address();
    if (!address) return false;
    const host = `127.0.0.1:${address.port}`;
    const hostCount = request.rawHeaders.filter((_, index) => index % 2 === 0 && request.rawHeaders[index].toLowerCase() === 'host').length;
    if (hostCount !== 1 || request.headers.host !== host) return false;
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== `http://${host}`) return false;
    if (request.headers['sec-fetch-site'] === 'cross-site') return false;
    // Normal browser GETs do not send Origin. Mutations require it as well as
    // the bearer token, which never travels in a cookie or a URL query.
    return request.method === 'GET' || origin === `http://${host}`;
  }
  async function route(request, response) {
    if (!trustedRequest(request)) return send(response, 403, { error: 'Cross-site request or invalid loopback Host refused.' });
    if (closed) return send(response, 503, { error: 'Workbench is closing. Reopen it from the plugin.' });
    if (!request.url.startsWith('/') || request.url.startsWith('//')) return send(response, 400, { error: 'Invalid request target.' });
    const target = new URL(request.url, 'http://127.0.0.1');
    const asset = ASSETS.get(target.pathname);
    if (request.method === 'GET' && asset) return sendFile(response, ...asset);
    // There is deliberately no HTTP endpoint that mints or reveals a token.
    if (!target.pathname.startsWith('/api/')) return send(response, 404, { error: 'Not found.' });
    if (!requireSession(request, response)) return;
    if (request.method === 'GET' && target.pathname === '/api/state') {
      return send(response, 200, { paths: await controller.paths(), sync: controller.state(), jobs: [...jobs.values()] });
    }
    if (request.method === 'POST' && target.pathname === '/api/run') {
      if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return send(response, 415, { error: 'Use application/json.' });
      const body = await readJSON(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(response, 400, { error: 'Expected a JSON object.' });
      if (!ACTIONS.includes(body.action)) return send(response, 400, { error: 'Unsupported action.' });
      if (!LOCALES.includes(body.locale)) return send(response, 400, { error: 'Select Simplified or Traditional Chinese.' });
      if (CONFIRMED_ACTIONS.has(body.action) && body.confirm !== body.action) return send(response, 400, { error: 'Confirm the exact action.' });
      if (closed) return send(response, 503, { error: 'Workbench is closing.' });
      if (activeJob || controller.state().busy) return send(response, 409, { error: 'Another plugin operation is running.' });
      while (jobs.size >= MAX_JOBS) jobs.delete(jobs.keys().next().value);
      const id = crypto.randomBytes(8).toString('hex');
      const job = { id, action: body.action, locale: body.locale, state: 'running', startedAt: new Date().toISOString() };
      jobs.set(id, job);
      activeJob = Promise.resolve().then(() => controller.execute(body.action, body.confirm, { locale: body.locale })).then(result => {
        job.state = 'done'; job.result = publicResult(result);
      }, error => {
        job.state = 'failed'; job.error = error.message;
      }).finally(() => {
        job.finishedAt = new Date().toISOString();
        activeJob = undefined;
        touch();
      });
      return send(response, 202, { id, state: 'running' });
    }
    if (request.method === 'GET' && target.pathname.startsWith('/api/jobs/')) {
      const job = jobs.get(target.pathname.slice('/api/jobs/'.length));
      if (!job) return send(response, 404, { error: 'Unknown job.' });
      return send(response, 200, job);
    }
    send(response, 404, { error: 'Not found.' });
  }
  const server = http.createServer({ requestTimeout: 10_000, headersTimeout: 10_000 }, (request, response) => {
    route(request, response).catch(error => {
      if (!response.headersSent && !response.destroyed) send(response, error.status || 500, { error: error.message });
    });
  });
  server.timeout = 10_000;
  server.keepAliveTimeout = 1_000;

  function listen() {
    if (closed) return Promise.reject(new Error('Workbench is closed.'));
    if (listening) return listening;
    listening = new Promise((resolve, reject) => {
      const failed = error => { listening = undefined; reject(error); };
      server.once('error', failed);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', failed);
        server.unref();
        running.add(workbench);
        touch();
        resolve(server.address());
      });
    });
    return listening;
  }
  function close() {
    if (closing) return closing;
    closed = true;
    clearTimeout(idleTimer);
    closing = (async () => {
      await listening?.catch(() => {});
      const stopped = new Promise(resolve => {
        if (!server.listening) return resolve();
        server.close(resolve);
        server.closeAllConnections?.();
      });
      // Let an already-confirmed operation finish; never kill the installer
      // halfway through writing its managed copy.
      await Promise.all([stopped, activeJob]);
      jobs.clear();
      running.delete(workbench);
    })();
    return closing;
  }
  const workbench = {
    listen, close,
    address: () => closed ? null : server.address(),
    url: () => {
      const address = closed ? null : server.address();
      if (!address) throw new Error('Workbench is not listening.');
      return `http://127.0.0.1:${address.port}/#token=${token}`;
    }
  };
  return workbench;
}

// Kept outside the plugin entry module: magpie treats every exported function
// there as a plugin factory.
export async function closeWorkbenches() {
  await Promise.all([...running].map(workbench => workbench.close()));
}

function publicResult(result) {
  if (!result || typeof result !== 'object') return result;
  const copy = { ...result };
  delete copy.profilePath;
  return copy;
}
function send(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) });
  response.end(payload);
}
function sendFile(response, file, type) {
  const payload = fs.readFileSync(file);
  response.writeHead(200, { ...SECURITY_HEADERS, 'content-type': type, 'content-length': payload.length });
  response.end(payload);
}
function readJSON(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 16 * 1024) {
        reject(Object.assign(new Error('Request too large.'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > 16 * 1024) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Request was not JSON.'), { status: 400 })); }
    });
    request.on('aborted', () => reject(Object.assign(new Error('Request aborted.'), { status: 400 })));
    request.on('error', reject);
  });
}
