/**
 * Client-side helpers for static hosts (GitHub Pages) where PHP is unavailable.
 * On XAMPP / PHP hosting, callers should prefer admin-api.php and proxy.php first.
 */
const StaticRuntime = (() => {
    let phpCache = null;

    async function phpAvailable() {
        if (phpCache !== null) return phpCache;
        try {
            const res = await fetch(`admin-api.php?action=session&t=${Date.now()}`, {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (!res.ok) {
                phpCache = false;
                return false;
            }
            const type = (res.headers.get('content-type') || '').toLowerCase();
            if (!type.includes('json')) {
                phpCache = false;
                return false;
            }
            const data = await res.json();
            phpCache = data != null && typeof data.ok === 'boolean';
            return phpCache;
        } catch {
            phpCache = false;
            return false;
        }
    }

    function resetPhpCache() {
        phpCache = null;
    }

    async function loadHostsFile() {
        const res = await fetch(`collection/hosts.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('hosts.json missing');
        const data = await res.json();
        return {
            hosts: Array.isArray(data.hosts) ? data.hosts : [],
            relatedHosts: Array.isArray(data.relatedHosts) ? data.relatedHosts : [],
        };
    }

    function hostnameOf(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return '';
        }
    }

    async function resolveIp(hostname) {
        if (!hostname) return '';
        try {
            const res = await fetch(
                `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
                { headers: { Accept: 'application/dns-json' }, cache: 'no-store' }
            );
            if (!res.ok) return '';
            const data = await res.json();
            const answer = (data.Answer || []).find((row) => row.type === 1 && row.data);
            return answer ? String(answer.data) : '';
        } catch {
            return '';
        }
    }

    async function probeHost(item, timeoutMs = 6000) {
        const url = String(item?.url || '').trim();
        const id = item?.id || '';
        const title = item?.title || '';
        const host = hostnameOf(url);
        const started = performance.now();
        const ipPromise = resolveIp(host);

        const base = {
            id,
            title,
            url,
            host,
            ip: '',
            online: false,
            httpStatus: 0,
            latencyMs: null,
            error: '',
            checkedAt: new Date().toISOString(),
            source: 'browser',
        };

        if (!/^https?:\/\//i.test(url)) {
            base.error = 'Invalid URL';
            base.ip = await ipPromise;
            return base;
        }

        const timedFetch = async (mode) => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            try {
                const res = await fetch(url, {
                    method: 'GET',
                    mode,
                    cache: 'no-store',
                    redirect: 'follow',
                    signal: ctrl.signal,
                });
                return res;
            } finally {
                clearTimeout(timer);
            }
        };

        try {
            // Prefer CORS so we can show a real HTTP status when the host allows it.
            try {
                const res = await timedFetch('cors');
                base.online = true;
                base.httpStatus = res.status || 0;
                base.latencyMs = Math.round(performance.now() - started);
            } catch {
                // Most production hosts block CORS. no-cors still proves reachability.
                await timedFetch('no-cors');
                base.online = true;
                base.httpStatus = 0;
                base.latencyMs = Math.round(performance.now() - started);
            }
        } catch (err) {
            base.online = false;
            base.latencyMs = null;
            if (err && err.name === 'AbortError') {
                base.error = 'Timeout';
            } else {
                base.error = 'Could not reach host';
            }
        }

        base.ip = await ipPromise;
        return base;
    }

    async function probeAll(hosts, relatedHosts) {
        const list = Array.isArray(hosts) ? hosts : [];
        const related = Array.isArray(relatedHosts) ? relatedHosts : [];
        const [probed, relatedProbed] = await Promise.all([
            Promise.all(list.map((item) => probeHost(item))),
            Promise.all(related.map((item) => probeHost(item))),
        ]);
        return { ok: true, hosts: probed, relatedHosts: relatedProbed };
    }

    function isProxyUnavailable(response) {
        if (!response) return true;
        if (response.status === 404 || response.status === 405) return true;
        const type = (response.headers.get('content-type') || '').toLowerCase();
        return response.ok && !type.includes('json');
    }

    return {
        phpAvailable,
        resetPhpCache,
        loadHostsFile,
        probeHost,
        probeAll,
        isProxyUnavailable,
    };
})();
