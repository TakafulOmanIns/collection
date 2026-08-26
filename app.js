const ENV_STORAGE_KEY = 'takaful_api_env';
const SUGGESTED_VARS = ['host', 'user', 'pwd', 'token', 'ins_token', 'encoded_token', 'encoded_ins_token'];

let PRODUCTS = [
    { id: 'auth', name: 'Authentication', kind: 'utility' },
    { id: 'motor', name: 'Motor insurance', kind: 'product' },
    { id: 'motor-endorsements', name: 'Motor endorsements', kind: 'service', productId: 'motor' },
    { id: 'motor-claims', name: 'Motor claims', kind: 'service', productId: 'motor' },
    { id: 'dh-life', name: 'Domestic Helper Life insurance', kind: 'product' },
    { id: 'dh-health', name: 'Domestic Helper Health insurance', kind: 'product' },
    { id: 'credit-life', name: 'Unified Credit Life insurance', kind: 'product' },
    { id: 'travel', name: 'Travel insurance', kind: 'product' },
    { id: 'medical', name: 'Medical insurance', kind: 'product' },
];

class APIPlayground {
    constructor() {
        this.collection = null;
        this.endpointMap = new Map();
        this.flatEndpoints = [];
        this.currentId = null;
        this.requestState = null;
        this.activeTab = 'try';
        this.builderTab = 'params';
        this.scriptPane = 'prerequest';
        this.bodyMode = 'raw';
        this.response = null;
        this.visualizer = null;
        this.responseTab = 'body';
        this.responseSearch = '';
        this.responseCollapsed = new Set();
        this.responseHit = 0;
        const params = new URLSearchParams(window.location.search);
        this.testerFocus = params.get('focus') === 'tester';
        if (this.testerFocus) document.body.classList.add('tester-focus');
        this.pgSplit = Number(localStorage.getItem('pgPmSplit') || 0.55);
        if (!(this.pgSplit > 0.22 && this.pgSplit < 0.82)) this.pgSplit = 0.55;
        this.catalogProduct = null;
        this.folderOpen = {};
        this.sidebarStamp = '';
        this.hosts = [];
        this.relatedHostList = null;
        this.folderMaps = {};
        this.folderEnvironments = {};
        this.envCatalog = {};
        this.docPages = { endpoints: {} };
        this.env = this.loadEnv();
        this.loaderCount = 0;
        this.productsStamp = '';
        this.docsStamp = '';
        this.liveBusy = false;
        this.init();
    }

    showLoader(scope = 'page') {
        this.loaderCount += 1;
        this.loaderScope = scope === 'body' ? 'body' : 'page';
        if (this.loaderScope === 'body') {
            const bodyLoader = document.getElementById('workspaceLoader');
            bodyLoader?.classList.remove('is-hidden');
            bodyLoader?.setAttribute('aria-hidden', 'false');
            document.getElementById('loaderOverlay')?.classList.add('is-hidden');
            return;
        }
        document.getElementById('loaderOverlay')?.classList.remove('is-hidden');
        document.getElementById('workspaceLoader')?.classList.add('is-hidden');
    }

    hideLoader() {
        this.loaderCount = Math.max(0, this.loaderCount - 1);
        if (this.loaderCount === 0) {
            document.getElementById('loaderOverlay')?.classList.add('is-hidden');
            const bodyLoader = document.getElementById('workspaceLoader');
            bodyLoader?.classList.add('is-hidden');
            bodyLoader?.setAttribute('aria-hidden', 'true');
            this.loaderScope = 'page';
        }
    }

    async withLoader(task, minMs = 480, scope = 'body') {
        this.showLoader(scope);
        const started = Date.now();
        try {
            return await task();
        } finally {
            const wait = Math.max(0, minMs - (Date.now() - started));
            setTimeout(() => this.hideLoader(), wait);
        }
    }

    async init() {
        this.bindChrome();
        this.bindLiveSync();
        await this.withLoader(() => this.loadCollection(), 700, 'page');
        this.renderEnvDot();
        this.syncDocumentTitle();
        window.addEventListener('popstate', () => this.routeFromUrl());
    }

