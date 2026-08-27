/**
 * CORS proxy for the API playground (replaces proxy.php).
 * Run: node proxy-server.js
 * Listens on http://127.0.0.1:8787
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function normalizeHeaders(headersIn) {
  const lines = [];
  if (!headersIn || typeof headersIn !== 'object') return lines;
  if (Array.isArray(headersIn)) {
    headersIn.forEach((row) => {
      if (!row) return;
      const name = String(row.key || row.name || '').trim();
      const val = row.value != null ? String(row.value) : '';
      if (name && !/[\r\n]/.test(name + val)) lines.push([name, val]);
    });
  } else {
    Object.keys(headersIn).forEach((key) => {
      const name = String(key).trim();
      const val = String(headersIn[key] == null ? '' : headersIn[key]);
      if (name && !/[\r\n]/.test(name + val)) lines.push([name, val]);
    });
  }
  return lines;
}

function forwardRequest(payload) {
  return new Promise((resolve, reject) => {
    const url = String(payload.url || '').trim();
    const method = String(payload.method || 'GET').toUpperCase();
    const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    if (!/^https?:\/\//i.test(url)) {
      reject(Object.assign(new Error('A valid http(s) URL is required.'), { statusCode: 400 }));
      return;
    }
    if (!allowed.includes(method)) {
      reject(Object.assign(new Error('Unsupported method'), { statusCode: 400 }));
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(Object.assign(new Error('A valid http(s) URL is required.'), { statusCode: 400 }));
      return;
    }

    const headerPairs = normalizeHeaders(payload.headers);
    const headers = {};
    headerPairs.forEach(([k, v]) => {
      headers[k] = v;
    });

    let body = payload.body;
    if (body != null && body !== '' && method !== 'GET' && method !== 'HEAD') {
      if (typeof body !== 'string') body = JSON.stringify(body);
    } else {
      body = null;
    }
    if (body != null && !headers['Content-Length'] && !headers['content-length']) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const lib = parsed.protocol === 'http:' ? http : https;
    const started = Date.now();
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
        path: parsed.pathname + parsed.search,
        method,
        headers,
        timeout: 60000,
      },
      (up) => {
        const chunks = [];
        up.on('data', (c) => chunks.push(c));
        up.on('end', () => {
          const buf = Buffer.concat(chunks);
          const headerMap = {};
          Object.keys(up.headers || {}).forEach((key) => {
            const val = up.headers[key];
            headerMap[key] = Array.isArray(val) ? val.join(', ') : String(val);
          });
          resolve({
            status: up.statusCode || 0,
            headers: headerMap,
            body: buf.toString('utf8'),
            timeMs: Date.now() - started,
            size: buf.length,
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('Request timed out'), { statusCode: 502 }));
    });
    req.on('error', (err) => {
      reject(Object.assign(new Error(err.message || 'Request failed'), { statusCode: 502 }));
    });
    if (body != null) req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    sendJson(res, 200, { ok: true, service: 'collection-proxy' });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'POST required' });
    return;
  }

  try {
    const raw = await readBody(req);
    const payload = raw ? JSON.parse(raw) : {};
    const result = await forwardRequest(payload);
    sendJson(res, 200, result);
  } catch (err) {
    const code = err.statusCode || (err instanceof SyntaxError ? 400 : 502);
    sendJson(res, code, { error: err.message || 'Request failed' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`API proxy listening on http://${HOST}:${PORT}`);
  console.log('Point site-config.json proxyUrl at this address (or leave empty on localhost).');
});
