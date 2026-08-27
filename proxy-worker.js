/**
 * Cloudflare Worker — drop-in replacement for proxy.php
 *
 * Deploy:
 *   npx wrangler deploy proxy-worker.js --name collection-api-proxy --compatibility-date 2024-01-01
 *
 * Then set site-config.json:
 *   "proxyUrl": "https://collection-api-proxy.<your-subdomain>.workers.dev"
 */
export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === 'GET') {
      return Response.json({ ok: true, service: 'collection-proxy' }, { headers: cors });
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'POST required' }, { status: 405, headers: cors });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON payload' }, { status: 400, headers: cors });
    }

    const url = String(payload.url || '').trim();
    const method = String(payload.method || 'GET').toUpperCase();
    const allowed = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

    if (!/^https?:\/\//i.test(url)) {
      return Response.json(
        { error: 'A valid http(s) URL is required. Set the host variable in Environment.' },
        { status: 400, headers: cors }
      );
    }
    if (!allowed.includes(method)) {
      return Response.json({ error: 'Unsupported method' }, { status: 400, headers: cors });
    }

    const headers = new Headers();
    const headersIn = payload.headers || {};
    if (Array.isArray(headersIn)) {
      headersIn.forEach((row) => {
        if (!row) return;
        const name = String(row.key || row.name || '').trim();
        const val = row.value != null ? String(row.value) : '';
        if (name && !/[\r\n]/.test(name + val)) headers.set(name, val);
      });
    } else if (headersIn && typeof headersIn === 'object') {
      Object.keys(headersIn).forEach((key) => {
        const name = String(key).trim();
        const val = String(headersIn[key] == null ? '' : headersIn[key]);
        if (name && !/[\r\n]/.test(name + val)) headers.set(name, val);
      });
    }

    const init = { method, headers, redirect: 'follow' };
    if (payload.body != null && payload.body !== '' && method !== 'GET' && method !== 'HEAD') {
      init.body = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
    }

    const started = Date.now();
    try {
      const up = await fetch(url, init);
      const body = await up.text();
      const headerMap = {};
      up.headers.forEach((value, key) => {
        headerMap[key] = value;
      });
      return Response.json(
        {
          status: up.status,
          headers: headerMap,
          body,
          timeMs: Date.now() - started,
          size: body.length,
        },
        { headers: cors }
      );
    } catch (err) {
      return Response.json(
        { error: (err && err.message) || 'Request failed' },
        { status: 502, headers: cors }
      );
    }
  },
};