    bindChrome() {
        document.getElementById('homeBtn')?.addEventListener('click', () => this.withLoader(() => this.showCatalog()));
        document.getElementById('downloadBtn')?.addEventListener('click', () => this.downloadCollection());
        document.getElementById('envBtn')?.addEventListener('click', () => this.openEnv());
        document.getElementById('closeEnvBtn')?.addEventListener('click', () => this.closeEnv());
        document.getElementById('saveEnvBtn')?.addEventListener('click', () => this.saveEnvFromDrawer());
        document.getElementById('addEnvBtn')?.addEventListener('click', () => this.addEnvRow());
        document.getElementById('envDrawer')?.addEventListener('click', (e) => {
            if (e.target.id === 'envDrawer') this.closeEnv();
        });
        document.getElementById('menuToggle')?.addEventListener('click', () => this.toggleSidebar());
        document.getElementById('sidebarBackdrop')?.addEventListener('click', () => this.toggleSidebar(false));
        window.addEventListener('resize', () => {
            if (!this.isMobileNav()) this.toggleSidebar(false);
        });
        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('#sendPreview') && !e.target.closest('#eyeBtn')) this.closeSendPreview();
            if (!e.target.closest('.overview-dl-wrap')) this.closeOverviewDownloadMenus();
            if (!e.target.closest('#methodPicker')) this.closeMethodPicker();
        });
        document.addEventListener('mouseover', (e) => this.onEnvTokenHover(e));
        document.addEventListener('mouseout', (e) => {
            if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#envTip, [data-env-var]')) return;
            this.hideEnvTip();
        });
        document.getElementById('envTipSave')?.addEventListener('click', () => this.saveEnvTip());
        document.getElementById('envTip')?.addEventListener('mouseenter', () => this.cancelEnvTipHide());
    }

    navEl() {
        return document.getElementById('apiNavContent');
    }

    syncDocumentTitle() {
        const fallback = 'Takaful Oman — API Playground';
        if (!this.currentId) {
            document.title = fallback;
            return;
        }
        const record = this.endpointMap.get(this.currentId);
        const name = String(record?.item?.name || '').trim();
        document.title = name ? `${name} — Takaful Oman` : fallback;
    }

    isMobileNav() {
        return window.matchMedia('(max-width: 860px)').matches;
    }

    toggleSidebar(open) {
        const sidebar = document.getElementById('sidebar');
        const next = open == null ? !sidebar?.classList.contains('open') : Boolean(open);
        sidebar?.classList.toggle('open', next);
        document.getElementById('sidebarBackdrop')?.classList.toggle('open', next);
        document.getElementById('menuToggle')?.setAttribute('aria-expanded', next ? 'true' : 'false');
        document.getElementById('menuToggle')?.setAttribute('aria-label', next ? 'Close navigation' : 'Open navigation');
    }

    async loadCollection() {
        const urlParams = new URLSearchParams(window.location.search);
        const collectionUrl = urlParams.get('collection');
        try {
            await this.loadProducts();
            await this.loadEnvCatalog();
            await this.loadDocPages();
            await this.loadHosts();
            const urls = collectionUrl
                ? [collectionUrl]
                : [`collection/active.json?t=${Date.now()}`, `collection.json?t=${Date.now()}`];
            let loaded = null;
            for (const url of urls) {
                const response = await fetch(url);
                if (response.ok) {
                    loaded = await response.json();
                    break;
                }
            }
            if (!loaded) throw new Error('Collection not found');
            this.collection = loaded;
            this.collectionStamp = this.stampCollection(loaded);
            this.indexCollection();
            this.mergeCollectionVars();
            this.syncSidebar();
            this.routeFromUrl();
        } catch (error) {
            this.showError(error.message || 'Failed to load collection');
        }
    }

    async loadProducts() {
        try {
            const response = await fetch(`products.json?t=${Date.now()}`);
            if (!response.ok) return;
            const data = await response.json();
            if (Array.isArray(data.products) && data.products.length) {
                PRODUCTS = this.flattenCatalog(data.products);
            }
            this.productsStamp = data.updatedAt || JSON.stringify(data.products || []);
            this.folderMaps = data.maps || {};
            this.folderEnvironments = data.folderEnvironments || {};
        } catch {
            if (!this.folderMaps) {
                this.folderMaps = {};
                this.folderEnvironments = {};
            }
        }
    }

    stampCollection(collection) {
        const names = (collection?.item || []).map((item) => item.name).join(',');
        return `${collection?.info?.name || ''}|${names}|${(collection?.item || []).length}`;
    }

    async loadEnvCatalog() {
        try {
            const response = await fetch(`collection/env-values.json?t=${Date.now()}`);
            if (!response.ok) return;
            const data = await response.json();
            this.envCatalog = data && typeof data === 'object' ? data : {};
        } catch {
            this.envCatalog = {};
        }
    }

    async loadDocPages() {
        try {
            const response = await fetch(`collection/docs/pages.json?t=${Date.now()}`);
            if (!response.ok) return;
            const data = await response.json();
            this.docPages = data && typeof data === 'object' ? data : { endpoints: {} };
            this.docsStamp = data.updatedAt || JSON.stringify(this.docPages.endpoints || {});
        } catch {
            if (!this.docPages) this.docPages = { endpoints: {} };
        }
    }

    defaultHosts() {
        return [
            { id: 'live', title: 'Live', url: 'https://sellonline.takafuloman.om/' },
            { id: 'uat', title: 'UAT', url: 'https://uatsellonline.takafuloman.om/' },
        ];
    }

    defaultRelatedHosts() {
        return [
            { id: 'motor-claim', title: 'Motor claim', url: 'https://claimsonline.takafuloman.om/' },
            { id: 'inspection', title: 'Inspection', url: 'https://takafulomanpreinspectionlive.azurewebsites.net/' },
            { id: 'e-insurance', title: 'E-insurance', url: 'https://oman-insurance.com/' },
            { id: 'whatsapp', title: 'WhatsApp', url: 'https://takafulinsoman.mehery.com/' },
        ];
    }

    monitoredHosts() {
        return (this.hosts && this.hosts.length) ? this.hosts : this.defaultHosts();
    }

    relatedHosts() {
        if (this.relatedHostList) return this.relatedHostList;
        return this.defaultRelatedHosts();
    }

    async loadHosts() {
        try {
            if (typeof StaticRuntime !== 'undefined' && await StaticRuntime.phpAvailable()) {
                const response = await fetch(`admin-api.php?action=hosts&t=${Date.now()}`);
                if (!response.ok) throw new Error('hosts');
                const data = await response.json();
                this.hosts = Array.isArray(data.hosts) && data.hosts.length ? data.hosts : this.defaultHosts();
                this.relatedHostList = Array.isArray(data.relatedHosts) ? data.relatedHosts : this.defaultRelatedHosts();
                return;
            }
            if (typeof StaticRuntime === 'undefined') throw new Error('no-static-runtime');
            const data = await StaticRuntime.loadHostsFile();
            this.hosts = Array.isArray(data.hosts) && data.hosts.length ? data.hosts : this.defaultHosts();
            this.relatedHostList = Array.isArray(data.relatedHosts) ? data.relatedHosts : this.defaultRelatedHosts();
        } catch {
            this.hosts = this.defaultHosts();
            this.relatedHostList = this.defaultRelatedHosts();
        }
    }

    hostCardHtml(item) {
        return `
            <article class="host-card" data-host="${this.escape(item.id)}">
                <div class="host-card-head">
                    <h3>${this.escape(item.title)}</h3>
                    <span class="host-pill checking">Checking</span>
                </div>
                <a class="host-url" href="${this.escape(item.url)}" target="_blank" rel="noopener">${this.escape(item.url)}</a>
                <dl class="host-meta">
                    <div><dt>Status</dt><dd data-host-status>—</dd></div>
                    <div><dt>Public IP</dt><dd data-host-ip>—</dd></div>
                    <div><dt>Latency</dt><dd data-host-latency>—</dd></div>
                </dl>
            </article>
        `;
    }

    relatedHostCardHtml(item) {
        return `
            <a class="related-host-card" data-host="${this.escape(item.id)}" href="${this.escape(item.url)}" target="_blank" rel="noopener">
                <h3>${this.escape(item.title)}</h3>
                <span class="host-pill checking">Checking</span>
            </a>
        `;
    }

    paintHostCard(card, data) {
        if (!card) return;
        const pill = card.querySelector('.host-pill');
        const status = card.querySelector('[data-host-status]');
        const ip = card.querySelector('[data-host-ip]');
        const latency = card.querySelector('[data-host-latency]');
        const online = Boolean(data && data.online);
        if (pill) {
            pill.textContent = online ? 'Online' : 'Offline';
            pill.className = `host-pill ${online ? 'online' : 'offline'}`;
        }
        if (status) {
            if (online) {
                if (data.httpStatus) status.textContent = `Reachable · HTTP ${data.httpStatus}`;
                else if (data.source === 'browser') status.textContent = 'Reachable · browser check';
                else status.textContent = 'Reachable';
            } else {
                status.textContent = (data && data.error) ? data.error : 'Unreachable';
            }
        }
        if (ip) ip.textContent = (data && data.ip) ? data.ip : 'Not resolved';
        if (latency) latency.textContent = online && data.latencyMs != null ? `${data.latencyMs} ms` : '—';
    }

    async loadHostStatus() {
        const wrap = document.getElementById('hostStatus');
        const relatedWrap = document.getElementById('relatedHostStatus');
        if (!wrap && !relatedWrap) return;
        const markChecking = (root) => {
            root?.querySelectorAll('.host-pill').forEach((pill) => {
                pill.textContent = 'Checking';
                pill.className = 'host-pill checking';
            });
        };
        markChecking(wrap);
        markChecking(relatedWrap);
        try {
            let result = null;
            if (typeof StaticRuntime !== 'undefined' && await StaticRuntime.phpAvailable()) {
                const response = await fetch(`admin-api.php?action=host-status&t=${Date.now()}`);
                if (response.ok) result = await response.json();
            }
            if (!result && typeof StaticRuntime !== 'undefined') {
                result = await StaticRuntime.probeAll(this.monitoredHosts(), this.relatedHosts());
            }
            if (!result) throw new Error('status');
            if (wrap && result.hosts && result.hosts.length) {
                this.hosts = result.hosts.map((host) => ({ id: host.id, title: host.title, url: host.url }));
                if (wrap.querySelectorAll('.host-card').length !== result.hosts.length) {
                    wrap.innerHTML = this.monitoredHosts().map((item) => this.hostCardHtml(item)).join('');
                }
            }
            (result.hosts || []).forEach((host) => {
                this.paintHostCard(wrap?.querySelector(`[data-host="${CSS.escape(host.id)}"]`), host);
            });
            if (relatedWrap && Array.isArray(result.relatedHosts)) {
                this.relatedHostList = result.relatedHosts.map((host) => ({ id: host.id, title: host.title, url: host.url }));
                if (relatedWrap.querySelectorAll('.related-host-card').length !== result.relatedHosts.length) {
                    relatedWrap.innerHTML = this.relatedHosts().map((item) => this.relatedHostCardHtml(item)).join('');
                }
            }
            (result.relatedHosts || []).forEach((host) => {
                this.paintHostCard(relatedWrap?.querySelector(`[data-host="${CSS.escape(host.id)}"]`), host);
            });
        } catch (e) {
            const failed = { online: false, error: 'Check failed' };
            wrap?.querySelectorAll('.host-card').forEach((card) => this.paintHostCard(card, failed));
            relatedWrap?.querySelectorAll('.related-host-card').forEach((card) => this.paintHostCard(card, failed));
        }
    }

    indexCollection() {
        this.endpointMap = new Map();
        this.flatEndpoints = [];
        this.walk(this.collection.item || [], [], []);
        this.flatEndpoints.forEach((ep) => {
            ep.productIds = this.classifyEndpoint(ep);
        });
        this.applyProductFlows();
    }

    flattenCatalog(list) {
        const out = [];
        (list || []).forEach((item) => {
            const children = item.children || [];
            const copy = { ...item };
            delete copy.children;
            if (!copy.kind) copy.kind = 'product';
            out.push(copy);
            children.forEach((child) => {
                const next = { ...child };
                delete next.children;
                next.kind = next.kind || 'service';
                if (item.id && !next.productId) next.productId = item.id;
                out.push(next);
            });
        });
        return out;
    }

    kindOf(item) {
        return item?.kind || 'product';
    }

    itemsOf(kind) {
        return this.allProducts().filter((item) => this.kindOf(item) === kind && item.published !== false);
    }

    allProducts() {
        return PRODUCTS.slice();
    }

    productTree(product) {
        if (!product) return [];
        if (Array.isArray(product.tree) && product.tree.length) return product.tree;
        if (Array.isArray(product.flow) && product.flow.length) {
            return product.flow.map((step) => ({ type: 'step', ...step }));
        }
        return [];
    }

    walkTree(nodes, fn) {
        (nodes || []).forEach((node) => {
            fn(node);
            if (node.type === 'folder') this.walkTree(node.children || [], fn);
        });
    }

    flatSteps(product) {
        const steps = [];
        this.walkTree(this.productTree(product), (node) => {
            if (node.type !== 'folder') steps.push(node);
        });
        return steps;
    }

    chevronSvg() {
        return '<svg class="chevron" viewBox="0 0 12 12" fill="none"><path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    }

    folderIconSvg() {
        return '<svg class="tree-folder-glyph" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.7"/></svg>';
    }

    bindLiveSync() {
        try {
            this.syncChannel = new BroadcastChannel('takaful-playground-sync');
            this.syncChannel.onmessage = () => this.refreshLive();
        } catch (e) { /* polling still runs */ }
        window.addEventListener('storage', (e) => {
            if (e.key === 'takaful-playground-sync') this.refreshLive();
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.refreshLive();
        });
        setInterval(() => this.refreshLive(), 3000);
    }

    async refreshLive() {
        if (this.liveBusy || document.hidden) return;
        this.liveBusy = true;
        try {
            const oldP = this.productsStamp;
            const oldD = this.docsStamp;
            const oldC = this.collectionStamp;
            await this.loadEnvCatalog();
            await this.loadProducts();
            await this.loadDocPages();
            await this.reloadActiveCollection();
            const pChanged = this.productsStamp !== oldP;
            const dChanged = this.docsStamp !== oldD;
            const cChanged = this.collectionStamp !== oldC;
            if (!pChanged && !dChanged && !cChanged) return;
            if (pChanged || cChanged) {
                this.indexCollection();
                this.mergeCollectionVars();
            }
            this.syncSidebar();
            if (this.currentId) {
                document.querySelectorAll('.nav-endpoint').forEach((el) => {
                    el.classList.toggle('active', el.dataset.endpointId === this.currentId);
                });
                if (this.activeTab === 'docs') this.renderEndpoint();
            } else {
                this.renderCatalog();
            }
        } catch (e) {
            /* keep the current playground view if a poll fails */
        } finally {
            this.liveBusy = false;
        }
    }

    productById(id) {
        return this.allProducts().find((p) => p.id === id);
    }

    classifyEndpoint(ep) {
        const mapped = this.folderMaps?.[ep.folder];
        if (mapped) return [mapped];
        const hay = `${ep.folder} ${ep.crumbs.join(' ')} ${ep.item.name}`.toLowerCase();
        let best = null;
        let bestLen = 0;
        this.allProducts().forEach((product) => {
            const tests = [...(product.keywords || []), product.name || '']
                .map((test) => String(test).toLowerCase().trim())
                .filter(Boolean);
            tests.forEach((test) => {
                if (hay.includes(test) && test.length > bestLen) {
                    best = product.id;
                    bestLen = test.length;
                }
            });
        });
        if (best) return [best];
        if (ep.folder.toLowerCase().includes('domestic helper')) {
            return this.allProducts()
                .filter((p) => p.id === 'dh-life' || p.id === 'dh-health')
                .map((p) => p.id);
        }
        return [];
    }

    endpointsFor(productId) {
        const product = this.productById(productId);
        return this.flatSteps(product).map((step) => {
            const rec = this.resolveFlowStep(step);
            return rec ? { ...rec, flowLabel: step.label } : null;
        }).filter(Boolean);
    }

    resolveFlowStep(step) {
        if (!step) return null;
        if (step.endpointId && this.endpointMap.has(step.endpointId)) {
            return this.endpointMap.get(step.endpointId);
        }
        return this.flatEndpoints.find((ep) => {
            if (step.docsKey && this.docsKey(ep.item, ep.crumbs) === step.docsKey) return true;
            if (step.name && ep.item.name === step.name && (!step.folder || ep.folder === step.folder)) return true;
            return false;
        }) || null;
    }

    applyProductFlows() {
        this.allProducts().forEach((product) => {
            this.flatSteps(product).forEach((step) => {
                const rec = this.resolveFlowStep(step);
                if (!rec) return;
                const ep = this.endpointMap.get(rec.id);
                if (ep && !(ep.productIds || []).includes(product.id)) {
                    ep.productIds = [...(ep.productIds || []), product.id];
                }
            });
        });
    }

    walk(items, path, crumbs) {
        items.forEach((item, index) => {
            const nextPath = [...path, index];
            const nextCrumbs = [...crumbs, item.name];
            if (item.item) {
                this.walk(item.item, nextPath, nextCrumbs);
            } else if (item.request) {
                const id = nextPath.join('-');
                const record = { id, item, path: nextPath, crumbs: nextCrumbs, folder: crumbs[0] || 'General' };
                this.endpointMap.set(id, record);
                this.flatEndpoints.push(record);
            }
        });
    }

    mergeCollectionVars() {
        const discovered = new Set(SUGGESTED_VARS);
        (this.collection.variable || []).forEach((v) => { if (v.key) discovered.add(v.key); });
        this.flatEndpoints.forEach(({ item }) => {
            const blob = JSON.stringify(item.request || {});
            for (const match of blob.matchAll(/\{\{\s*([a-zA-Z0-9_.$-]+)\s*\}\}/g)) {
                if (!match[1].startsWith('$')) discovered.add(match[1]);
            }
        });
        discovered.forEach((key) => {
            if (!(key in this.env)) {
                const fromCollection = (this.collection.variable || []).find((v) => v.key === key);
                this.env[key] = fromCollection?.value || '';
            }
        });
        this.persistEnv();
    }

    loadEnv() {
        try {
            return JSON.parse(localStorage.getItem(ENV_STORAGE_KEY) || '{}') || {};
        } catch {
            return {};
        }
    }

    persistEnv() {
        localStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(this.env));
        this.renderEnvDot();
    }

    renderEnvDot() {
        const dot = document.getElementById('envDot');
        if (dot) dot.classList.toggle('ready', Boolean(this.lookupVar('host')));
    }

    mappedEnv() {
        if (this.catalogProduct) {
            const selected = this.productById(this.catalogProduct);
            const selectedId = this.envIdForProduct(selected);
            const selectedEntry = selectedId && this.envCatalog[selectedId];
            return (selectedEntry && selectedEntry.values) || {};
        }
        const record = this.endpointMap.get(this.currentId);
        if (!record) return {};
        let envId = this.folderEnvironments[record.folder];
        if (!envId) {
            const productId = record.productIds && record.productIds[0];
            envId = this.envIdForProduct(this.productById(productId));
        }
        const entry = envId && this.envCatalog[envId];
        return (entry && entry.values) || {};
    }

    lookupVar(key) {
        if (this.env[key] != null && this.env[key] !== '') return this.env[key];
        const mapped = this.mappedEnv();
        if (mapped[key] != null && mapped[key] !== '') return mapped[key];
        const fromCollection = (this.collection?.variable || []).find((v) => v.key === key);
        if (fromCollection && fromCollection.value) return fromCollection.value;
        return '';
    }

    syncSidebar() {
        document.querySelector('.shell')?.classList.remove('no-tree');
        const nav = this.navEl();
        if (!nav) return;
        const stamp = this.sidebarStampValue();
        if (nav.dataset.stamp !== stamp) {
            nav.innerHTML = this.sidebarCatalogHtml();
            nav.dataset.stamp = stamp;
            this.bindSidebarCatalog();
        }
        this.syncSidebarAccordion();
        document.getElementById('homeBtn')?.classList.add('active');
    }

    sidebarStampValue() {
        return this.allProducts()
            .filter((item) => item.published !== false)
            .map((item) => `${item.id}:${item.name}:${this.flatSteps(item).length}`)
            .join('|');
    }

    sidebarCatalogHtml() {
        const products = this.itemsOf('product');
        const services = this.itemsOf('service');
        return `
            <div class="sidebar-catalog">
                <div class="catalog-head">
                    <h2>Products</h2>
                </div>
                ${products.length ? products.map((item) => this.sidebarAccordionItem(item)).join('') : '<div class="empty-state" style="padding:8px">No products yet.</div>'}
                <div class="catalog-head">
                    <h2>Services</h2>
                </div>
                ${services.length ? services.map((item) => this.sidebarAccordionItem(item)).join('') : '<div class="empty-state" style="padding:8px">No services yet.</div>'}
            </div>
        `;
    }

    sidebarAccordionItem(item) {
        return `
            <div class="sidebar-accordion" data-accordion-id="${this.escape(item.id || '')}">
                ${this.sidebarCard(item)}
                <div class="card-tree-wrap">
                    <div class="card-tree-inner"></div>
                </div>
            </div>
        `;
    }

    sidebarCard(item) {
        const kind = this.kindOf(item);
        const related = item.productId ? this.productById(item.productId) : null;
        const steps = this.flatSteps(item).length;
        let meta = kind === 'service' ? 'Service' : (kind === 'utility' ? 'Shared' : 'Product');
        if (kind === 'service' && related) meta += ` · ${related.name}`;
        meta += ` · ${steps} API${steps === 1 ? '' : 's'}`;
        return `
            <button class="folder-card sidebar-card" type="button" data-item-id="${this.escape(item.id || '')}">
                <div class="folder-icon">${this.folderGlyph(item)}</div>
                <div class="sidebar-card-copy">
                    <h3>${this.escape(item.name || 'Untitled')}</h3>
                    <p>${this.escape(meta)}</p>
                </div>
                <span class="card-chevron">${this.chevronSvg()}</span>
            </button>
        `;
    }

    sidebarTreePanel(product) {
        const tree = this.productTree(product);
        if (!tree.length) {
            return '<div class="notice tree-empty">No folders or APIs have been published for this item yet.</div>';
        }
        return `<div class="tree-editor is-readonly">${this.playTreeHtml(tree, 0)}</div>`;
    }

    playTreeHtml(nodes, depth = 0) {
        return (nodes || []).map((node) => {
            if (node.type === 'folder') {
                const open = this.playFolderIsOpen(node.id);
                return `
                    <div class="tree-folder ${open ? 'open' : ''}" data-folder-wrap="${this.escape(node.id || '')}">
                        <div class="tree-row folder" data-kind="folder" data-node-id="${this.escape(node.id || '')}" style="padding-left:${depth * 8}px">
                            <button class="tree-toggle ${open ? 'open' : ''}" type="button" data-toggle-folder="${this.escape(node.id || '')}">${this.chevronSvg()}</button>
                            ${this.folderIconSvg()}
                            ${this.seqChip(node)}
                            <span class="tree-label" title="${this.escape(node.name || 'Folder')}">${this.escape(node.name || 'Folder')}</span>
                        </div>
                        <div class="tree-children">${open ? this.playTreeHtml(node.children || [], depth + 1) : ''}</div>
                    </div>
                `;
            }
            const rec = this.resolveFlowStep(node);
            const method = rec ? (rec.item.request?.method || 'GET') : (node.method || '');
            const name = node.label || rec?.item?.name || 'Request';
            const active = rec && rec.id === this.currentId;
            return `
                <div class="tree-row step ${active ? 'active' : ''} ${rec ? '' : 'is-unlinked'}" ${rec ? `data-endpoint-id="${this.escape(rec.id)}"` : ''} data-kind="step" style="padding-left:${depth * 8}px">
                    ${this.filesMethodHtml(method)}
                    ${this.seqChip(node)}
                    <span class="tree-label" title="${this.escape(name)}">${this.escape(name)}</span>
                </div>
            `;
        }).join('');
    }

    playFolderIsOpen(id) {
        return this.folderOpen[id] === true;
    }

    openAncestorsForCurrent() {
        this.folderAncestorsForCurrent().forEach((folderId) => {
            this.folderOpen[folderId] = true;
        });
    }

    folderAncestorsForCurrent() {
        if (!this.currentId || !this.catalogProduct) return [];
        const product = this.productById(this.catalogProduct);
        const ids = [];
        const visit = (nodes) => {
            let found = false;
            (nodes || []).forEach((node) => {
                if (node.type === 'folder') {
                    if (visit(node.children || [])) {
                        ids.push(node.id);
                        found = true;
                    }
                } else if (this.resolveFlowStep(node)?.id === this.currentId) {
                    found = true;
                }
            });
            return found;
        };
        visit(this.productTree(product));
        return ids;
    }

    bindSidebarCatalog() {
        this.navEl()?.querySelectorAll('[data-item-id], [data-item-id]').forEach((btn) => {
            btn.addEventListener('click', () => this.openSidebarProduct(btn.dataset.itemId || btn.dataset.itemId));
        });
    }

    bindSidebarTree() {
        const nav = this.navEl();
        const id = this.catalogProduct || '';
        const root = nav?.querySelector(`.sidebar-accordion[data-accordion-id="${id}"]`)
            || nav?.querySelector(`.sidebar-accordion[data-accordion-id="${id}"]`);
        if (!root) return;
        root.querySelectorAll('[data-toggle-folder]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.dataset.toggleFolder;
                this.folderOpen[id] = !this.playFolderIsOpen(id);
                this.syncSidebarAccordion();
            });
        });
        root.querySelectorAll('.tree-row.folder').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('[data-toggle-folder]')) return;
                const id = row.dataset.nodeId;
                if (!id) return;
                this.folderOpen[id] = !this.playFolderIsOpen(id);
                this.syncSidebarAccordion();
            });
        });
        root.querySelectorAll('.tree-row.step[data-endpoint-id]').forEach((row) => {
            row.addEventListener('click', () => {
                this.withLoader(() => this.selectEndpoint(row.dataset.endpointId));
                this.toggleSidebar(false);
            });
        });
    }

    syncSidebarAccordion() {
        this.navEl()?.querySelectorAll('.sidebar-accordion, .sidebar-accordion').forEach((el) => {
            const shouldOpen = el.dataset.accordionId === this.catalogProduct || el.dataset.accordionId === this.catalogProduct;
            const inner = el.querySelector('.card-tree-inner');
            if (shouldOpen && inner) {
                const product = this.productById(this.catalogProduct);
                inner.innerHTML = product ? this.sidebarTreePanel(product) : '';
                el.classList.remove('is-collapsing');
                el.querySelector('.sidebar-card')?.classList.add('active');
                if (!el.classList.contains('is-open')) {
                    void el.offsetHeight;
                    el.classList.add('is-open');
                    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
                this.bindSidebarTree();
                return;
            }
            if (el.classList.contains('is-open') && !el.classList.contains('is-collapsing')) {
                this.collapseAccordion(el);
            } else if (!el.classList.contains('is-collapsing')) {
                el.querySelector('.sidebar-card')?.classList.remove('active');
            }
        });
    }

    collapseAccordion(el) {
        const wrap = el.querySelector('.card-tree-wrap');
        const inner = el.querySelector('.card-tree-inner');
        el.classList.add('is-collapsing');
        el.classList.remove('is-open');
        const finish = () => {
            if (!el.classList.contains('is-collapsing')) return;
            el.classList.remove('is-collapsing');
            el.querySelector('.sidebar-card')?.classList.remove('active');
            if (inner) inner.innerHTML = '';
        };
        const onEnd = (e) => {
            if (e.target !== wrap || e.propertyName !== 'grid-template-rows') return;
            wrap.removeEventListener('transitionend', onEnd);
            finish();
        };
        wrap?.addEventListener('transitionend', onEnd);
        setTimeout(finish, 420);
    }

    openSidebarProduct(id) {
        if (!id) return;
        const same = this.catalogProduct === id;
        const leftEndpoint = Boolean(this.currentId);
        if (this.currentId) this.leaveEndpoint();
        if (same) {
            this.catalogProduct = null;
        } else {
            this.folderOpen = {};
            this.catalogProduct = id;
        }
        this.syncSidebar();
        if (leftEndpoint) this.renderCatalog();
    }

    leaveEndpoint() {
        this.currentId = null;
        this.requestState = null;
        this.response = null;
        this.visualizer = null;
        this.responseCollapsed = new Set();
        const url = new URL(window.location);
        url.searchParams.delete('endpoint');
        history.pushState({}, '', url);
    }

    routeFromUrl() {
        const params = new URLSearchParams(window.location.search);
        this.testerFocus = params.get('focus') === 'tester';
        document.body.classList.toggle('tester-focus', this.testerFocus);
        if (this.testerFocus) this.activeTab = 'try';
        const id = params.get('endpoint');
        if (id && this.endpointMap.has(id)) this.selectEndpoint(id, false);
        else this.showCatalog(false);
    }

    showCatalog(push = true) {
        if (this.currentId) this.leaveEndpoint();
        this.catalogProduct = null;
        this.syncSidebar();
        document.querySelectorAll('.nav-endpoint').forEach((el) => el.classList.remove('active'));
        if (push) {
            const url = new URL(window.location);
            url.searchParams.delete('endpoint');
            history.pushState({}, '', url);
        }
        this.renderCatalog();
        this.syncDocumentTitle();
    }

    showProductLanding() {
        if (!this.catalogProduct) {
            this.showCatalog();
            return;
        }
        if (this.currentId) this.leaveEndpoint();
        this.syncSidebar();
        document.querySelectorAll('.nav-endpoint').forEach((el) => el.classList.remove('active'));
        this.renderCatalog();
        this.syncDocumentTitle();
    }

    productCount(product) {
        return this.endpointsFor(product.id).length;
    }

    catalogCard(item) {
        return this.overviewProductCard(item);
    }

    iconDownload() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8.2 10.8L12 14.6l3.8-3.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18.5h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    }

    envIdForProduct(item) {
        if (!item) return '';
        if (item.environmentId && this.envCatalog[item.environmentId]) return item.environmentId;
        const folder = String(item.folder || '').trim();
        if (folder && this.folderEnvironments[folder] && this.envCatalog[this.folderEnvironments[folder]]) {
            return this.folderEnvironments[folder];
        }
        return '';
    }

    envEntryForProduct(item) {
        const id = this.envIdForProduct(item);
        if (!id || !this.envCatalog[id]) return null;
        const entry = this.envCatalog[id];
        return { id, name: entry.name || 'Environment', values: entry.values || {} };
    }

    downloadEnvironmentById(envId) {
        const entry = envId && this.envCatalog[envId];
        if (!entry) return;
        const values = Object.keys(entry.values || {}).map((key) => ({
            key,
            value: entry.values[key] == null ? '' : String(entry.values[key]),
            enabled: true,
            type: 'default',
        }));
        const name = entry.name || 'Environment';
        this.saveJsonFile({
            name,
            values,
            _postman_variable_scope: 'environment',
        }, this.collectionFilename(name).replace('postman_collection', 'postman_environment'));
    }

    formatWhen(iso) {
        if (!iso) return '';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return String(iso);
        return date.toLocaleString();
    }

    overviewProductCard(item) {
        const kind = this.kindOf(item);
        const related = item.productId ? this.productById(item.productId) : null;
        const steps = this.flatSteps(item).length;
        const files = item.files || [];
        const env = this.envEntryForProduct(item);
        let meta = kind === 'service' ? 'Service' : (kind === 'utility' ? 'Shared' : 'Product');
        if (kind === 'service' && related) meta += ` · ${related.name}`;
        const docs = files.length ? files.map((file) => `
            <a class="overview-dl-item" href="${this.escape(file.url)}" download="${this.escape(file.name || 'document')}" target="_blank" rel="noopener">
                ${this.fileTypeIcon(file.name || file.filename)}
                <span>${this.escape(file.name || 'Document')}</span>
            </a>
        `).join('') : '<p class="overview-dl-empty">No documents uploaded</p>';
        return `
            <article class="folder-card overview-item-card" data-item-id="${this.escape(item.id || '')}">
                <div class="overview-card-top">
                    <div class="folder-icon">${this.folderGlyph(item)}</div>
                    <div class="overview-card-copy">
                        <h3 title="${this.escape(item.name || 'Untitled')}">${this.escape(item.name || 'Untitled')}</h3>
                        <p class="overview-card-meta">${this.escape(meta)}</p>
                    </div>
                </div>
                <div class="overview-card-foot">
                    <div class="overview-stats">
                        <div class="overview-stat" title="${steps} API${steps === 1 ? '' : 's'} in this ${kind === 'service' ? 'service' : 'product'}">
                            <span>APIs</span>
                            <b>${steps}</b>
                        </div>
                        <div class="overview-stat overview-stat-status is-live" title="Published to the playground">
                            <b>Online</b>
                        </div>
                    </div>
                    <div class="overview-dl-wrap">
                        <button class="overview-dl-toggle" type="button" title="Download files" aria-haspopup="true" aria-expanded="false">
                            ${this.iconDownload()}
                        </button>
                        <div class="overview-dl-menu hidden">
                            <button class="overview-dl-item" type="button" data-download-collection="${this.escape(item.id || '')}">
                                ${this.fileTypeIcon('collection.json')}
                                <span>Collection</span>
                            </button>
                            ${env
                                ? `<button class="overview-dl-item" type="button" data-download-env="${this.escape(env.id)}">
                                    ${this.fileTypeIcon('environment.json')}
                                    <span>${this.escape(env.name)}</span>
                                </button>`
                                : ''}
                            <div class="overview-dl-divider"></div>
                            ${docs}
                        </div>
                    </div>
                </div>
            </article>
        `;
    }

    closeOverviewDownloadMenus() {
        document.querySelectorAll('.overview-dl-menu').forEach((menu) => menu.classList.add('hidden'));
        document.querySelectorAll('.overview-dl-wrap').forEach((wrap) => wrap.classList.remove('open'));
        document.querySelectorAll('.overview-dl-toggle').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
    }

    bindOverviewDownloads() {
        document.querySelectorAll('.overview-dl-toggle').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const wrap = btn.closest('.overview-dl-wrap');
                const menu = wrap?.querySelector('.overview-dl-menu');
                const open = menu?.classList.contains('hidden');
                this.closeOverviewDownloadMenus();
                menu?.classList.toggle('hidden', !open);
                wrap?.classList.toggle('open', Boolean(open));
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        });
        document.querySelectorAll('[data-download-collection]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const product = this.productById(btn.dataset.downloadCollection);
                if (product) this.downloadProductCollection(product);
                this.closeOverviewDownloadMenus();
            });
        });
        document.querySelectorAll('[data-download-env]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.downloadEnvironmentById(btn.dataset.downloadEnv);
                this.closeOverviewDownloadMenus();
            });
        });
        document.querySelectorAll('.overview-dl-menu a.overview-dl-item').forEach((link) => {
            link.addEventListener('click', () => this.closeOverviewDownloadMenus());
        });
        document.querySelectorAll('.overview-item-card[data-item-id]').forEach((card) => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.overview-dl-wrap')) return;
                const id = card.dataset.itemId;
                if (id) this.openSidebarProduct(id);
            });
        });
    }

    productLandingHtml(product) {
        const kind = this.kindOf(product);
        const noun = kind === 'service' ? 'service' : 'product';
        const related = product.productId ? this.productById(product.productId) : null;
        const steps = this.flatSteps(product).length;
        const files = product.files || [];
        const docs = String(product.docs || '').trim();
        return `
            <div class="crumb">
                <button type="button" id="crumbHome">Overview</button>
                <span>/</span>
                <span>${this.escape(product.name || 'Product')}</span>
            </div>
            <section class="hero">
                <div>
                    <h1>${this.escape(product.name || 'Product')}</h1>
                    <p>${kind === 'service' ? 'Service' : (kind === 'utility' ? 'Shared' : 'Product')} · ${steps} API${steps === 1 ? '' : 's'}${related ? ` · ${this.escape(related.name)}` : ''}</p>
                </div>
                <div class="toolbar">
                    <button class="ghost-btn" type="button" data-download-collection="${this.escape(product.id || '')}">Download collection</button>
                </div>
            </section>
            ${docs ? `
                <article class="product-docs product-docs-card">
                    <h2>Documentation</h2>
                    <div class="docs-body">${docs}</div>
                </article>
            ` : ''}
            <article class="product-files-card">
                <h2>Related documents</h2>
                <p class="file-meta">Files published with this ${noun}.</p>
                ${files.length ? `
                    <table class="admin-table">
                        <thead><tr><th>Document</th><th>Size</th><th>Uploaded</th></tr></thead>
                        <tbody>
                            ${files.map((file) => `
                                <tr>
                                    <td class="file-name-cell">
                                        ${this.fileTypeIcon(file.name || file.filename)}
                                        <a href="${this.escape(file.url)}" target="_blank" rel="noopener">${this.escape(file.name || 'Document')}</a>
                                    </td>
                                    <td>${this.formatBytes(file.size || 0)}</td>
                                    <td>${this.escape(this.formatWhen(file.uploadedAt))}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<div class="notice">No documents yet.</div>'}
            </article>
        `;
    }

    renderCatalog(filter = '') {
        const q = filter.toLowerCase().trim();
        if (this.catalogProduct && this.productById(this.catalogProduct)?.published === false) {
            this.catalogProduct = null;
        }
        const match = (item) => !q || String(item.name || '').toLowerCase().includes(q);
        const products = this.itemsOf('product').filter(match);
        const services = this.itemsOf('service').filter(match);

        document.getElementById('workspace').innerHTML = `
            <section class="hero overview-hero">
                <h1>Overview</h1>
            </section>
            <div class="overview-hosts">
                <div class="overview-hosts-head">
                    <button class="ghost-btn small" id="refreshHostStatus" type="button">Refresh</button>
                </div>
                <div class="host-status-grid" id="hostStatus">
                    ${this.monitoredHosts().map((item) => this.hostCardHtml(item)).join('')}
                </div>
                <div class="related-host-grid" id="relatedHostStatus">
                    ${this.relatedHosts().map((item) => this.relatedHostCardHtml(item)).join('')}
                </div>
            </div>
            <div class="catalog-head"><h2>Products</h2></div>
            ${products.length ? `<div class="folder-grid overview-grid">${products.map((item) => this.overviewProductCard(item)).join('')}</div>` : '<div class="notice">No products yet.</div>'}
            <div class="catalog-head"><h2>Services</h2></div>
            ${services.length ? `<div class="folder-grid overview-grid">${services.map((item) => this.overviewProductCard(item)).join('')}</div>` : '<div class="notice">No services yet.</div>'}
        `;

        this.bindOverviewDownloads();
        document.getElementById('refreshHostStatus')?.addEventListener('click', () => this.loadHostStatus());
        this.loadHostStatus();
        document.getElementById('homeBtn')?.classList.add('active');
    }

    seqChip(node) {
        const n = parseInt(String(node?.seq ?? '').trim(), 10);
        if (!Number.isFinite(n) || n < 1) return '';
        return `<span class="seq-chip">${n}</span>`;
    }

    filesMethodHtml(method) {
        const value = String(method || 'GET').toUpperCase();
        return `<span class="method-icon ${this.escape(value.toLowerCase())}" title="${this.escape(value)}">${this.escape(value)}</span>`;
    }

    catalogTreeHtml(nodes, q, depth) {
        return (nodes || []).map((node) => {
            if (node.type === 'folder') {
                const inner = this.catalogTreeHtml(node.children || [], q, depth + 1);
                const nameHit = !q || String(node.name || '').toLowerCase().includes(q);
                if (q && !inner && !nameHit) return '';
                return `
                    <div class="catalog-folder">
                        <div class="catalog-folder-head" style="padding-left:${8 + depth * 16}px">
                            ${this.seqChip(node)}
                            ${this.folderIconSvg()}
                            <strong>${this.escape(node.name || 'Folder')}</strong>
                        </div>
                        ${inner || ''}
                    </div>
                `;
            }
            const rec = this.resolveFlowStep(node);
            const method = rec ? (rec.item.request?.method || 'GET').toUpperCase() : (node.method || '');
            const hay = `${node.label || ''} ${rec?.item?.name || ''} ${method}`.toLowerCase();
            if (q && !hay.includes(q)) return '';
            return `
                <div class="catalog-request ${rec ? '' : 'is-unlinked'}" ${rec ? `data-id="${rec.id}"` : ''} style="padding-left:${28 + depth * 16}px">
                    ${method ? `<span class="method ${method.toLowerCase()}">${this.escape(method)}</span>` : '<span class="method unknown">—</span>'}
                    <div class="name">${this.seqChip(node)}${this.escape(node.label || rec?.item?.name || 'Request')}</div>
                    <div class="path">${rec ? this.escape(this.pathOf(rec.item.request)) : 'API not linked yet'}</div>
                    ${rec ? '<button class="try-chip" type="button">Try it</button>' : ''}
                </div>
            `;
        }).join('');
    }

    defaultProductIcon(item) {
        const n = String((item && typeof item === 'object') ? (item.id || item.name || '') : (item || '')).toLowerCase();
        if (n.includes('travel')) return 'travel';
        if (n.includes('motor')) return 'motor';
        if (n.includes('helper') || n.includes('maid') || n.includes('domestic')) return 'helper';
        if (n.includes('group')) return 'group';
        if (n.includes('home') || n.includes('property')) return 'home';
        if (n.includes('marine') || n.includes('hull')) return 'marine';
        if (n.includes('fire')) return 'fire';
        if (n.includes('family')) return 'family';
        if (n.includes('credit')) return 'credit';
        if (n.includes('accident')) return 'accident';
        if (n.includes('workmen') || n.includes('compensation') || n.includes('contractor')) return 'workmen';
        if (n.includes('engineer') || n.includes('plant')) return 'engineering';
        if (n.includes('money') || n.includes('fidelity')) return 'money';
        if (n.includes('life')) return 'life';
        if (n.includes('medical') || n.includes('health')) return 'health';
        if (n.includes('claim') || n.includes('endors')) return 'shield';
        return 'folder';
    }

    iconById(id) {
        const map = {
            motor: this.svgCar(),
            travel: this.svgPlane(),
            health: this.svgHeart(),
            life: this.svgLife(),
            helper: this.svgHelper(),
            home: this.svgHome(),
            marine: this.svgShip(),
            fire: this.svgFire(),
            family: this.svgPeople(),
            group: this.svgGroup(),
            credit: this.svgCard(),
            accident: this.svgAccident(),
            workmen: this.svgHardhat(),
            engineering: this.svgCog(),
            liability: this.svgScale(),
            money: this.svgMoney(),
            umbrella: this.svgUmbrella(),
            shield: this.svgShield(),
            medical: this.svgMedical(),
            document: this.svgDocument(),
            folder: this.svgFolder(),
        };
        return map[id] || this.svgFolder();
    }

    folderGlyph(item) {
        if (item && typeof item === 'object' && item.icon) return this.iconById(item.icon);
        return this.iconById(this.defaultProductIcon(item));
    }

    svgKey() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="12" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M11 12h10v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgCar() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 14h16l-1.5-5.5A2 2 0 0 0 16.6 7H7.4a2 2 0 0 0-1.9 1.5L4 14Z" stroke="currentColor" stroke-width="1.7"/><circle cx="7.5" cy="16.5" r="1.5" fill="currentColor"/><circle cx="16.5" cy="16.5" r="1.5" fill="currentColor"/></svg>'; }
    svgPlane() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 12l18-8-6 18-3-7-9-3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'; }
    svgShield() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" stroke="currentColor" stroke-width="1.7"/></svg>'; }
    svgDb() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" stroke-width="1.7"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" stroke="currentColor" stroke-width="1.7"/></svg>'; }
    svgFolder() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.7"/></svg>'; }
    svgHome() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'; }
    svgHeart() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'; }
    svgLife() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M5 19c.8-3.2 3.5-5 7-5s6.2 1.8 7 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgShip() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 16.5 12 8l8 8.5M3 18.5c1.5 1.5 4 1.5 6 0s4.5-1.5 6 0 4.5 1.5 6 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8V4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgFire() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3s5 4.2 5 9a5 5 0 1 1-10 0c0-2 1.2-4 3-6 0 2.2 1.2 3.2 2 3.2C11 7.5 12 5.2 12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'; }
    svgPeople() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="2.4" stroke="currentColor" stroke-width="1.7"/><circle cx="16" cy="9" r="2" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 18c.6-2.6 2.6-4 5-4s4.4 1.4 5 4M14 14.2c1.8.2 3.3 1.3 3.8 3.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgCard() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 10h18M7 14h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgCog() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M12 4.5v2.2M12 17.3v2.2M4.9 7.1l1.6 1.6M17.5 15.3l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 16.9l1.6-1.6M17.5 8.7l1.6-1.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgScale() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 4v16M8 20h8M12 7l-6 3 6 2.5L18 10 12 7Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'; }
    svgHelper() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="7.2" cy="7.6" r="2.3" stroke="currentColor" stroke-width="1.7"/><path d="M3.6 18.8c.5-2.8 2.2-4.3 3.6-4.3s3.1 1.5 3.6 4.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M13.2 12.4 17.8 8.6l4.6 3.8V20h-3.2v-4.4h-2.8V20h-3.2v-7.6Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'; }
    svgGroup() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.7"/><circle cx="16" cy="8" r="2.2" stroke="currentColor" stroke-width="1.7"/><path d="M4.2 18.5c.5-2.5 2.2-3.8 3.8-3.8s3.3 1.3 3.8 3.8M12.2 18.5c.5-2.5 2.2-3.8 3.8-3.8s3.3 1.3 3.8 3.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgAccident() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8.2 9.2 12 4.5l3.8 4.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.2" y="11.5" width="7.6" height="3.2" rx="0.8" transform="rotate(-32 12 13.1)" stroke="currentColor" stroke-width="1.7"/><path d="M6 19.5h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgHardhat() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 14.5c0-4 3-7 7-7s7 3 7 7" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 16.5h16v2.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.2Z" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V5.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgMoney() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.4" stroke="currentColor" stroke-width="1.7"/><path d="M6.2 9.2v5.6M17.8 9.2v5.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgUmbrella() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 4c-5.2 0-8.5 3.8-8.5 7.2h17C20.5 7.8 17.2 4 12 4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 11.2V19a2 2 0 0 0 3.4 1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgMedical() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
    svgDocument() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 3.8h7.2L19 8.6V20a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 20V5A1.2 1.2 0 0 1 7 3.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14.2 3.8V8h4.6M8.5 12.5h7M8.5 16h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }

    selectEndpoint(id, push = true) {
        const record = this.endpointMap.get(id);
        if (!record) return;
        this.currentId = id;
        this.activeTab = 'try';
        this.response = null;
        this.visualizer = null;
        this.responseTab = 'body';
        const flowOwner = this.allProducts().find((p) => this.flatSteps(p).some((step) => this.resolveFlowStep(step)?.id === id));
        this.catalogProduct = flowOwner?.id || record.productIds?.[0] || this.catalogProduct;
        this.openAncestorsForCurrent();
        this.requestState = this.buildRequestState(record.item, this.currentFlowStep());
        this.bodyMode = this.requestState.bodyMode || 'raw';
        const pick = this.firstTabWithValues(this.requestState);
        this.builderTab = pick.tab;
        this.scriptPane = pick.scriptPane;
        this.syncSidebar();
        if (push) {
            const url = new URL(window.location);
            url.searchParams.set('endpoint', id);
            history.pushState({}, '', url);
        }
        this.renderEndpoint();
        this.syncDocumentTitle();
    }

    expandFoldersForEndpoint(endpointId) {
        this.navEl()?.querySelectorAll('.nav-folder').forEach((folder) => {
            if (folder.querySelector(`[data-endpoint-id="${endpointId}"]`)) {
                folder.classList.add('open');
                folder.querySelector('.nav-folder-head')?.classList.add('open');
            }
        });
    }

    expandProductNav(record) {
        this.expandFoldersForEndpoint(this.currentId);
        const ids = [...(record.productIds || [])];
        ids.forEach((id) => {
            const child = this.productById(id);
            if (child?.parent) ids.push(child.parent);
        });
        [...new Set(ids)].forEach((id) => {
            const folder = document.querySelector(`[data-product-id="${id}"]`);
            if (folder) {
                folder.classList.add('open');
                folder.querySelector('.nav-folder-head')?.classList.add('open');
            }
        });
    }

    normalizeKv(rows) {
        return (rows || []).filter((row) => row && row.key).map((row) => ({
            key: row.key,
            value: row.value == null ? '' : String(row.value),
            enabled: row.enabled !== false && !row.disabled,
            disabled: row.enabled === false || Boolean(row.disabled),
        }));
    }

    kvHasValues(rows) {
        return (rows || []).some((row) => String(row?.key || '').trim() || String(row?.value || '').trim());
    }

    bodyHasValues(draft) {
        const mode = draft?.bodyMode || (draft?.body || draft?.rawBody ? 'raw' : 'none');
        if (mode === 'none') return false;
        if (mode === 'raw') return Boolean(String(draft?.body || draft?.rawBody || '').trim());
        if (mode === 'form-data') return this.kvHasValues(draft?.formData);
        if (mode === 'urlencoded') return this.kvHasValues(draft?.urlencoded);
        return Boolean(String(draft?.body || draft?.rawBody || '').trim());
    }

    scriptsHaveValues(draft) {
        return Boolean(String(draft?.preScript || '').trim() || String(draft?.testScript || '').trim());
    }

    tabFlags(draft) {
        const auth = draft?.auth || { type: 'none' };
        return {
            params: this.kvHasValues(draft?.query),
            auth: Boolean(auth.type && auth.type !== 'none'),
            headers: this.kvHasValues(draft?.headers),
            body: this.bodyHasValues(draft),
            scripts: this.scriptsHaveValues(draft),
        };
    }

    firstTabWithValues(draft) {
        const flags = this.tabFlags(draft);
        const order = ['params', 'auth', 'headers', 'body', 'scripts'];
        const tab = order.find((name) => flags[name]) || 'params';
        let scriptPane = 'prerequest';
        if (tab === 'scripts') {
            const pre = String(draft?.preScript || '').trim();
            const test = String(draft?.testScript || '').trim();
            scriptPane = pre ? 'prerequest' : (test ? 'test' : 'prerequest');
        }
        return { tab, scriptPane };
    }

    buildRequestState(endpoint, step) {
        const request = endpoint.request || {};
        const url = request.url || {};
        const query = (typeof url === 'object' ? url.query : []) || [];
        const pathParts = typeof url === 'object' ? (url.path || []) : [];
        const pathVars = pathParts
            .filter((p) => /\{\{[^}]+\}\}/.test(String(p)))
            .map((p) => {
                const key = String(p).replace(/\{\{|\}\}/g, '').trim();
                return { key, value: this.env[key] || `{{${key}}}` };
            });

        let headers = this.normalizeKv(request.header || []);
        if (step && step.headers && step.headers.length) {
            headers = this.normalizeKv(step.headers);
        }

        let rawBody = this.rawBody(request.body);
        if (step && step.body != null && String(step.body).length) rawBody = String(step.body);
        else if (step && step.bodyMode === 'raw' && step.body != null) rawBody = String(step.body);
        const method = String((step && step.method) || request.method || 'GET').toUpperCase();
        let templateUrl = this.templateUrl(request);
        if (step && step.url) templateUrl = String(step.url).split('?')[0];
        let queryRows = this.normalizeKv(query);
        if (step && step.query && step.query.length) {
            queryRows = this.normalizeKv(step.query);
        }

        let formData = this.normalizeKv(request.body?.formdata || []);
        if (step && Array.isArray(step.formData)) formData = this.normalizeKv(step.formData);
        let urlencoded = this.normalizeKv(request.body?.urlencoded || []);
        if (step && Array.isArray(step.urlencoded)) urlencoded = this.normalizeKv(step.urlencoded);

        let bodyMode;
        if (step && step.bodyMode) {
            bodyMode = step.bodyMode;
        } else if (request.body?.mode === 'raw') {
            bodyMode = 'raw';
        } else if (request.body?.mode === 'formdata') {
            bodyMode = 'form-data';
        } else if (request.body?.mode === 'urlencoded') {
            bodyMode = 'urlencoded';
        } else if (['GET', 'HEAD'].indexOf(method) >= 0 && !rawBody) {
            bodyMode = 'none';
        } else {
            bodyMode = 'raw';
        }

        const auth = (step && step.auth && typeof step.auth === 'object')
            ? {
                type: step.auth.type || 'none',
                token: step.auth.token || '',
                username: step.auth.username || '',
                password: step.auth.password || '',
            }
            : { type: 'none', token: '', username: '', password: '' };

        return {
            method,
            url: templateUrl,
            query: queryRows,
            pathVars,
            headers,
            auth,
            authValue: this.pickAuthValue(headers),
            authKey: this.pickAuthKey(headers),
            body: rawBody,
            rawBody,
            bodyMode,
            formData,
            urlencoded,
            fields: this.fieldsFromJson(rawBody),
            preScript: this.scriptText(step && step.scripts, 'prerequest') || this.itemScript(endpoint, 'prerequest') || this.scriptText(endpoint && endpoint.scripts, 'prerequest'),
            testScript: this.scriptText(step && step.scripts, 'test') || this.itemScript(endpoint, 'test') || this.scriptText(endpoint && endpoint.scripts, 'test'),
        };
    }

    pickAuthKey(headers) {
        const found = headers.find((h) => /token|authorization|api-key/i.test(h.key));
        return found?.key || 'in-auth-token';
    }

    pickAuthValue(headers) {
        const found = headers.find((h) => /token|authorization|api-key/i.test(h.key));
        return found?.value || '{{ins_token}}';
    }

    rawBody(body) {
        if (!body) return '';
        if (body.mode === 'raw') return body.raw || '';
        if (body.mode === 'urlencoded') {
            return JSON.stringify((body.urlencoded || []).reduce((acc, row) => {
                if (row.key) acc[row.key] = row.value;
                return acc;
            }, {}), null, 2);
        }
        if (body.mode === 'formdata') {
            return JSON.stringify((body.formdata || []).reduce((acc, row) => {
                if (row.key) acc[row.key] = row.value;
                return acc;
            }, {}), null, 2);
        }
        return '';
    }

    templateUrl(request) {
        const url = request.url;
        if (typeof url === 'string') return url;
        if (url?.raw) {
            return String(url.raw).split('?')[0];
        }
        const host = (url?.host || []).join('.');
        const path = (url?.path || []).join('/');
        return host ? `${host}/${path}` : `{{host}}/${path}`;
    }

    pathOf(request) {
        const url = request?.url;
        if (typeof url === 'string') return url.replace(/https?:\/\/[^/]+/, '');
        if (url?.path) return '/' + url.path.join('/');
        if (url?.raw) return String(url.raw).replace(/https?:\/\/[^/]+/, '').split('?')[0];
        return '';
    }

    renderEndpoint() {
        const record = this.endpointMap.get(this.currentId);
        if (!record) return;
        const endpoint = record.item;
        const draft = this.requestState || {};
        const method = draft.method || 'GET';
        if (this.builderTab === 'path') this.builderTab = 'params';
        const workspace = document.getElementById('workspace');
        const cookieHeaders = this.response?.headers
            ? Object.keys(this.response.headers).filter((key) => key.toLowerCase() === 'set-cookie')
            : [];
        const resHeaderCount = this.response?.headers ? Object.keys(this.response.headers).length : 0;
        const auth = draft.auth || { type: 'none' };
        const bodyMode = draft.bodyMode || 'raw';
        const ok = this.response && this.response.status >= 200 && this.response.status < 300;
        const flags = this.tabFlags(draft);
        const headerCount = this.normalizeKv(draft.headers || []).length;

        workspace.innerHTML = `
            <div class="crumb">
                <button type="button" id="crumbHome">Overview</button>
                ${this.catalogProduct && this.productById(this.catalogProduct)
                    ? `<span>/</span><button type="button" id="crumbProduct">${this.escape(this.productById(this.catalogProduct).name)}</button>`
                    : (record.productIds || []).map((id) => this.productById(id)?.name).filter(Boolean).map((name) => `<span>/</span><span>${this.escape(name)}</span>`).join('')}
                <span>/</span>
                <span>${this.escape(endpoint.name)}</span>
            </div>
            <div class="endpoint-title">
                <h1>${this.escape(endpoint.name)}</h1>
                <div class="view-tabs">
                    <button class="tab-btn ${this.activeTab === 'try' ? 'active' : ''}" data-view="try">Try it</button>
                    <button class="tab-btn ${this.activeTab === 'docs' ? 'active' : ''}" data-view="docs">Documentation</button>
                </div>
            </div>
            ${this.activeTab === 'docs' ? this.renderDocs(endpoint) : `
                ${this.lookupVar('host') ? '' : '<div class="notice">Set the <strong>host</strong> variable in Environment, or map an uploaded environment to this product in Admin, so requests can be sent.</div>'}
                <article class="postman-editor playground-editor" style="--pm-split: ${this.pgSplit}">
                    <section class="pm-request">
                        <div class="request-bar pm-request-bar">
                            ${this.methodPickerHtml(method)}
                            <div class="url-highlight-wrap">
                                <div class="url-highlight" id="urlHighlight" aria-hidden="true">${this.highlightEnvTokens(draft.url || '')}</div>
                                <input class="url-input" id="urlInput" value="${this.escape(draft.url || '')}" spellcheck="false">
                            </div>
                            <button class="eye-btn" id="eyeBtn" type="button" title="Show what will be sent" aria-label="Show what will be sent">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M2.5 12S6.2 6.5 12 6.5 21.5 12 21.5 12 17.8 17.5 12 17.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.7"/>
                                    <circle cx="12" cy="12" r="3.1" stroke="currentColor" stroke-width="1.7"/>
                                </svg>
                            </button>
                            <button class="eye-btn" id="focusBtn" type="button" title="Open tester in a new tab" aria-label="Open tester in a new tab">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                                </svg>
                            </button>
                            <button class="send-btn" id="sendBtn" type="button">Send</button>
                        </div>
                        <div class="send-preview hidden" id="sendPreview" hidden>
                            <div class="send-preview-card">
                                <div class="send-preview-head">
                                    <span class="send-preview-method" id="sendPreviewMethod"></span>
                                    <div class="send-preview-actions">
                                        <button class="linkish" id="copySendPreview" type="button">Copy</button>
                                        <button class="linkish" id="downloadSendPreview" type="button">Download</button>
                                        <button class="icon-btn" id="closeSendPreview" type="button" aria-label="Close">×</button>
                                    </div>
                                </div>
                                <pre id="sendPreviewBody"></pre>
                            </div>
                        </div>
                        <div class="pm-tabs">
                            <button class="pm-tab ${this.builderTab === 'params' ? 'active' : ''}" type="button" data-tab="params">Params${flags.params ? '<span class="tab-dot"></span>' : ''}</button>
                            <button class="pm-tab ${this.builderTab === 'auth' ? 'active' : ''}" type="button" data-tab="auth">Authorization${flags.auth ? '<span class="tab-dot"></span>' : ''}</button>
                            <button class="pm-tab ${this.builderTab === 'headers' ? 'active' : ''}" type="button" data-tab="headers">Headers${flags.headers ? `<span class="tab-dot"></span>${headerCount ? ` <span class="tab-count">${headerCount}</span>` : ''}` : ''}</button>
                            <button class="pm-tab ${this.builderTab === 'body' ? 'active' : ''}" type="button" data-tab="body">Body${flags.body ? '<span class="tab-dot"></span>' : ''}</button>
                            <button class="pm-tab ${this.builderTab === 'scripts' ? 'active' : ''}" type="button" data-tab="scripts">Scripts${flags.scripts ? '<span class="tab-dot"></span>' : ''}</button>
                        </div>
                        <div class="pm-pane" id="builderPane">${this.renderBuilderPane()}</div>
                    </section>
                    <div class="pm-splitter" id="pmSplitter" role="separator" aria-orientation="horizontal" title="Drag to resize"></div>
                    <section class="pm-response">
                        <div class="pm-response-head">
                            <div class="pm-tabs">
                                <button class="pm-tab ${this.responseTab === 'body' ? 'active' : ''}" type="button" data-response-tab="body">Body</button>
                                <button class="pm-tab ${this.responseTab === 'headers' ? 'active' : ''}" type="button" data-response-tab="headers">Headers${resHeaderCount ? ` <span class="tab-count">${resHeaderCount}</span>` : ''}</button>
                                <button class="pm-tab ${this.responseTab === 'cookies' ? 'active' : ''}" type="button" data-response-tab="cookies">Cookies${cookieHeaders.length ? ` <span class="tab-count">${cookieHeaders.length}</span>` : ''}</button>
                                <button class="pm-tab ${this.responseTab === 'preview' ? 'active' : ''}" type="button" data-response-tab="preview">Preview</button>
                            </div>
                            ${this.response ? `<div class="response-meta">
                                <span class="status-pill ${ok ? 'ok' : 'bad'}">${this.response.status || 'ERR'} ${this.escape(this.statusPhrase(this.response.status))}</span>
                                <span>${this.response.timeMs ?? '—'} ms</span>
                                <span>${this.formatBytes(this.response.size || 0)}</span>
                                <button class="pm-lang" id="downloadResponseJson" type="button" title="Download JSON">JSON</button>
                                <button class="linkish" id="copyResponse" type="button">Copy</button>
                            </div>` : ''}
                        </div>
                        ${!this.response ? '<div class="response-placeholder">Send the request to see the response.</div>' : ''}
                        ${this.response && this.responseTab === 'preview' ? `<iframe class="visualizer-frame" id="pgVisualizer" title="Response preview" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>` : ''}
                        ${this.response && this.responseTab === 'body' ? this.responseBodyHtml(this.response.body) : ''}
                        ${this.response && this.responseTab === 'headers' ? `
                            <div class="json-viewer" id="responseViewer" data-mode="headers">
                                ${this.responseFilterBarHtml(false)}
                                <table class="kv-table pm-readonly-table">
                                    <thead><tr><th>Key</th><th>Value</th></tr></thead>
                                    <tbody>${Object.keys(this.response.headers || {}).map((key) => `<tr><td>${this.escape(key)}</td><td>${this.escape(String(this.response.headers[key]))}</td></tr>`).join('') || '<tr><td colspan="2">No headers</td></tr>'}</tbody>
                                </table>
                            </div>
                        ` : ''}
                        ${this.response && this.responseTab === 'cookies' ? `
                            <div class="json-viewer" id="responseViewer" data-mode="cookies">
                                ${this.responseFilterBarHtml(false)}
                                <table class="kv-table pm-readonly-table">
                                    <thead><tr><th>Set-Cookie</th></tr></thead>
                                    <tbody>${cookieHeaders.length ? cookieHeaders.map((key) => `<tr><td>${this.escape(String(this.response.headers[key]))}</td></tr>`).join('') : '<tr><td>No cookies</td></tr>'}</tbody>
                                </table>
                            </div>
                        ` : ''}
                    </section>
                </article>
            `}
        `;

        workspace.querySelector('#crumbHome')?.addEventListener('click', () => this.withLoader(() => this.showCatalog()));
        workspace.querySelector('#crumbProduct')?.addEventListener('click', () => this.withLoader(() => this.showProductLanding()));
        workspace.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.activeTab = btn.dataset.view;
                this.renderEndpoint();
            });
        });
        if (this.activeTab === 'try') this.bindTester();
        if (this.activeTab === 'docs') this.bindDocCopy();
    }

    bindTester() {
        const urlInput = document.getElementById('urlInput');
        urlInput?.addEventListener('input', () => {
            this.requestState.url = urlInput.value;
            this.updatePreview();
        });
        document.getElementById('methodBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = document.getElementById('methodMenu');
            const btn = document.getElementById('methodBtn');
            if (!menu) return;
            const open = menu.classList.contains('hidden');
            menu.classList.toggle('hidden', !open);
            btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.querySelectorAll('#methodMenu [data-method]').forEach((opt) => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setPlayMethod(opt.dataset.method);
            });
        });
        document.getElementById('sendBtn')?.addEventListener('click', () => this.sendRequest());
        document.getElementById('eyeBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSendPreview();
        });
        document.getElementById('focusBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTesterTab();
        });
        document.getElementById('copySendPreview')?.addEventListener('click', () => {
            const text = this._sendPreviewText || document.getElementById('sendPreviewBody')?.textContent || '';
            if (navigator.clipboard && text) navigator.clipboard.writeText(text);
        });
        document.getElementById('downloadSendPreview')?.addEventListener('click', () => {
            const text = this._sendPreviewText || document.getElementById('sendPreviewBody')?.textContent || '';
            this.saveTextFile(text, this.jsonFilename(`${this.currentJsonName()}-preview`, 'request').replace(/\.json$/i, '.txt'));
        });
        document.getElementById('closeSendPreview')?.addEventListener('click', () => this.closeSendPreview());
        this.applyVisualizerFrame();
        this.bindResponseViewer();
        this.bindPmSplitter();
        this.bindCodeEditor('reqBody');
        this.bindCodeEditor('preScript');
        this.bindCodeEditor('testScript');
        document.querySelectorAll('.pm-request [data-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.syncBuilderInputs();
                this.builderTab = btn.dataset.tab === 'path' ? 'params' : btn.dataset.tab;
                this.renderEndpoint();
            });
        });
        document.querySelectorAll('[data-script-pane]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.syncBuilderInputs();
                this.scriptPane = btn.dataset.scriptPane;
                this.builderTab = 'scripts';
                this.renderEndpoint();
            });
        });
        document.querySelectorAll('[data-response-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.responseTab = btn.dataset.responseTab;
                this.renderEndpoint();
            });
        });
        this.bindEnvOverlays();
        this.bindKv('#queryTable', 'query');
        this.bindKv('#headerTable', 'headers');
        this.bindKv('#formDataTable', 'formData');
        this.bindKv('#urlencodedTable', 'urlencoded');
        document.getElementById('addQuery')?.addEventListener('click', () => {
            this.syncBuilderInputs();
            this.requestState.query.push({ key: '', value: '', enabled: true });
            this.builderTab = 'params';
            this.renderEndpoint();
        });
        document.getElementById('addHeader')?.addEventListener('click', () => {
            this.syncBuilderInputs();
            this.requestState.headers.push({ key: '', value: '', enabled: true });
            this.builderTab = 'headers';
            this.renderEndpoint();
        });
        document.getElementById('addFormData')?.addEventListener('click', () => {
            this.syncBuilderInputs();
            if (!this.requestState.formData) this.requestState.formData = [];
            this.requestState.formData.push({ key: '', value: '', enabled: true });
            this.builderTab = 'body';
            this.renderEndpoint();
        });
        document.getElementById('addUrlencoded')?.addEventListener('click', () => {
            this.syncBuilderInputs();
            if (!this.requestState.urlencoded) this.requestState.urlencoded = [];
            this.requestState.urlencoded.push({ key: '', value: '', enabled: true });
            this.builderTab = 'body';
            this.renderEndpoint();
        });
        document.querySelectorAll('input[name="bodyMode"]').forEach((input) => {
            input.addEventListener('change', () => {
                this.syncBuilderInputs();
                this.requestState.bodyMode = input.value;
                this.bodyMode = input.value;
                this.builderTab = 'body';
                this.renderEndpoint();
            });
        });
        document.getElementById('authType')?.addEventListener('change', (e) => {
            this.syncBuilderInputs();
            this.requestState.auth = this.requestState.auth || { type: 'none', token: '', username: '', password: '' };
            this.requestState.auth.type = e.target.value;
            this.builderTab = 'auth';
            this.renderEndpoint();
        });
        document.getElementById('beautifyBody')?.addEventListener('click', () => {
            const ta = document.getElementById('reqBody');
            if (!ta) return;
            ta.value = this.beautifyJsonc(ta.value);
            this.requestState.body = ta.value;
            this.requestState.rawBody = ta.value;
            this.requestState.fields = this.fieldsFromJson(ta.value);
            ta.dispatchEvent(new Event('input'));
        });
        document.getElementById('downloadBodyJson')?.addEventListener('click', () => {
            const ta = document.getElementById('reqBody');
            this.saveTextFile(ta ? ta.value : (this.requestState.body || this.requestState.rawBody || ''), this.jsonFilename(this.currentJsonName(), 'request'));
        });
        document.getElementById('downloadResponseJson')?.addEventListener('click', () => {
            const text = this.response ? this.formatResponse(this.response.body) : '';
            this.saveTextFile(text, this.jsonFilename(`${this.currentJsonName()}-response`, 'response'));
        });
        document.getElementById('copyResponse')?.addEventListener('click', () => {
            const text = this.response ? this.formatResponse(this.response.body) : '';
            if (navigator.clipboard && text) navigator.clipboard.writeText(text);
        });
    }

    bindKv(tableSel, key) {
        const table = document.querySelector(tableSel);
        if (!table) return;
        if (!Array.isArray(this.requestState[key])) this.requestState[key] = [];
        table.querySelectorAll('tr[data-i]').forEach((row) => {
            const i = Number(row.dataset.i);
            row.querySelector('.kv-enabled')?.addEventListener('change', (e) => {
                this.requestState[key][i].enabled = e.target.checked;
                this.updatePreview();
            });
            row.querySelector('.kv-key')?.addEventListener('input', (e) => {
                this.requestState[key][i].key = e.target.value;
                this.updatePreview();
            });
            row.querySelector('.kv-value')?.addEventListener('input', (e) => {
                this.requestState[key][i].value = e.target.value;
                this.updatePreview();
            });
            row.querySelector('.kv-remove')?.addEventListener('click', () => {
                this.syncBuilderInputs();
                this.requestState[key].splice(i, 1);
                this.renderEndpoint();
            });
        });
    }

    syncBuilderInputs() {
        if (!this.requestState) return;
        const methodSelect = document.getElementById('methodSelect');
        if (methodSelect) this.requestState.method = String(methodSelect.value || this.requestState.method || 'GET').toUpperCase();
        const urlInput = document.getElementById('urlInput');
        if (urlInput) this.requestState.url = urlInput.value;
        if (document.getElementById('queryTable')) this.requestState.query = this.readKv('#queryTable');
        if (document.getElementById('headerTable')) this.requestState.headers = this.readKv('#headerTable');
        if (document.getElementById('formDataTable')) this.requestState.formData = this.readKv('#formDataTable');
        if (document.getElementById('urlencodedTable')) this.requestState.urlencoded = this.readKv('#urlencodedTable');
        const mode = document.querySelector('input[name="bodyMode"]:checked')?.value;
        if (mode) {
            this.requestState.bodyMode = mode;
            this.bodyMode = mode;
        }
        const body = document.getElementById('reqBody');
        if (body) {
            this.requestState.body = body.value;
            this.requestState.rawBody = body.value;
            this.requestState.fields = this.fieldsFromJson(body.value);
        }
        if (document.getElementById('authType') || document.getElementById('authToken') || document.getElementById('authUser')) {
            this.requestState.auth = {
                type: document.getElementById('authType')?.value || this.requestState.auth?.type || 'none',
                token: document.getElementById('authToken')?.value ?? (this.requestState.auth?.token || ''),
                username: document.getElementById('authUser')?.value ?? (this.requestState.auth?.username || ''),
                password: document.getElementById('authPass')?.value ?? (this.requestState.auth?.password || ''),
            };
        }
        const pre = document.getElementById('preScript');
        const test = document.getElementById('testScript');
        if (pre) this.requestState.preScript = pre.value;
        if (test) this.requestState.testScript = test.value;
    }

    renderBuilderPane() {
        const tab = this.builderTab === 'path' ? 'params' : this.builderTab;
        const draft = this.requestState || {};
        const auth = draft.auth || { type: 'none' };
        const bodyMode = draft.bodyMode || 'raw';
        if (tab === 'params') {
            return `
                <h4>Query Params</h4>
                ${this.kvTable('queryTable', draft.query || [])}
                <button class="linkish" id="addQuery" type="button">+ Add query parameter</button>
            `;
        }
        if (tab === 'headers') {
            return `
                ${this.kvTable('headerTable', draft.headers || [])}
                <button class="linkish" id="addHeader" type="button">+ Add header</button>
            `;
        }
        if (tab === 'auth') {
            return `
                <div class="pm-auth">
                    <label>Type
                        <select id="authType">
                            <option value="none" ${auth.type === 'none' ? 'selected' : ''}>No Auth</option>
                            <option value="bearer" ${auth.type === 'bearer' ? 'selected' : ''}>Bearer Token</option>
                            <option value="basic" ${auth.type === 'basic' ? 'selected' : ''}>Basic Auth</option>
                        </select>
                    </label>
                    ${auth.type === 'bearer' ? `<label>Token<input id="authToken" type="text" value="${this.escape(auth.token || '')}" placeholder="token"></label>` : ''}
                    ${auth.type === 'basic' ? `
                        <label>Username<input id="authUser" type="text" value="${this.escape(auth.username || '')}"></label>
                        <label>Password<input id="authPass" type="password" value="${this.escape(auth.password || '')}"></label>
                    ` : ''}
                    ${auth.type === 'none' ? '<p class="file-meta">This request does not use authorization.</p>' : ''}
                </div>
            `;
        }
        if (tab === 'body') {
            return `
                <div class="pm-body-toolbar">
                    ${['none', 'form-data', 'urlencoded', 'raw'].map((mode) => `
                        <label class="pm-mode ${bodyMode === mode ? 'active' : ''}">
                            <input type="radio" name="bodyMode" value="${mode}" ${bodyMode === mode ? 'checked' : ''}>
                            ${mode === 'urlencoded' ? 'x-www-form-urlencoded' : mode}
                        </label>
                    `).join('')}
                    ${bodyMode === 'raw' ? `
                        <button class="pm-lang" id="downloadBodyJson" type="button" title="Download JSON">JSON</button>
                        <button class="linkish" id="beautifyBody" type="button">Beautify</button>
                    ` : ''}
                </div>
                ${bodyMode === 'none' ? '<div class="notice">This request does not have a body.</div>' : ''}
                ${bodyMode === 'form-data' ? `${this.kvTable('formDataTable', draft.formData || [])}<button class="linkish" id="addFormData" type="button">+ Add row</button>` : ''}
                ${bodyMode === 'urlencoded' ? `${this.kvTable('urlencodedTable', draft.urlencoded || [])}<button class="linkish" id="addUrlencoded" type="button">+ Add row</button>` : ''}
                ${bodyMode === 'raw' ? this.codeEditorHtml('reqBody', draft.body || draft.rawBody || '', false) : ''}
            `;
        }
        if (tab === 'scripts') {
            const pane = this.scriptPane === 'test' ? 'test' : 'prerequest';
            const pre = draft.preScript || '';
            const test = draft.testScript || '';
            return `
                <div class="pm-scripts">
                    <div class="pm-script-nav" role="tablist" aria-label="Script type">
                        <button class="pm-script-tab ${pane !== 'test' ? 'active' : ''}" type="button" data-script-pane="prerequest" role="tab" aria-selected="${pane !== 'test' ? 'true' : 'false'}">
                            Pre-request${pre.trim() ? '<span class="tab-dot"></span>' : ''}
                        </button>
                        <button class="pm-script-tab ${pane === 'test' ? 'active' : ''}" type="button" data-script-pane="test" role="tab" aria-selected="${pane === 'test' ? 'true' : 'false'}">
                            Post-response${test.trim() ? '<span class="tab-dot"></span>' : ''}
                        </button>
                    </div>
                    <div class="pm-script-body">
                        <div class="pm-script-editor ${pane === 'test' ? 'hidden' : ''}">
                            ${this.codeEditorHtml('preScript', pre, false, 'script')}
                        </div>
                        <div class="pm-script-editor ${pane === 'test' ? '' : 'hidden'}">
                            ${this.codeEditorHtml('testScript', test, false, 'script')}
                        </div>
                    </div>
                </div>
            `;
        }
        return '';
    }

    kvTable(id, rows) {
        return `<table class="kv-table" id="${id}">
            <thead><tr><th></th><th>Key</th><th>Value</th><th></th></tr></thead>
            <tbody>
                ${(rows || []).map((row, i) => `
                    <tr data-i="${i}">
                        <td><input class="kv-enabled" type="checkbox" ${row.enabled ? 'checked' : ''}></td>
                        <td><input class="kv-key" type="text" placeholder="Key" value="${this.escape(row.key)}"></td>
                        <td><input class="kv-value" type="text" placeholder="Value" value="${this.escape(row.value)}"></td>
                        <td class="row-actions"><button class="icon-btn kv-remove" type="button" title="Remove">×</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
    }

    readKv(tableSel) {
        const rows = [];
        document.querySelectorAll(`${tableSel} tr[data-i]`).forEach((row) => {
            const key = row.querySelector('.kv-key')?.value.trim() || '';
            if (!key) return;
            rows.push({
                key,
                value: row.querySelector('.kv-value')?.value || '',
                enabled: Boolean(row.querySelector('.kv-enabled')?.checked),
                disabled: !row.querySelector('.kv-enabled')?.checked,
            });
        });
        return rows;
    }

    methodPickerHtml(method) {
        const current = String(method || 'GET').toUpperCase();
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        return `
            <div class="method-picker" id="methodPicker">
                <input type="hidden" id="methodSelect" value="${this.escape(current)}">
                <button class="method-picker-btn method-${current.toLowerCase()}" id="methodBtn" type="button" aria-haspopup="listbox" aria-expanded="false">
                    <span>${this.escape(current)}</span>
                    <svg class="method-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="method-picker-menu hidden" id="methodMenu" role="listbox">
                    ${methods.map((m) => `
                        <button type="button" class="method-option method-${m.toLowerCase()} ${m === current ? 'is-current' : ''}" data-method="${m}" role="option">${m}</button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    closeMethodPicker() {
        document.getElementById('methodMenu')?.classList.add('hidden');
        document.getElementById('methodBtn')?.setAttribute('aria-expanded', 'false');
    }

    setPlayMethod(method) {
        const value = String(method || 'GET').toUpperCase();
        const hidden = document.getElementById('methodSelect');
        if (hidden) hidden.value = value;
        this.closeMethodPicker();
        this.syncBuilderInputs();
        if (this.requestState) this.requestState.method = value;
        this.renderEndpoint();
    }

    statusPhrase(status) {
        const map = {
            200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found',
            400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
            409: 'Conflict', 422: 'Unprocessable Entity', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
        };
        return map[status] || '';
    }

    codeEditorHtml(id, value, readOnly, mode = 'json') {
        const text = value || '';
        const highlight = mode === 'script' ? this.highlightScript(text) : this.highlightJson(text);
        return `
            <div class="code-editor ${readOnly ? 'is-readonly' : ''} ${mode === 'script' ? 'is-script' : ''}" data-code-for="${id}" data-code-mode="${mode}">
                <pre class="code-gutter" aria-hidden="true">${this.lineGutter(text)}</pre>
                <div class="code-main">
                    <pre class="code-highlight" aria-hidden="true">${highlight}\n</pre>
                    ${readOnly ? '' : `<textarea id="${id}" spellcheck="false" placeholder="${mode === 'script' ? '// Write your script here' : ''}">${this.escape(text)}</textarea>`}
                </div>
            </div>
        `;
    }

    bindCodeEditor(id) {
        const editor = document.querySelector(`[data-code-for="${id}"]`);
        const ta = document.getElementById(id);
        if (!editor) return;
        const gutter = editor.querySelector('.code-gutter');
        const hl = editor.querySelector('.code-highlight');
        const mode = editor.dataset.codeMode || 'json';
        const paint = () => {
            const val = ta ? ta.value : (hl?.textContent || '');
            if (gutter) gutter.textContent = this.lineGutter(val);
            if (hl && ta) hl.innerHTML = `${mode === 'script' ? this.highlightScript(val) : this.highlightJson(val)}\n`;
            this.fitCodeEditor(editor, val);
        };
        if (!ta) {
            this.fitCodeEditor(editor, hl?.textContent || '');
            const scroller = editor.querySelector('.code-main');
            scroller?.addEventListener('scroll', () => { if (gutter) gutter.scrollTop = scroller.scrollTop; });
            return;
        }
        ta.addEventListener('input', () => {
            if (id === 'reqBody' && this.requestState) {
                this.requestState.body = ta.value;
                this.requestState.rawBody = ta.value;
            }
            if (id === 'preScript' && this.requestState) this.requestState.preScript = ta.value;
            if (id === 'testScript' && this.requestState) this.requestState.testScript = ta.value;
            paint();
        });
        ta.addEventListener('scroll', () => {
            if (hl) {
                hl.scrollTop = ta.scrollTop;
                hl.scrollLeft = ta.scrollLeft;
            }
            if (gutter) gutter.scrollTop = ta.scrollTop;
        });
        paint();
    }

    fitCodeEditor(editor, text) {
        if (!editor || editor.classList.contains('is-readonly')) return;
        const lines = Math.max(12, String(text || '').split('\n').length + 1);
        editor.style.height = `${Math.round(lines * 19.375 + 24)}px`;
    }

    lineGutter(text) {
        const n = Math.max(1, String(text || '').split('\n').length);
        let lines = '';
        for (let i = 1; i <= n; i++) lines += `${i}\n`;
        return lines.trimEnd();
    }

    renderDocs(endpoint) {
        const step = this.currentFlowStep();
        const record = this.endpointMap.get(this.currentId);
        const state = this.requestState || this.buildRequestState(endpoint, step);
        const method = String(state.method || endpoint?.request?.method || 'GET').toUpperCase();
        const url = state.url || this.templateUrl(endpoint?.request || {});
        let html = this.endpointDocsHtml(endpoint, record?.crumbs || []);
        if (!String(html || '').trim()) html = step?.docsHtml || '';
        return `<article class="docs">
            <div class="docs-endpoint-head">
                <span class="pill-${method.toLowerCase()}">${this.escape(method)}</span>
                <code>${this.escape(url)}</code>
            </div>
            ${html ? `<div class="docs-body">${this.renderDocHtml(html)}</div>` : '<p>No documentation has been written for this API yet.</p>'}
        </article>`;
    }

    updatePreview() {
        const el = document.getElementById('resolvedUrl');
        if (el) el.textContent = this.previewUrl();
    }

    currentFlowStep() {
        const product = this.productById(this.catalogProduct);
        if (!product || !this.currentId) return null;
        let found = null;
        this.walkTree(this.productTree(product), (node) => {
            if (found || node.type === 'folder') return;
            if (this.resolveFlowStep(node)?.id === this.currentId) found = node;
        });
        return found;
    }

    scriptText(scripts, listen) {
        const found = (scripts || []).find((item) => item && item.listen === listen);
        if (!found) return '';
        const exec = found.exec != null ? found.exec : (found.script && found.script.exec);
        if (Array.isArray(exec)) return exec.join('\n');
        return exec ? String(exec) : '';
    }

    itemScript(item, listen) {
        const events = (item && item.event) || [];
        const found = events.find((event) => event && event.listen === listen);
        const exec = found && found.script && found.script.exec;
        if (Array.isArray(exec)) return exec.join('\n');
        return typeof exec === 'string' ? exec : '';
    }

    scriptFor(listen) {
        if (this.requestState) {
            if (listen === 'prerequest' && this.requestState.preScript != null) return this.requestState.preScript;
            if (listen === 'test' && this.requestState.testScript != null) return this.requestState.testScript;
        }
        const step = this.currentFlowStep();
        const fromStep = this.scriptText(step && step.scripts, listen);
        if (fromStep.trim()) return fromStep;
        const item = this.endpointMap.get(this.currentId)?.item;
        const fromItem = this.scriptText(item && item.scripts, listen);
        if (fromItem.trim()) return fromItem;
        return this.itemScript(item, listen);
    }

    highlightEnvTokens(text) {
        return this.escape(text).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, key) => {
            const name = String(key || '').trim();
            return `<span class="env-token" data-env-var="${this.escape(name)}">${this.escape(m)}</span>`;
        }) || '&nbsp;';
    }

    highlightVarsHtml(escaped) {
        return String(escaped || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, key) => {
            const name = String(key || '').trim();
            return `<span class="json-var" data-env-var="${name}">${m}</span>`;
        });
    }

    highlightJson(source) {
        const s = String(source ?? '');
        let out = '';
        let i = 0;
        const len = s.length;
        while (i < len) {
            const ch = s.charAt(i);
            if (ch === '/' && s.charAt(i + 1) === '/') {
                let j = i + 2;
                while (j < len && s.charAt(j) !== '\n') j += 1;
                out += `<span class="json-comment">${this.escape(s.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            if (ch === '/' && s.charAt(i + 1) === '*') {
                let j = i + 2;
                while (j + 1 < len && !(s.charAt(j) === '*' && s.charAt(j + 1) === '/')) j += 1;
                j = Math.min(len, j + 2);
                out += `<span class="json-comment">${this.escape(s.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            if (ch === '"') {
                let j = i + 1;
                while (j < len) {
                    if (s.charAt(j) === '\\') {
                        j += 2;
                        continue;
                    }
                    if (s.charAt(j) === '"') {
                        j += 1;
                        break;
                    }
                    j += 1;
                }
                const raw = s.slice(i, j);
                let k = j;
                while (k < len && /\s/.test(s.charAt(k))) k += 1;
                const isKey = s.charAt(k) === ':';
                out += `<span class="${isKey ? 'json-key' : 'json-string'}">${this.highlightVarsHtml(this.escape(raw))}</span>`;
                i = j;
                continue;
            }
            if ((ch === '-' || (ch >= '0' && ch <= '9')) && (i === 0 || /[:\[,{\s]/.test(s.charAt(i - 1)))) {
                let j = i + 1;
                while (j < len && /[0-9.eE+-]/.test(s.charAt(j))) j += 1;
                out += `<span class="json-number">${this.escape(s.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            const word = s.slice(i, i + 5);
            if (word.indexOf('true') === 0 || word.indexOf('null') === 0) {
                const lit = word.indexOf('true') === 0 ? 'true' : 'null';
                out += `<span class="json-bool">${lit}</span>`;
                i += lit.length;
                continue;
            }
            if (s.slice(i, i + 5) === 'false') {
                out += '<span class="json-bool">false</span>';
                i += 5;
                continue;
            }
            out += this.escape(ch);
            i += 1;
        }
        return out;
    }

    highlightScript(source) {
        const s = String(source ?? '');
        if (!s) return '&nbsp;';
        const keywords = new Set([
            'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
            'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import',
            'in', 'instanceof', 'let', 'new', 'of', 'return', 'static', 'super', 'switch', 'this',
            'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'true', 'false', 'null', 'undefined',
        ]);
        let out = '';
        let i = 0;
        const len = s.length;
        while (i < len) {
            const ch = s.charAt(i);
            const next = s.charAt(i + 1);
            if (ch === '/' && next === '/') {
                let j = i + 2;
                while (j < len && s.charAt(j) !== '\n') j += 1;
                out += `<span class="js-comment">${this.escape(s.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            if (ch === '/' && next === '*') {
                let j = i + 2;
                while (j + 1 < len && !(s.charAt(j) === '*' && s.charAt(j + 1) === '/')) j += 1;
                j = Math.min(len, j + 2);
                out += `<span class="js-comment">${this.escape(s.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
                const quote = ch;
                let j = i + 1;
                while (j < len) {
                    if (s.charAt(j) === '\\') {
                        j += 2;
                        continue;
                    }
                    if (s.charAt(j) === quote) {
                        j += 1;
                        break;
                    }
                    if (quote === '`' && s.charAt(j) === '\n') break;
                    j += 1;
                }
                out += `<span class="js-string">${this.highlightVarsHtml(this.escape(s.slice(i, j)))}</span>`;
                i = j;
                continue;
            }
            if ((ch === '-' || (ch >= '0' && ch <= '9')) && (i === 0 || /[([{=,;:?!~&|<>+\-*/%\s]/.test(s.charAt(i - 1)))) {
                let j = i + 1;
                while (j < len && /[0-9.eExXbBoO_]/.test(s.charAt(j))) j += 1;
                out += `<span class="js-number">${this.escape(s.slice(i, j))}</span>`;
                i = j;
                continue;
            }
            if (/[A-Za-z_$]/.test(ch)) {
                let j = i + 1;
                while (j < len && /[A-Za-z0-9_$]/.test(s.charAt(j))) j += 1;
                const word = s.slice(i, j);
                let k = j;
                while (k < len && /\s/.test(s.charAt(k))) k += 1;
                if (keywords.has(word)) out += `<span class="js-keyword">${this.escape(word)}</span>`;
                else if (s.charAt(k) === '(') out += `<span class="js-fn">${this.escape(word)}</span>`;
                else out += `<span class="js-ident">${this.escape(word)}</span>`;
                i = j;
                continue;
            }
            out += this.escape(ch);
            i += 1;
        }
        return out || '&nbsp;';
    }

    envValueField(field) {
        const value = String(field.value ?? '');
        const path = this.escape(field.path);
        if (value.length > 80) {
            return `<div class="env-input-wrap env-input-wrap-area">
                <pre class="env-input-overlay env-area-overlay">${this.highlightEnvTokens(value)}</pre>
                <textarea data-field-path="${path}">${this.escape(value)}</textarea>
            </div>`;
        }
        return `<div class="env-input-wrap">
            <div class="env-input-overlay">${this.highlightEnvTokens(value)}</div>
            <input type="text" data-field-path="${path}" value="${this.escape(value)}">
        </div>`;
    }

    envJsonEditor(text) {
        const raw = String(text || '');
        return `<div class="env-json-wrap">
            <pre class="env-json-overlay" id="rawBodyHighlight">${this.highlightJson(raw)}</pre>
            <textarea class="json-editor" id="rawBody" spellcheck="false">${this.escape(raw)}</textarea>
        </div>`;
    }

    bindEnvOverlays() {
        const urlInput = document.getElementById('urlInput');
        const urlOverlay = document.getElementById('urlHighlight');
        if (urlInput && urlOverlay) {
            const paintUrl = () => {
                urlOverlay.innerHTML = this.highlightEnvTokens(urlInput.value);
                urlOverlay.scrollLeft = urlInput.scrollLeft;
            };
            urlInput.addEventListener('input', paintUrl);
            urlInput.addEventListener('scroll', paintUrl);
        }
        document.querySelectorAll('.env-input-wrap').forEach((wrap) => {
            const input = wrap.querySelector('input, textarea');
            const overlay = wrap.querySelector('.env-input-overlay');
            if (!input || !overlay) return;
            const paint = () => {
                overlay.innerHTML = this.highlightEnvTokens(input.value);
                overlay.scrollTop = input.scrollTop;
                overlay.scrollLeft = input.scrollLeft;
            };
            input.addEventListener('input', paint);
            input.addEventListener('scroll', paint);
        });
    }

    onEnvTokenHover(e) {
        if (e.target && e.target.closest && e.target.closest('#envTip')) {
            this.cancelEnvTipHide();
            return;
        }
        const el = e.target && e.target.closest ? e.target.closest('[data-env-var]') : null;
        if (!el) return;
        const name = el.getAttribute('data-env-var');
        if (!name) return;
        this.cancelEnvTipHide();
        this._envTipKey = name;
        const tip = document.getElementById('envTip');
        const input = document.getElementById('envTipValue');
        if (!tip) return;
        if (input) input.value = this.lookupVar(name);
        tip.classList.remove('hidden');
        const box = el.getBoundingClientRect();
        const width = Math.min(340, window.innerWidth - 24);
        let left = box.left;
        if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
        if (left < 12) left = 12;
        let top = box.bottom + 8;
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        const tipBox = tip.getBoundingClientRect();
        if (tipBox.bottom > window.innerHeight - 8) {
            tip.style.top = `${Math.max(8, box.top - tipBox.height - 8)}px`;
        }
    }

    cancelEnvTipHide() {
        if (this._envTipTimer) {
            clearTimeout(this._envTipTimer);
            this._envTipTimer = null;
        }
    }

    hideEnvTip() {
        this.cancelEnvTipHide();
        this._envTipTimer = setTimeout(() => {
            document.getElementById('envTip')?.classList.add('hidden');
            this._envTipKey = '';
        }, 180);
    }

    saveEnvTip() {
        const key = this._envTipKey;
        const input = document.getElementById('envTipValue');
        if (!key || !input) return;
        this.env[key] = input.value;
        this.persistEnv();
        this.hideEnvTip();
        if (this.currentId) this.updatePreview();
    }

    bindPmSplitter() {
        const split = document.getElementById('pmSplitter');
        const editor = document.querySelector('.postman-editor');
        if (!split || !editor) return;
        split.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            split.setPointerCapture(e.pointerId);
            const rect = editor.getBoundingClientRect();
            const onMove = (ev) => {
                const ratio = (ev.clientY - rect.top) / rect.height;
                this.pgSplit = Math.min(0.8, Math.max(0.24, ratio));
                editor.style.setProperty('--pm-split', String(this.pgSplit));
            };
            const onUp = () => {
                split.removeEventListener('pointermove', onMove);
                split.removeEventListener('pointerup', onUp);
                try { localStorage.setItem('pgPmSplit', String(this.pgSplit)); } catch (err) { /* ignore */ }
            };
            split.addEventListener('pointermove', onMove);
            split.addEventListener('pointerup', onUp);
        });
    }

    withEnvValues(values, fn) {
        const saved = this.env;
        this.env = Object.assign({}, saved, values);
        try {
            return fn();
        } finally {
            this.env = saved;
        }
    }

    runPmScript(code, context) {
        const visualizer = { template: '', data: null };
        const source = String(code || '').trim();
        if (!source) return visualizer;
        const env = context.values || {};
        const headersObj = (context.response && context.response.headers) || {};
        const headerGet = (name) => {
            const want = String(name || '').toLowerCase();
            const key = Object.keys(headersObj).find((item) => item.toLowerCase() === want);
            return key ? String(headersObj[key]) : '';
        };
        const pm = {
            environment: {
                get: (key) => (env[key] != null && env[key] !== '' ? String(env[key]) : ''),
                set: (key, value) => {
                    if (!key) return;
                    env[String(key)] = value == null ? '' : String(value);
                    context.dirty = true;
                },
                unset: (key) => { if (key) { delete env[key]; context.dirty = true; } },
            },
            variables: {
                get: (key) => (env[key] != null ? String(env[key]) : ''),
                set: (key, value) => pm.environment.set(key, value),
            },
            collectionVariables: {
                get: (key) => (env[key] != null ? String(env[key]) : ''),
                set: (key, value) => pm.environment.set(key, value),
            },
            request: context.request || {},
            response: context.response ? {
                code: context.response.status || 0,
                status: context.response.status || 0,
                text: () => String(context.response.body ?? ''),
                json: () => JSON.parse(String(context.response.body ?? '') || '{}'),
                headers: { get: headerGet },
            } : undefined,
            visualizer: {
                set: (template, data) => {
                    visualizer.template = String(template || '');
                    visualizer.data = data || {};
                },
            },
            test: (name, fn) => { try { if (typeof fn === 'function') fn(); } catch (e) { /* ignore */ } },
            expect: () => ({ to: { eql() {}, equal() {}, a() {}, ok: true } }),
            sendRequest: () => {},
        };
        const postman = {
            setEnvironmentVariable: (key, value) => pm.environment.set(key, value),
            getEnvironmentVariable: (key) => pm.environment.get(key),
            clearEnvironmentVariable: (key) => pm.environment.unset(key),
            setGlobalVariable: (key, value) => pm.environment.set(key, value),
            getGlobalVariable: (key) => pm.environment.get(key),
        };
        const responseBody = context.response ? String(context.response.body ?? '') : '';
        try {
            const runner = new Function('pm', 'postman', 'responseBody', 'console', source);
            runner(pm, postman, responseBody, { log() {}, warn() {}, error() {}, info() {} });
        } catch (e) {
            context.scriptError = e.message;
        }
        return visualizer;
    }

    envBag() {
        const bag = {};
        const mapped = this.mappedEnv();
        Object.keys(mapped || {}).forEach((key) => { bag[key] = mapped[key]; });
        Object.keys(this.env || {}).forEach((key) => {
            if (this.env[key] != null && this.env[key] !== '') bag[key] = this.env[key];
        });
        return bag;
    }

    applyScriptEnv(values) {
        Object.keys(values || {}).forEach((key) => {
            this.env[key] = values[key];
        });
        this.persistEnv();
    }

    omitEmptyJson(value) {
        if (Array.isArray(value)) {
            return value.map((item) => this.omitEmptyJson(item)).filter((item) => {
                if (item === '' || item == null) return false;
                if (item && typeof item === 'object' && !Object.keys(item).length) return false;
                return true;
            });
        }
        if (value && typeof value === 'object') {
            const out = {};
            Object.keys(value).forEach((key) => {
                if (!String(key).trim()) return;
                const next = this.omitEmptyJson(value[key]);
                if (next === '' || next == null) return;
                if (next && typeof next === 'object' && !Object.keys(next).length) return;
                out[key] = next;
            });
            return out;
        }
        return value;
    }

    compactPreviewBody(body) {
        if (body == null || body === '') return body;
        const raw = String(body);
        if (/^\s*--/.test(raw) || raw.includes('Content-Disposition:')) return raw;
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return JSON.stringify(this.omitEmptyJson(JSON.parse(this.stripJsonComments(raw))), null, 2);
            } catch (e) { /* keep falling through */ }
        }
        if (raw.includes('=') && !trimmed.startsWith('{') && !trimmed.includes('\n')) {
            return raw.split('&').filter((part) => decodeURIComponent((part.split('=')[0] || '').replace(/\+/g, ' ')).trim()).join('&');
        }
        return raw.split(/\r?\n/).filter((line) => line.trim()).join('\n');
    }

    toggleSendPreview() {
        const wrap = document.getElementById('sendPreview');
        const body = document.getElementById('sendPreviewBody');
        const methodEl = document.getElementById('sendPreviewMethod');
        if (!wrap || !body) return;
        if (!wrap.classList.contains('hidden')) {
            this.closeSendPreview();
            return;
        }
        this.syncBuilderInputs();
        const values = this.envBag();
        this.runPmScript(this.scriptFor('prerequest'), { values, dirty: false });
        const payload = this.withEnvValues(values, () => ({
            method: this.requestState.method,
            url: this.buildUrl(),
            headers: this.collectHeaders(),
            body: this.collectBody(),
        }));
        const method = String(payload.method || 'GET').toUpperCase();
        const compactBody = this.compactPreviewBody(payload.body);
        const lines = [payload.url || '', '', 'Headers'];
        const keys = Object.keys(payload.headers || {});
        if (!keys.length) lines.push('(none)');
        keys.forEach((key) => lines.push(`${key}: ${payload.headers[key]}`));
        lines.push('', 'Body');
        lines.push(compactBody == null || compactBody === '' ? '(empty)' : String(compactBody));
        const text = lines.join('\n');
        this._sendPreviewText = `${method} ${payload.url || ''}\n\n${text}`;
        if (methodEl) {
            methodEl.textContent = method;
            methodEl.className = `send-preview-method method-${method.toLowerCase()}`;
        }
        body.textContent = text;
        wrap.classList.remove('hidden');
        wrap.hidden = false;
    }

    openTesterTab() {
        this.syncBuilderInputs();
        const url = new URL(window.location.href);
        url.searchParams.set('focus', 'tester');
        if (this.currentId) url.searchParams.set('endpoint', this.currentId);
        window.open(url.toString(), '_blank', 'noopener');
    }

    closeSendPreview() {
        const wrap = document.getElementById('sendPreview');
        wrap?.classList.add('hidden');
        if (wrap) wrap.hidden = true;
    }

    previewUrl() {
        try {
            return this.buildUrl();
            } catch {
            return this.resolve(this.requestState?.url || '');
        }
    }

    buildUrl() {
        let url = this.resolve(this.requestState.url || '');
        this.requestState.pathVars.forEach((p) => {
            const value = this.resolve(p.value);
            url = url.replaceAll(`{{${p.key}}}`, value.includes('{{') ? value : encodeURIComponent(value));
        });
        const params = new URLSearchParams();
        this.requestState.query.filter((q) => q.enabled && q.key).forEach((q) => {
            params.append(q.key, this.resolve(q.value));
        });
        const qs = params.toString();
        if (qs) url += (url.includes('?') ? '&' : '?') + qs;
        return url;
    }

    resolve(value) {
        if (value == null) return '';
        let out = String(value);
        out = out.replace(/\{\{\$randomFirstName\}\}/g, 'Omar');
        out = out.replace(/\{\{\$randomLastName\}\}/g, 'AlSaid');
        out = out.replace(/\{\{\$randomExampleEmail\}\}/g, 'user@example.com');
        out = out.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
            const value = this.lookupVar(key);
            if (value === '') return `{{${key}}}`;
            return key === 'host' ? String(value).replace(/\/+$/, '') : value;
        });
        return out;
    }

    collectHeaders() {
        const headers = {};
        (this.requestState.headers || []).filter((h) => h.enabled && h.key).forEach((h) => {
            headers[h.key] = this.resolve(h.value);
        });
        const auth = this.requestState.auth || { type: 'none' };
        if (auth.type === 'bearer' && auth.token) {
            headers.Authorization = `Bearer ${this.resolve(auth.token)}`;
        }
        if (auth.type === 'basic' && (auth.username || auth.password)) {
            headers.Authorization = `Basic ${btoa(`${this.resolve(auth.username || '')}:${this.resolve(auth.password || '')}`)}`;
        }
        const method = String(this.requestState.method || 'GET').toUpperCase();
        const mode = this.requestState.bodyMode || (this.requestState.body || this.requestState.rawBody ? 'raw' : 'none');
        if (['GET', 'HEAD'].indexOf(method) < 0 && mode !== 'none') {
            const hasCt = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
            if (!hasCt) {
                if (mode === 'raw') {
                    headers['Content-Type'] = 'application/json';
                } else if (mode === 'form-data') {
                    this._formBoundary = `----TakafulForm${Date.now()}`;
                    headers['Content-Type'] = `multipart/form-data; boundary=${this._formBoundary}`;
                } else if (mode === 'urlencoded') {
                    headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }
            }
        } else {
            this._formBoundary = null;
        }
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'accept')) {
            headers.Accept = 'application/json';
        }
        return headers;
    }

    collectBody() {
        const method = String(this.requestState.method || 'GET').toUpperCase();
        if (['GET', 'HEAD'].includes(method)) return null;
        this.syncBuilderInputs();
        const mode = this.requestState.bodyMode || (this.requestState.body || this.requestState.rawBody ? 'raw' : 'none');
        if (mode === 'none') return null;
        if (mode === 'raw') {
            const cleaned = this.stripJsonComments(this.requestState.body || this.requestState.rawBody || '').trim();
            return cleaned ? this.resolve(cleaned) : null;
        }
        if (mode === 'form-data') {
            const rows = this.normalizeKv(this.requestState.formData).filter((row) => row.enabled && String(row.key || '').trim());
            const boundary = this._formBoundary || `----TakafulForm${Date.now()}`;
            return rows.map((row) => {
                const key = this.resolve(row.key);
                const val = this.resolve(row.value);
                return `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
            }).join('') + `--${boundary}--\r\n`;
        }
        if (mode === 'urlencoded') {
            const rows = this.normalizeKv(this.requestState.urlencoded).filter((row) => row.enabled && String(row.key || '').trim());
            return rows.map((row) => `${encodeURIComponent(this.resolve(row.key))}=${encodeURIComponent(this.resolve(row.value))}`).join('&');
        }
        return null;
    }

    async sendRequest() {
        this.syncBuilderInputs();
        this.closeSendPreview();
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending…';
        }
        this.showLoader('body');
        const started = performance.now();
        try {
            const values = this.envBag();
            const preCtx = { values, dirty: false };
            this.runPmScript(this.scriptFor('prerequest'), preCtx);
            const payload = this.withEnvValues(values, () => ({
                url: this.buildUrl(),
                method: this.requestState.method,
                headers: this.collectHeaders(),
                body: this.collectBody(),
            }));
            if (preCtx.dirty) this.applyScriptEnv(values);
            if (!/^https?:\/\//i.test(payload.url) || payload.url.includes('{{')) {
                throw new Error('Resolve the URL first. Set host (and other variables) in Environment.');
            }
            let data;
            const usePhp = typeof StaticRuntime === 'undefined' || await StaticRuntime.phpAvailable();
            if (usePhp) {
                const proxied = await fetch('proxy.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const proxyMissing = typeof StaticRuntime !== 'undefined'
                    ? StaticRuntime.isProxyUnavailable(proxied)
                    : proxied.status === 404;
                if (proxied.ok && !proxyMissing) {
                    data = await proxied.json();
                } else if (proxyMissing) {
                    data = await this.directFetch(payload);
                } else {
                    data = await proxied.json().catch(() => ({ error: `Proxy error ${proxied.status}` }));
                    if (!data.body && data.error) throw new Error(data.error);
                }
            } else {
                data = await this.directFetch(payload);
            }
            this.response = {
                status: data.status,
                body: data.body ?? data.error ?? data,
                headers: data.headers || {},
                timeMs: data.timeMs ?? Math.round(performance.now() - started),
                size: data.size ?? String(data.body || '').length,
            };
            this.captureToken(this.response.body);
            const after = this.envBag();
            const testCtx = { values: after, dirty: false, response: this.response };
            const visualizer = this.runPmScript(this.scriptFor('test'), testCtx);
            if (testCtx.dirty) this.applyScriptEnv(after);
            this.visualizer = visualizer.template ? visualizer : null;
            this.responseCollapsed = new Set();
            this.responseHit = 0;
            this.responseTab = this.visualizer ? 'preview' : 'body';
        } catch (error) {
            this.response = { status: 0, body: error.message, headers: {}, timeMs: Math.round(performance.now() - started), size: 0 };
            this.visualizer = null;
            this.responseTab = 'body';
        } finally {
            this.hideLoader();
            this.renderEndpoint();
        }
    }

    async directFetch(payload) {
        const init = { method: payload.method, headers: payload.headers };
        if (payload.body && !['GET', 'HEAD'].includes(payload.method)) init.body = payload.body;
        try {
            const res = await fetch(payload.url, init);
            const body = await res.text();
            const headers = {};
            res.headers.forEach((value, key) => { headers[key] = value; });
            return { status: res.status, body, headers, timeMs: null, size: body.length };
        } catch (err) {
            const hint = 'Browser blocked the request (CORS). On GitHub Pages there is no PHP proxy — host APIs must allow this origin, or run the app on XAMPP/PHP hosting for proxy.php.';
            throw new Error(err && err.message ? `${err.message}. ${hint}` : hint);
        }
    }

    captureToken(body) {
        try {
            const parsed = typeof body === 'string' ? JSON.parse(body) : body;
            const token = parsed?.data?.token;
            if (token) {
                this.env.token = token;
                this.env.ins_token = token;
                this.env.encoded_token = encodeURIComponent(token);
                this.env.encoded_ins_token = encodeURIComponent(token);
                this.persistEnv();
            }
            } catch {
            /* not json */
        }
    }

    fieldsFromJson(raw) {
        const parsed = this.parseLooseJson(raw);
        if (!parsed || typeof parsed !== 'object') return [];
        return this.flatten(parsed);
    }

    flatten(value, prefix = '') {
        if (value === null || value === undefined) return [{ path: prefix, value: '' }];
        if (Array.isArray(value)) {
            if (!value.length) return [{ path: prefix, value: '[]' }];
            return value.flatMap((item, i) => this.flatten(item, prefix ? `${prefix}[${i}]` : `[${i}]`));
        }
        if (typeof value === 'object') {
            const keys = Object.keys(value);
            if (!keys.length) return [{ path: prefix, value: '{}' }];
            return keys.flatMap((key) => this.flatten(value[key], prefix ? `${prefix}.${key}` : key));
        }
        return [{ path: prefix, value }];
    }

    jsonFromFields(fields, fallbackRaw) {
        const original = this.parseLooseJson(fallbackRaw);
        if (!original || typeof original !== 'object') return fallbackRaw || '';
        const clone = JSON.parse(JSON.stringify(original));
        fields.forEach((field) => this.setPath(clone, field.path, this.coerce(field.value)));
        return JSON.stringify(clone, null, 2);
    }

    setPath(obj, path, value) {
        const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
        let cur = obj;
        tokens.forEach((token, i) => {
            if (i === tokens.length - 1) {
                cur[token] = value;
            } else {
                if (cur[token] == null) cur[token] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
                cur = cur[token];
            }
        });
    }

    coerce(value) {
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (value === 'null') return null;
        if (value !== '' && !Number.isNaN(Number(value)) && String(Number(value)) === String(value).trim()) return Number(value);
        return value;
    }

    parseLooseJson(raw) {
        if (!raw || !String(raw).trim()) return null;
        const cleaned = this.stripJsonComments(raw)
            .replace(/:\s*(\{\{[^}]+\}\})/g, ': "$1"');
        try {
            return JSON.parse(cleaned);
            } catch {
            return null;
        }
    }

    stripJsonComments(raw) {
        const s = String(raw ?? '');
        let out = '';
        let i = 0;
        let inStr = false;
        let quote = '';
        let esc = false;
        while (i < s.length) {
            const ch = s.charAt(i);
            const next = s.charAt(i + 1);
            if (inStr) {
                out += ch;
                if (esc) esc = false;
                else if (ch === '\\') esc = true;
                else if (ch === quote) inStr = false;
                i += 1;
                continue;
            }
            if (ch === '"' || ch === "'") {
                inStr = true;
                quote = ch;
                out += ch;
                i += 1;
                continue;
            }
            if (ch === '/' && next === '/') {
                while (i < s.length && s.charAt(i) !== '\n') i += 1;
                continue;
            }
            if (ch === '/' && next === '*') {
                i += 2;
                while (i + 1 < s.length && !(s.charAt(i) === '*' && s.charAt(i + 1) === '/')) i += 1;
                i += 2;
                continue;
            }
            out += ch;
            i += 1;
        }
        return out.replace(/,\s*([}\]])/g, '$1');
    }

    prettyBody(raw) {
        return this.beautifyJsonc(raw);
    }

    beautifyJsonc(source) {
        const s = String(source ?? '');
        if (!s.trim()) return '';
        let out = '';
        let indent = 0;
        const pad = '    ';
        let i = 0;
        let inStr = false;
        let quote = '';
        let esc = false;
        let pendingNl = false;
        const nl = () => {
            out += `\n${pad.repeat(indent)}`;
            pendingNl = false;
        };
        while (i < s.length) {
            const ch = s.charAt(i);
            const next = s.charAt(i + 1);
            if (inStr) {
                out += ch;
                if (esc) esc = false;
                else if (ch === '\\') esc = true;
                else if (ch === quote) inStr = false;
                i += 1;
                continue;
            }
            if (ch === '"' || ch === "'") {
                if (pendingNl) nl();
                inStr = true;
                quote = ch;
                out += ch;
                i += 1;
                continue;
            }
            if (ch === '/' && next === '/') {
                if (pendingNl || /[{[,]$/.test(out)) nl();
                else if (out && !/[\n ]$/.test(out)) out += ' ';
                let j = i + 2;
                while (j < s.length && s.charAt(j) !== '\n') j += 1;
                out += s.slice(i, j).replace(/[ \t]+$/, '');
                pendingNl = true;
                i = j;
                if (s.charAt(i) === '\n') i += 1;
                continue;
            }
            if (ch === '/' && next === '*') {
                if (pendingNl) nl();
                else if (out && !/[\n ]$/.test(out)) out += ' ';
                let j = i + 2;
                while (j + 1 < s.length && !(s.charAt(j) === '*' && s.charAt(j + 1) === '/')) j += 1;
                j = Math.min(s.length, j + 2);
                out += s.slice(i, j);
                i = j;
                continue;
            }
            if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
                i += 1;
                continue;
            }
            if (ch === '{' || ch === '[') {
                if (pendingNl) nl();
                out += ch;
                indent += 1;
                let k = i + 1;
                while (k < s.length && /[ \t\r\n]/.test(s.charAt(k))) k += 1;
                if (s.charAt(k) !== (ch === '{' ? '}' : ']')) pendingNl = true;
                i += 1;
                continue;
            }
            if (ch === '}' || ch === ']') {
                indent = Math.max(0, indent - 1);
                if (/[\[{]$/.test(out)) out += ch;
                else {
                    nl();
                    out += ch;
                }
                pendingNl = false;
                i += 1;
                continue;
            }
            if (ch === ',') {
                out += ch;
                pendingNl = true;
                i += 1;
                continue;
            }
            if (ch === ':') {
                out += ': ';
                i += 1;
                continue;
            }
            if (pendingNl) nl();
            out += ch;
            i += 1;
        }
        return `${out.replace(/[ \t]+\n/g, '\n').replace(/\s+$/, '')}\n`;
    }

    formatResponse(body) {
        if (body == null) return '';
        if (typeof body === 'object') return JSON.stringify(body, null, 2);
        try {
            return JSON.stringify(JSON.parse(body), null, 2);
        } catch {
            return String(body);
        }
    }

    looksLikeHtml(text) {
        const s = String(text || '').trim();
        return s.startsWith('<') && /<\/[a-z][a-z0-9:-]*>/i.test(s);
    }

    emptyPreviewHtml() {
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#2b2b2b;color:#d8d8d8;font-family:Nunito Sans,sans-serif}</style></head><body>
            <div style="padding:36px 20px;text-align:center;line-height:1.55">
                <p style="margin:0 0 8px;font-weight:800;color:#f0f0f0">No HTML preview</p>
                <p style="margin:0;font-size:13px">Use a Post-response script to render HTML here:<br><code style="color:#ff8a65">pm.visualizer.set(template, data)</code></p>
            </div>
        </body></html>`;
    }

    previewBaseStyle() {
        return 'html,body{margin:0;background:#2b2b2b;color:#e6e6e6}';
    }

    wrapVisualizerDoc(html) {
        const s = String(html || '').trim();
        if (!s) return this.emptyPreviewHtml();
        const style = `<style>${this.previewBaseStyle()}</style>`;
        if (/<!DOCTYPE/i.test(s) || /<html[\s>]/i.test(s)) {
            if (/<head[\s>]/i.test(s)) return s.replace(/<head([^>]*)>/i, `<head$1>${style}`);
            return s.replace(/<html([^>]*)>/i, `<html$1><head>${style}</head>`);
        }
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${style}</head><body>${s}</body></html>`;
    }

    renderVisualizerHtml(visualizer) {
        const template = visualizer && visualizer.template ? String(visualizer.template) : '';
        if (!template) return '';
        try {
            if (window.Handlebars) return window.Handlebars.compile(template)(visualizer.data || {});
        } catch (e) {
            return `<pre style="color:#c43622;padding:16px;font-family:monospace">${this.escape(e.message)}</pre>`;
        }
        return template;
    }

    applyVisualizerFrame() {
        const frame = document.getElementById('pgVisualizer');
        if (!frame) return;
        if (this.visualizer && this.visualizer.template) {
            frame.srcdoc = this.wrapVisualizerDoc(this.renderVisualizerHtml(this.visualizer));
            return;
        }
        const raw = this.response && this.response.body != null
            ? (typeof this.response.body === 'object' ? '' : String(this.response.body))
            : '';
        if (this.looksLikeHtml(raw)) {
            frame.srcdoc = this.wrapVisualizerDoc(raw);
            return;
        }
        frame.srcdoc = this.emptyPreviewHtml();
    }

    responseFilterBarHtml(showCollapse) {
        const q = this.escape(this.responseSearch || '');
        return `
            <div class="response-filter-bar">
                <div class="response-search-wrap">
                    <input id="responseSearch" type="text" placeholder="Search values" value="${q}" autocomplete="off" spellcheck="false" aria-label="Search response">
                </div>
                <span class="response-search-meta" id="responseSearchMeta"></span>
                <button class="json-hit-btn" id="responseSearchPrev" type="button" title="Previous match" hidden>↑</button>
                <button class="json-hit-btn" id="responseSearchNext" type="button" title="Next match" hidden>↓</button>
                ${showCollapse ? `
                    <button class="linkish" id="jsonExpandAll" type="button">Expand all</button>
                    <button class="linkish" id="jsonCollapseAll" type="button">Collapse all</button>
                ` : ''}
            </div>
        `;
    }

    responseBodyHtml(body) {
        const raw = body != null && typeof body === 'object' ? JSON.stringify(body) : String(body ?? '');
        const parsed = window.JsonViewer ? JsonViewer.parse(raw) : { ok: false, value: raw };
        if (parsed.ok && typeof parsed.value === 'object' && parsed.value !== null) {
            return `
                <div class="json-viewer" id="responseViewer" data-mode="tree">
                    ${this.responseFilterBarHtml(true)}
                    ${JsonViewer.treeHtml(parsed.value, this.responseCollapsed)}
                </div>
            `;
        }
        const text = this.formatResponse(body);
        this._responseRawText = text;
        return `
            <div class="json-viewer" id="responseViewer" data-mode="raw">
                ${this.responseFilterBarHtml(false)}
                <pre class="json-raw" id="responseRawBody">${this.escape(text)}</pre>
            </div>
        `;
    }

    bindResponseViewer() {
        const viewer = document.getElementById('responseViewer');
        const tree = document.getElementById('responseJsonTree');
        const search = document.getElementById('responseSearch');
        if (!this.responseCollapsed) this.responseCollapsed = new Set();
        tree?.addEventListener('click', (e) => {
            const toggle = e.target.closest('.json-toggle');
            if (!toggle) return;
            JsonViewer.toggleNode(toggle.closest('.json-node'), this.responseCollapsed);
        });
        document.getElementById('jsonExpandAll')?.addEventListener('click', () => {
            JsonViewer.setAllCollapsed(tree, this.responseCollapsed, false);
        });
        document.getElementById('jsonCollapseAll')?.addEventListener('click', () => {
            JsonViewer.setAllCollapsed(tree, this.responseCollapsed, true);
        });
        const runSearch = () => {
            this.responseSearch = search ? search.value : '';
            this.responseHit = 0;
            this.applyResponseSearch();
        };
        search?.addEventListener('input', runSearch);
        search?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            this.stepResponseHit(e.shiftKey ? -1 : 1);
        });
        document.getElementById('responseSearchPrev')?.addEventListener('click', () => this.stepResponseHit(-1));
        document.getElementById('responseSearchNext')?.addEventListener('click', () => this.stepResponseHit(1));
        if (viewer?.dataset.mode === 'raw') {
            this._responseRawText = document.getElementById('responseRawBody')?.textContent || this._responseRawText || '';
        }
        if (search && viewer) JsonViewer.attachSuggestions(search, JsonViewer.collectSuggestions(viewer));
        this.applyResponseSearch();
    }

    applyResponseSearch() {
        const q = this.responseSearch || '';
        const viewer = document.getElementById('responseViewer');
        const tree = document.getElementById('responseJsonTree');
        const meta = document.getElementById('responseSearchMeta');
        const prev = document.getElementById('responseSearchPrev');
        const next = document.getElementById('responseSearchNext');
        let result = { count: 0 };
        if (viewer?.dataset.mode === 'tree' && tree) {
            result = JsonViewer.applySearch(tree, q);
            if (!String(q).trim()) JsonViewer.applyCollapsed(tree, this.responseCollapsed);
        } else if (viewer?.dataset.mode === 'raw') {
            result = JsonViewer.applyTextSearch(document.getElementById('responseRawBody'), q, this._responseRawText);
        }
        const n = result.count || 0;
        if (meta) meta.textContent = String(q).trim() ? `${n} match${n === 1 ? '' : 'es'}` : '';
        const showNav = n > 0;
        if (prev) prev.hidden = !showNav;
        if (next) next.hidden = !showNav;
        if (showNav) this.stepResponseHit(0);
    }

    stepResponseHit(delta) {
        const root = document.getElementById('responseJsonTree') || document.getElementById('responseRawBody');
        this.responseHit = JsonViewer.stepHit(root, delta, this.responseHit);
    }

    formatBytes(n) {
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1024 / 1024).toFixed(1)} MB`;
    }

    fileExt(name) {
        const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
        return match ? match[1] : '';
    }

    fileTypeIcon(name) {
        const ext = this.fileExt(name);
        const kinds = {
            pdf: { fill: '#E5252A', label: 'PDF' },
            doc: { fill: '#2B579A', label: 'W' },
            docx: { fill: '#2B579A', label: 'W' },
            xls: { fill: '#217346', label: 'X' },
            xlsx: { fill: '#217346', label: 'X' },
            ppt: { fill: '#D24726', label: 'P' },
            pptx: { fill: '#D24726', label: 'P' },
            png: { fill: '#13aceb', label: 'IMG' },
            jpg: { fill: '#13aceb', label: 'IMG' },
            jpeg: { fill: '#13aceb', label: 'IMG' },
            gif: { fill: '#13aceb', label: 'IMG' },
            webp: { fill: '#13aceb', label: 'IMG' },
            txt: { fill: '#6B7280', label: 'TXT' },
            zip: { fill: '#CA8A04', label: 'ZIP' },
        };
        const kind = kinds[ext] || { fill: '#6B7280', label: (ext || 'FILE').toUpperCase().slice(0, 3) };
        const small = kind.label.length > 1;
        return `<svg class="file-type-icon" viewBox="0 0 32 40" aria-hidden="true">
            <path d="M4 2h16l8 8v26a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="${kind.fill}"/>
            <path d="M20 2v6a2 2 0 0 0 2 2h6" fill="rgba(255,255,255,0.28)"/>
            <text x="16" y="26" text-anchor="middle" fill="#fff" font-size="${small ? 8 : 13}" font-weight="800" font-family="Nunito Sans, sans-serif">${kind.label}</text>
        </svg>`;
    }

    openEnv() {
        this.renderEnvDrawer();
        document.getElementById('envDrawer').classList.add('open');
        document.getElementById('envDrawer').setAttribute('aria-hidden', 'false');
    }

    closeEnv() {
        document.getElementById('envDrawer').classList.remove('open');
        document.getElementById('envDrawer').setAttribute('aria-hidden', 'true');
    }

    renderEnvDrawer() {
        const mapped = this.mappedEnv();
        const keys = Object.keys(this.env);
        Object.keys(mapped).forEach((k) => { if (!keys.includes(k)) keys.push(k); });
        SUGGESTED_VARS.forEach((k) => { if (!keys.includes(k)) keys.unshift(k); });
        const unique = [...new Set(keys)];
        document.getElementById('envBody').innerHTML = unique.map((key) => `
            <div class="env-row">
                <input class="env-key" value="${this.escape(key)}" ${SUGGESTED_VARS.includes(key) ? 'readonly' : ''}>
                <input class="env-val" type="${/pwd|token|password|secret/i.test(key) ? 'password' : 'text'}" value="${this.escape(this.env[key] || '')}" placeholder="${this.escape(mapped[key] || (key === 'host' ? 'https://api.example.com' : ''))}">
                <button class="icon-btn env-del" type="button" ${SUGGESTED_VARS.includes(key) ? 'disabled' : ''}>×</button>
                    </div>
        `).join('');
        document.querySelectorAll('.env-del').forEach((btn) => {
            btn.addEventListener('click', () => btn.closest('.env-row')?.remove());
        });
    }

    addEnvRow() {
        const row = document.createElement('div');
        row.className = 'env-row';
        row.innerHTML = '<input class="env-key" placeholder="variable"><input class="env-val" placeholder="value"><button class="icon-btn env-del" type="button">×</button>';
        row.querySelector('.env-del').addEventListener('click', () => row.remove());
        document.getElementById('envBody').appendChild(row);
    }

    saveEnvFromDrawer() {
        const next = {};
        document.querySelectorAll('.env-row').forEach((row) => {
            const key = row.querySelector('.env-key')?.value.trim();
            const value = row.querySelector('.env-val')?.value ?? '';
            if (key) next[key] = value;
        });
        this.env = next;
        this.persistEnv();
        this.closeEnv();
        if (this.currentId) this.updatePreview();
        else this.renderCatalog();
    }

    async reloadActiveCollection() {
        try {
            const response = await fetch(`collection/active.json?t=${Date.now()}`);
            if (!response.ok) return;
            const loaded = await response.json();
            const stamp = this.stampCollection(loaded);
            if (stamp === this.collectionStamp && this.collection) return;
            this.collectionStamp = stamp;
            this.collection = loaded;
        } catch {
            /* keep current collection */
        }
    }

    downloadCollection() {
        const selected = this.productById(this.catalogProduct);
        if (selected) {
            this.downloadProductCollection(selected);
            return;
        }
        this.downloadAllProductsCollection();
    }

    downloadProductCollection(product) {
        const payload = this.buildPostmanCollection(
            `Takaful Oman — ${product.name}`,
            this.treeToPostmanItems(this.productTree(product))
        );
        this.saveJsonFile(payload, this.collectionFilename(product.name));
    }

    downloadAllProductsCollection() {
        const items = this.allProducts()
            .filter((item) => item.published !== false && this.productTree(item).length)
            .map((item) => ({
                name: item.name,
                item: this.treeToPostmanItems(this.productTree(item)),
            }));
        if (!items.length) {
            window.alert('No product APIs have been published in Admin yet. Open a product after APIs are added, then download.');
            return;
        }
        this.saveJsonFile(
            this.buildPostmanCollection('Takaful Oman — Products & services', items),
            'Takaful_Oman_Products.postman_collection.json'
        );
    }

    treeToPostmanItems(nodes) {
        return (nodes || []).map((node) => {
            if (node.type === 'folder') {
                return {
                    name: node.name || 'Folder',
                    item: this.treeToPostmanItems(node.children || []),
                };
            }
            const rec = this.resolveFlowStep(node);
            if (rec?.item) {
                const copy = JSON.parse(JSON.stringify(rec.item));
                copy.name = node.label || copy.name;
                return copy;
            }
            if (!node.method && !node.path) return null;
            return {
                name: node.label || node.name || 'Request',
                request: {
                    method: node.method || 'GET',
                    header: node.headers || [],
                    url: node.url || node.path || '',
                    body: node.body ? { mode: 'raw', raw: node.body } : undefined,
                    description: node.docsKey || '',
                },
            };
        }).filter(Boolean);
    }

    buildPostmanCollection(name, items) {
        return {
            info: {
                name,
                description: 'Exported from the Takaful Oman API playground. Import this file into Postman.',
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
            },
            item: items,
            variable: this.collection?.variable || [],
        };
    }

    collectionFilename(name) {
        const slug = String(name || 'product').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        return `Takaful_Oman_${slug}.postman_collection.json`;
    }

    saveJsonFile(payload, filename) {
        this.saveTextFile(JSON.stringify(payload, null, 2), filename);
    }

    saveTextFile(text, filename) {
        const blob = new Blob([String(text ?? '')], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    jsonFilename(name, fallback) {
        const slug = String(name || fallback || 'request').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback || 'request';
        return slug.toLowerCase().endsWith('.json') ? slug : `${slug}.json`;
    }

    currentJsonName() {
        return this.endpointMap.get(this.currentId)?.item?.name || 'request';
    }

    showError(message) {
        document.getElementById('workspace').innerHTML = `<div class="notice">${this.escape(message)}</div>`;
    }

    escape(text) {
        return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[ch]));
    }

    docsKey(endpoint, crumbs) {
        const method = String(endpoint?.request?.method || 'GET').toUpperCase();
        const path = this.pathOf(endpoint?.request);
        if (path && path !== '/') return `${method} ${path}`;
        return `${method} ${(crumbs || []).join('/')}`;
    }

    endpointDocsHtml(endpoint, crumbs) {
        const key = this.docsKey(endpoint, crumbs);
        const stored = this.docPages?.endpoints?.[key]?.html;
        if (stored) return stored;
        const step = this.currentFlowStep();
        if (step?.docsHtml) return step.docsHtml;
        const desc = endpoint?.request?.description;
        if (typeof desc === 'string' && desc.trim()) return desc;
        if (desc?.content) return desc.content;
        return '';
    }

    bindDocCopy() {
        document.querySelectorAll('.docs-body .docs-script, .docs-body pre.docs-script, .docs-body pre').forEach((pre) => {
            if (!pre.classList.contains('docs-script')) pre.classList.add('docs-script', 'docs-script-dark');
            else pre.classList.add('docs-script-dark');
            let code = pre.querySelector('code');
            if (!code) {
                code = document.createElement('code');
                code.className = 'docs-script-code';
                code.innerHTML = pre.innerHTML;
                pre.textContent = '';
                pre.appendChild(code);
            }
            code.classList.remove('code-highlight');
            code.classList.add('docs-script-code');
            code.contentEditable = 'false';
            const lang = pre.dataset.lang || pre.closest('.docs-script-wrap')?.querySelector('.docs-script-lang')?.textContent || 'Script';
            if (!code.querySelector('.js-keyword, .js-string, .json-key, .json-string')) {
                const raw = code.textContent || '';
                code.innerHTML = String(lang).toLowerCase() === 'json'
                    ? this.highlightJson(raw)
                    : this.highlightScript(raw);
            }
            if (String(lang).toLowerCase() === 'json') pre.classList.add('is-json');
            pre.dataset.lang = String(lang).trim() || 'Script';
            pre.style.height = 'auto';
            pre.style.maxHeight = 'none';

            let wrap = pre.closest('.docs-script-wrap');
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.className = 'docs-script-wrap';
                pre.parentNode.insertBefore(wrap, pre);
                wrap.appendChild(pre);
            }

            let card = pre.closest('.docs-script-card');
            let head = card?.querySelector('.docs-script-head');
            if (!card) {
                card = document.createElement('div');
                card.className = 'docs-script-card';
                if (pre.classList.contains('is-json')) card.classList.add('is-json');
                head = document.createElement('div');
                head.className = 'docs-script-head';
                const langEl = wrap.querySelector(':scope > .docs-script-lang') || document.createElement('span');
                langEl.className = 'docs-script-lang';
                if (!langEl.textContent) langEl.textContent = lang || 'Script';
                head.appendChild(langEl);
                wrap.insertBefore(card, pre);
                card.appendChild(head);
                card.appendChild(pre);
            } else if (!head) {
                head = document.createElement('div');
                head.className = 'docs-script-head';
                const langEl = document.createElement('span');
                langEl.className = 'docs-script-lang';
                langEl.textContent = lang || 'Script';
                head.appendChild(langEl);
                card.insertBefore(head, card.firstChild);
            }

            let btn = head.querySelector('.copy-script') || wrap.querySelector('.copy-script');
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'copy-script';
                btn.textContent = 'Copy';
                head.appendChild(btn);
            } else if (!head.contains(btn)) {
                head.appendChild(btn);
            }
            if (btn.dataset.bound) return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(pre.innerText);
                    btn.textContent = 'Copied';
                    setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
                } catch {
                    btn.textContent = 'Copy failed';
                }
            });
        });
    }

    renderDocHtml(htmlOrMd) {
        const value = String(htmlOrMd || '');
        if (!value.trim()) return '';
        if (/<[a-z][\s\S]*>/i.test(value)) return this.sanitizeClientHtml(value);
        return this.formatDescription(value);
    }

    sanitizeClientHtml(html) {
        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
        doc.querySelectorAll('script,iframe,object,embed,form,link,meta,style').forEach((el) => el.remove());
        doc.querySelectorAll('*').forEach((el) => {
            [...el.attributes].forEach((attr) => {
                if (/^on/i.test(attr.name) || /javascript:|data:/i.test(attr.value)) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return doc.body.innerHTML;
    }

    formatDescription(description) {
        let formatted = this.escape(description);
            formatted = formatted.replace(/^### (.*$)/gim, '<h3>$1</h3>');
            formatted = formatted.replace(/^## (.*$)/gim, '<h2>$1</h2>');
            formatted = formatted.replace(/^# (.*$)/gim, '<h2>$1</h2>');
        formatted = formatted.replace(/```[\w-]*\n([\s\S]*?)```/g, '<pre>$1</pre>');
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
            formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\n/g, '<br>');
            return formatted;
    }
}

window.app = new APIPlayground();
