class AdminApp {
    constructor() {
        this.view = 'products';
        this.productsData = { products: [], maps: {}, folderEnvironments: {} };
        this.files = { collections: [], environments: [], activeCollectionId: null, activeEnvironmentId: null };
        this.summary = null;
        this.selectedId = null;
        this.selectedItemId = null;
        this.selectedDocProductId = null;
        this.selectedDocNodeId = null;
        this.selectedTreeNodeId = null;
        this.openFolders = {};
        this.docPreview = false;
        this.repoPickerOpen = false;
        this.repoParentId = null;
        this.repoPicks = [];
        this.repoOpenFolders = {};
        this.repoSplit = 0.56;
        this.filesTab = 'collection';
        this.selectedCollectionFileId = '';
        this.selectedEnvironmentFileId = '';
        this.filesOpenFolders = {};
        this._collectionLookup = {};
        this._filesRenderGen = 0;
        this.apiDetailTab = 'details';
        this.editorTab = 'params';
        this.scriptPane = 'prerequest';
        this.responseTab = 'body';
        this.responseSearch = '';
        this.responseCollapsed = new Set();
        this.responseHit = 0;
        this.epResponse = null;
        this.epVisualizer = null;
        this.pmSplit = Number(localStorage.getItem('adminPmSplit') || 0.55);
        if (!(this.pmSplit > 0.22 && this.pmSplit < 0.82)) this.pmSplit = 0.55;
        this.dragNodeId = null;
        this.sidebarOpenId = null;
        this.collectionModalOpen = false;
        this._treeSnapshots = {};
        this.collectionTreeFlash = '';
        this._collectionReturnNodeId = null;
        this.renamingNodeId = null;
        this.menuNodeId = null;
        this.flash = { ok: '', error: '' };
        this._confirmResolver = null;
        this._envLookup = null;
        this._envPopKey = null;
        this._envPopTimer = null;
        this.envDrawerId = '';
        this.hosts = [];
        this.relatedHostList = null;
        const params = new URLSearchParams(window.location.search);
        this.testerFocus = params.get('focus') === 'tester';
        this._focusItem = params.get('item') || '';
        this._focusNode = params.get('node') || '';
        if (this.testerFocus) document.body.classList.add('tester-focus');
        this.init();
    }

    showLoader() {
        document.getElementById('loaderOverlay')?.classList.remove('is-hidden');
    }

    hideLoader() {
        document.getElementById('loaderOverlay')?.classList.add('is-hidden');
    }

    askConfirm({ message, okLabel = 'Confirm', danger = false } = {}) {
        const modal = document.getElementById('confirmModal');
        const ok = document.getElementById('confirmOk');
        const text = document.getElementById('confirmMessage');
        if (!modal || !ok || !text) return Promise.resolve(window.confirm(message));
        text.textContent = message;
        ok.textContent = okLabel;
        ok.classList.toggle('danger-btn', danger);
        ok.classList.toggle('primary-btn', !danger);
        modal.classList.remove('hidden');
        return new Promise((resolve) => {
            this._confirmResolver = resolve;
        });
    }

    resolveConfirm(ok) {
        document.getElementById('confirmModal')?.classList.add('hidden');
        const resolve = this._confirmResolver;
        this._confirmResolver = null;
        if (resolve) resolve(Boolean(ok));
    }

    async api(action, { method = 'GET', body, file } = {}) {
        if (!window.StaticAPI || typeof window.StaticAPI.handle !== 'function') {
            throw new Error('Static API is not loaded');
        }
        try {
            return await window.StaticAPI.handle(action, { method, body, file });
        } catch (err) {
            const status = err && err.status;
            if (status === 401 && action !== 'login' && action !== 'session') {
                this.showLogin();
                throw new Error(err.message || 'Please sign in');
            }
            throw new Error(err.message || `Request failed (${status || 500})`);
        }
    }

    async init() {
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.closeProfileMenu();
            this.logout();
        });
        document.getElementById('profileBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = document.getElementById('profileMenu');
            const open = menu?.classList.contains('hidden');
            menu?.classList.toggle('hidden', !open);
            document.getElementById('profileBtn')?.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
            this.closeProfileMenu();
            this.openPasswordModal();
        });
        document.getElementById('passwordCancel')?.addEventListener('click', () => this.closePasswordModal());
        document.getElementById('passwordSave')?.addEventListener('click', () => this.savePassword());
        document.getElementById('passwordModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'passwordModal') this.closePasswordModal();
        });
        document.getElementById('sidebarToggle')?.addEventListener('click', () => this.toggleSidebar());
        document.getElementById('menuToggle')?.addEventListener('click', () => this.toggleMobileSidebar());
        document.getElementById('adminSidebarBackdrop')?.addEventListener('click', () => this.toggleMobileSidebar(false));
        window.addEventListener('resize', () => {
            if (!this.isMobileNav()) this.toggleMobileSidebar(false);
        });
        this.applySidebarCollapsed(this.readSidebarCollapsed());
        document.getElementById('hostSettingsBtn')?.addEventListener('click', () => this.openHostSettings());
        document.getElementById('closeHostSettingsBtn')?.addEventListener('click', () => this.closeHostSettings());
        document.getElementById('addHostBtn')?.addEventListener('click', () => this.addHostRow());
        document.getElementById('addRelatedHostBtn')?.addEventListener('click', () => this.addRelatedHostRow());
        document.getElementById('saveHostsBtn')?.addEventListener('click', () => this.saveHosts());
        document.getElementById('hostSettingsDrawer')?.addEventListener('click', (e) => {
            if (e.target.id === 'hostSettingsDrawer') this.closeHostSettings();
        });
        document.getElementById('adminEnvBtn')?.addEventListener('click', () => this.openAdminEnv());
        document.getElementById('closeAdminEnvBtn')?.addEventListener('click', () => this.closeAdminEnv());
        document.getElementById('addAdminEnvBtn')?.addEventListener('click', () => this.addAdminEnvRow());
        document.getElementById('saveAdminEnvBtn')?.addEventListener('click', () => this.saveAdminEnv());
        document.getElementById('adminEnvDrawer')?.addEventListener('click', (e) => {
            if (e.target.id === 'adminEnvDrawer') this.closeAdminEnv();
        });
        document.querySelectorAll('#adminTabs [data-view]').forEach((btn) => {
            btn.addEventListener('click', () => this.setView(btn.dataset.view));
        });
        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('#treeMenuPortal') && !e.target.closest('[data-tree-menu]')) this.closeTreeMenu();
            if (!e.target.closest('#epMethodPicker')) this.closeMethodPicker();
            if (!e.target.closest('.icon-chooser')) this.closeIconMenu();
            if (!e.target.closest('.kind-chooser')) {
                this.closeKindMenu();
                this.closeRelatedProductMenu();
            }
            if (!e.target.closest('.profile-wrap')) this.closeProfileMenu();
            if (!e.target.closest('.overview-dl-wrap')) this.closeOverviewDownloadMenus();
            if (!e.target.closest('#sendPreview') && !e.target.closest('#epEyeBtn')) this.closeSendPreview();
        });
        document.addEventListener('scroll', () => this.closeTreeMenu(), true);
        window.addEventListener('resize', () => this.closeTreeMenu());
        const portal = document.getElementById('treeMenuPortal');
        portal?.addEventListener('mousedown', (e) => e.stopPropagation());
        portal?.querySelector('[data-portal-rename]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = this.menuNodeId;
            this.closeTreeMenu();
            if (id) this.startRename(id);
        });
        portal?.querySelector('[data-portal-delete]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = this.menuNodeId;
            this.closeTreeMenu();
            if (id) this.removeTreeNode(id);
        });
        document.getElementById('confirmCancel')?.addEventListener('click', () => this.resolveConfirm(false));
        document.getElementById('confirmOk')?.addEventListener('click', () => this.resolveConfirm(true));
        document.getElementById('confirmModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'confirmModal') this.resolveConfirm(false);
        });
        document.addEventListener('mouseover', (e) => this.onEnvVarHover(e));
        document.getElementById('envVarPopSave')?.addEventListener('click', () => this.saveEnvVarPop());
        document.getElementById('envVarPopover')?.addEventListener('mouseenter', () => this.cancelEnvVarPopHide());
        document.getElementById('envVarPopover')?.addEventListener('mouseleave', () => this.scheduleEnvVarPopHide());
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (!document.getElementById('envVarPopover')?.classList.contains('hidden')) {
                this.hideEnvVarPop();
                return;
            }
            if (!document.getElementById('passwordModal')?.classList.contains('hidden')) {
                this.closePasswordModal();
                return;
            }
            if (!document.getElementById('confirmModal')?.classList.contains('hidden')) {
                this.resolveConfirm(false);
                return;
            }
            this.closeProfileMenu();
            this.closeIconMenu();
        });
        try {
            const session = await this.api('session');
            if (session.ok) await this.enter();
            else this.showLogin();
        } catch {
            this.showLogin();
        } finally {
            this.hideLoader();
        }
    }

    showLogin() {
        document.getElementById('loginView').classList.remove('hidden');
        document.getElementById('adminApp').classList.add('hidden');
        this.hideLoader();
    }

    async enter() {
        document.getElementById('loginView').classList.add('hidden');
        document.getElementById('adminApp').classList.remove('hidden');
        await this.refresh();
        if (this._focusItem) this.selectedItemId = this._focusItem;
        if (this._focusNode) this.selectedTreeNodeId = this._focusNode;
        if (this.testerFocus) this.apiDetailTab = 'details';
        document.body.classList.toggle('tester-focus', this.testerFocus);
        this.render();
        this.syncDocumentTitle();
    }

    async refresh() {
        this.productsData = await this.api('products');
        this.productsData.products = this.flattenCatalog(this.productsData.products);
        this._treeSnapshots = {};
        this.summary = await this.api('collection');
        this.files = await this.api('files');
        await this.ensureEnvLookup(true);
        await this.loadHosts();
        this.renderEnvDot();
    }

    async login() {
        const error = document.getElementById('loginError');
        error.textContent = '';
        try {
            this.showLoader();
            await this.api('login', {
                method: 'POST',
                body: {
                    username: document.getElementById('loginUser').value,
                    password: document.getElementById('loginPass').value,
                },
            });
            await this.enter();
        } catch (e) {
            error.textContent = e.message;
        } finally {
            this.hideLoader();
        }
    }

    async logout() {
        await this.api('logout', { method: 'POST', body: {} });
        this.showLogin();
    }

    closeProfileMenu() {
        document.getElementById('profileMenu')?.classList.add('hidden');
        document.getElementById('profileBtn')?.setAttribute('aria-expanded', 'false');
    }

    closeOverviewDownloadMenus() {
        document.querySelectorAll('.overview-dl-menu').forEach((menu) => menu.classList.add('hidden'));
        document.querySelectorAll('.overview-dl-wrap').forEach((wrap) => wrap.classList.remove('open'));
        document.querySelectorAll('.overview-dl-toggle').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
    }

    openPasswordModal() {
        const modal = document.getElementById('passwordModal');
        const err = document.getElementById('passwordError');
        if (err) err.textContent = '';
        ['currentPassword', 'newPassword', 'confirmPassword'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        modal?.classList.remove('hidden');
        document.getElementById('currentPassword')?.focus();
    }

    closePasswordModal() {
        document.getElementById('passwordModal')?.classList.add('hidden');
    }

    async savePassword() {
        const err = document.getElementById('passwordError');
        if (err) err.textContent = '';
        try {
            await this.api('change-password', {
                method: 'POST',
                body: {
                    current: document.getElementById('currentPassword')?.value || '',
                    next: document.getElementById('newPassword')?.value || '',
                    confirm: document.getElementById('confirmPassword')?.value || '',
                },
            });
            this.closePasswordModal();
            this.flash = { ok: 'Password updated.', error: '' };
            this.render();
        } catch (e) {
            if (err) err.textContent = e.message;
        }
    }

    setView(view) {
        const next = view === 'overview' || view === 'apis' ? 'products' : view;
        if (this.view === 'products' && next !== 'products') {
            this.syncProductForms();
        }
        this.view = next;
        if (this.view !== 'products') {
            this.repoPickerOpen = false;
            this.docPreview = false;
        }
        this.render();
    }

    syncTabs() {
        document.querySelectorAll('#adminTabs [data-view]').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.view === this.view);
        });
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
        return (this.productsData.products || []).filter((item) => this.kindOf(item) === kind);
    }

    allProducts() {
        return (this.productsData.products || []).slice();
    }

    productTree(product) {
        if (!product) return [];
        if (Array.isArray(product.tree)) return product.tree;
        if (Array.isArray(product.flow) && product.flow.length) {
            product.tree = product.flow.map((step) => ({ type: 'step', ...step }));
            delete product.flow;
            return product.tree;
        }
        product.tree = [];
        return product.tree;
    }

    walkTree(nodes, fn) {
        (nodes || []).forEach((node, index, list) => {
            fn(node, index, list);
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

    findNode(nodes, id, parent = null, parentList = null, parentIndex = -1) {
        const list = nodes || [];
        for (let i = 0; i < list.length; i++) {
            const node = list[i];
            if (node.id === id) return { node, list, index: i, parent, parentList, parentIndex };
            if (node.type === 'folder') {
                const found = this.findNode(node.children || [], id, node, list, i);
                if (found) return found;
            }
        }
        return null;
    }

    chevronSvg() {
        return '<svg class="chevron" viewBox="0 0 12 12" fill="none"><path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    }

    folderIconSvg() {
        return '<svg class="tree-folder-glyph" viewBox="0 0 24 24" fill="none"><path d="M3.5 7.2A2.2 2.2 0 0 1 5.7 5h4.1l1.4 1.8h7.1A2.2 2.2 0 0 1 20.5 9v8.3a2.2 2.2 0 0 1-2.2 2.2H5.7A2.2 2.2 0 0 1 3.5 17.3V7.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    }

    settingsIconSvg() {
        return '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.1l1.6 1.6M17.5 15.3l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 16.9l1.6-1.6M17.5 8.7l1.6-1.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    }

    iconFolderPlus() {
        return '<svg viewBox="0 0 24 24" fill="none"><path d="M3.5 7.2A2.2 2.2 0 0 1 5.7 5h4.1l1.4 1.8h7.1A2.2 2.2 0 0 1 20.5 9v8.3a2.2 2.2 0 0 1-2.2 2.2H5.7A2.2 2.2 0 0 1 3.5 17.3V7.2Z" fill="currentColor" opacity="0.22"/><path d="M3.5 7.2A2.2 2.2 0 0 1 5.7 5h4.1l1.4 1.8h7.1A2.2 2.2 0 0 1 20.5 9v8.3a2.2 2.2 0 0 1-2.2 2.2H5.7A2.2 2.2 0 0 1 3.5 17.3V7.2Z" stroke="currentColor" stroke-width="1.6"/><path d="M12 10.5v5M9.5 13h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    }

    iconApiPlus() {
        return '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="4.5" width="14" height="15" rx="2.2" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="18" cy="18" r="4.2" fill="#fff" stroke="currentColor" stroke-width="1.4"/><path d="M18 16.2v3.6M16.2 18h3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    }

    iconRepo() {
        return '<svg viewBox="0 0 24 24" fill="none"><path d="M7 7h13v11.5A2.5 2.5 0 0 1 17.5 21H7" stroke="currentColor" stroke-width="1.6"/><path d="M4 4.5h13.5A2.5 2.5 0 0 1 20 7v.5H6.5A2.5 2.5 0 0 0 4 10V4.5Z" stroke="currentColor" stroke-width="1.6"/><path d="M4 10v8.5A2.5 2.5 0 0 0 6.5 21" stroke="currentColor" stroke-width="1.6"/></svg>';
    }

    iconDownload() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8.2 10.8L12 14.6l3.8-3.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18.5h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    }

    render() {
        this.syncTabs();
        const workspace = document.getElementById('workspace');
        if (this.view === 'collection') {
            this.renderCollectionWorkspace();
        } else {
            workspace.innerHTML = this.productsHtml();
            this.bindProducts();
        }
        this.renderSidebar();
        this.renderEnvDot();
        this.syncDocumentTitle();
    }

    renderSidebar() {
        const shell = document.getElementById('adminShell');
        const nav = document.getElementById('adminTree');
        shell?.classList.remove('no-tree');
        if (!nav) return;
        const ids = this.catalogFingerprint();
        const catalog = nav.querySelector('.sidebar-catalog');
        if (!catalog || catalog.dataset.ids !== ids) {
            this.sidebarOpenId = null;
            nav.innerHTML = this.sidebarCatalogHtml();
            const next = nav.querySelector('.sidebar-catalog');
            if (next) next.dataset.ids = ids;
            this.bindSidebarCatalog();
        }
        this.syncSidebarAccordion();
    }

    catalogFingerprint() {
        return this.itemsOf('product').concat(this.itemsOf('service')).map((item) => item.id).join('|');
    }

    sidebarCatalogHtml() {
        const products = this.itemsOf('product');
        const services = this.itemsOf('service');
        return `
            <div class="sidebar-catalog">
                <div class="catalog-head">
                    <h2>Products</h2>
                    <button class="ghost-btn small" id="addProductBtn" type="button">Add</button>
                </div>
                ${products.length ? products.map((item) => this.sidebarAccordionItem(item)).join('') : '<div class="empty-state" style="padding:8px">No products yet.</div>'}
                <div class="catalog-head">
                    <h2>Services</h2>
                    <button class="ghost-btn small" id="addServiceBtn" type="button">Add</button>
                </div>
                ${services.length ? services.map((item) => this.sidebarAccordionItem(item)).join('') : '<div class="empty-state" style="padding:8px">No services yet.</div>'}
            </div>
        `;
    }

    sidebarAccordionItem(item) {
        return `
            <div class="sidebar-accordion" data-accordion-id="${this.escape(item.id || '')}">
                ${this.sidebarCard(item, false)}
                <div class="card-tree-wrap">
                    <div class="card-tree-inner"></div>
                </div>
            </div>
        `;
    }

    sidebarCard(item, open) {
        const kind = this.kindOf(item);
        const related = item.productId ? this.productById(item.productId) : null;
        const steps = this.flatSteps(item).length;
        let meta = kind === 'service' ? 'Service' : 'Product';
        if (kind === 'service' && related) meta += ` · ${related.name}`;
        meta += ` · ${steps} API${steps === 1 ? '' : 's'}`;
        if (item.published === false) meta += ' · Unpublished';
        return `
            <button class="folder-card sidebar-card ${open ? 'active' : ''}" type="button" data-item-id="${this.escape(item.id || '')}">
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
            return '<div class="notice tree-empty">No folders or APIs yet. Open Collection Details in settings to add them.</div>';
        }
        return `<div class="tree-editor is-readonly">${this.treeEditorHtml(tree, 0, { readOnly: true })}</div>`;
    }

    collectionTreeEditorHtml(product) {
        const tree = this.productTree(product);
        return `
            <div class="toolbar sidebar-tree-toolbar">
                <button class="tree-icon-btn add-tree-folder" type="button" title="Add folder">${this.iconFolderPlus()}</button>
                <button class="tree-icon-btn add-tree-manual" type="button" title="Add API manually">${this.iconApiPlus()}</button>
                <button class="tree-icon-btn add-tree-repo" type="button" title="Add API or folder from collection repository">${this.iconRepo()}</button>
            </div>
            <div class="tree-editor">
                ${tree.length ? this.treeEditorHtml(tree, 0, { hideSeq: true }) : '<div class="notice tree-drop-root">No folders or APIs yet. Use the icons above to add them.</div>'}
            </div>
        `;
    }

    collectionModalHtml(product) {
        const dirty = this.collectionTreeDirty();
        const noun = this.kindOf(product) === 'service' ? 'service' : 'product';
        return `
            <div class="collection-modal" id="collectionModal">
                <div class="collection-panel" role="dialog" aria-modal="true" aria-labelledby="collectionModalTitle" tabindex="-1">
                    <div class="drawer-head">
                        <div>
                            <h2 id="collectionModalTitle">Collection Details</h2>
                            <p>Add, rename, reorder, or remove folders and APIs, then save to apply them to this ${noun}.</p>
                        </div>
                        <button class="icon-btn" id="closeCollectionBtn" type="button" aria-label="Close">×</button>
                    </div>
                    <div class="collection-modal-body">
                        ${this.collectionTreeEditorHtml(product)}
                        <p class="form-error" data-collection-error>${this.escape(this.flash.error || '')}</p>
                        <p class="form-ok" data-collection-ok>${this.escape(this.collectionTreeFlash || '')}</p>
                    </div>
                    <div class="drawer-foot">
                        <button class="ghost-btn" type="button" data-collection-cancel>Cancel</button>
                        <button class="primary-btn" type="button" data-collection-save ${dirty ? '' : 'disabled'}>Save</button>
                    </div>
                </div>
            </div>
        `;
    }

    cloneTree(tree) {
        return JSON.parse(JSON.stringify(tree || []));
    }

    collectionTreeDirty() {
        const product = this.editingProduct();
        if (!product) return false;
        const snap = this._treeSnapshots[product.id];
        if (!snap) return false;
        return JSON.stringify(this.productTree(product)) !== JSON.stringify(snap);
    }

    openCollectionModal() {
        this.syncProductForms();
        const product = this.editingProduct();
        if (!product) return;
        this._treeSnapshots[product.id] = this.cloneTree(this.productTree(product));
        this._collectionReturnNodeId = this.selectedTreeNodeId;
        this.selectedTreeNodeId = null;
        this.collectionModalOpen = true;
        this.collectionTreeFlash = '';
        this.flash = { ok: '', error: '' };
        this.render();
    }

    closeCollectionModal() {
        this.collectionModalOpen = false;
        this.renamingNodeId = null;
        const returnId = this._collectionReturnNodeId;
        this._collectionReturnNodeId = null;
        const product = this.editingProduct();
        if (returnId && product && this.findNode(this.productTree(product), returnId)) {
            this.selectedTreeNodeId = returnId;
        }
        this.render();
    }

    async saveCollectionTree() {
        if (!this.collectionTreeDirty()) {
            this.closeCollectionModal();
            return;
        }
        this.collectionTreeFlash = '';
        await this.saveProducts();
        if (this.flash.error) return;
        const product = this.editingProduct();
        if (product) this._treeSnapshots[product.id] = this.cloneTree(this.productTree(product));
        this.collectionModalOpen = false;
        this.renamingNodeId = null;
        const returnId = this._collectionReturnNodeId;
        this._collectionReturnNodeId = null;
        if (returnId && product && this.findNode(this.productTree(product), returnId)) {
            this.selectedTreeNodeId = returnId;
        }
        this.render();
    }

    cancelCollectionTree() {
        const product = this.editingProduct();
        if (product) {
            const snap = this._treeSnapshots[product.id];
            if (snap) product.tree = this.cloneTree(snap);
        }
        this.renamingNodeId = null;
        this.collectionTreeFlash = '';
        this.flash = { ok: '', error: '' };
        this.closeCollectionModal();
    }

    syncSidebarAccordion() {
        const selectedId = this.view === 'products' ? this.selectedItemId : null;
        const changed = this.sidebarOpenId !== selectedId;
        this.sidebarOpenId = selectedId;
        document.querySelectorAll('#adminTree .sidebar-accordion').forEach((el) => {
            const item = this.productById(el.dataset.accordionId);
            if (item) {
                const title = el.querySelector('.sidebar-card h3');
                const meta = el.querySelector('.sidebar-card p');
                const steps = this.flatSteps(item).length;
                const related = item.productId ? this.productById(item.productId) : null;
                let line = this.kindOf(item) === 'service' ? 'Service' : 'Product';
                if (this.kindOf(item) === 'service' && related) line += ` · ${related.name}`;
                line += ` · ${steps} API${steps === 1 ? '' : 's'}`;
                if (item.published === false) line += ' · Unpublished';
                if (title) title.textContent = item.name || 'Untitled';
                if (meta) meta.textContent = line;
            }
            const shouldOpen = el.dataset.accordionId === selectedId;
            const inner = el.querySelector('.card-tree-inner');
            if (shouldOpen && inner) {
                const product = this.productById(selectedId);
                inner.innerHTML = product ? this.sidebarTreePanel(product) : '';
                el.classList.remove('is-collapsing');
                el.querySelector('.sidebar-card')?.classList.add('active');
                if (changed) {
                    el.classList.remove('is-open');
                    void el.offsetHeight;
                    el.classList.add('is-open');
                    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else {
                    el.classList.add('is-open');
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

    bindSidebarCatalog() {
        document.querySelectorAll('#adminTree [data-item-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.itemId;
                if (this.view === 'products' && this.selectedItemId === id) this.backToCards();
                else this.selectCatalogItem(id);
            });
        });
        document.getElementById('addProductBtn')?.addEventListener('click', () => this.addCatalogItem('product'));
        document.getElementById('addServiceBtn')?.addEventListener('click', () => this.addCatalogItem('service'));
    }

    selectCatalogItem(id) {
        if (this.view === 'products') this.syncProductForms();
        this.view = 'products';
        this.selectedItemId = id;
        this.selectedTreeNodeId = null;
        this.collapseProductFolders(id);
        this.collectionModalOpen = false;
        this.collectionTreeFlash = '';
        this.apiDetailTab = 'details';
        this.repoPickerOpen = false;
        this.toggleMobileSidebar(false);
        this.render();
    }

    collapseProductFolders(productId) {
        const product = this.productById(productId);
        if (!product) return;
        this.walkTree(this.productTree(product), (node) => {
            if (node?.type === 'folder' && node.id) this.openFolders[node.id] = false;
        });
    }

    backToCards() {
        if (this.view === 'products') this.syncProductForms();
        this.selectedItemId = null;
        this.selectedTreeNodeId = null;
        this.collectionModalOpen = false;
        this.collectionTreeFlash = '';
        this.repoPickerOpen = false;
        this.docPreview = false;
        this.render();
    }

    navTreeHtml(nodes, depth, activeId) {
        return (nodes || []).map((node) => {
            if (node.type === 'folder') {
                const open = this.folderIsOpen(node.id, depth);
                return `
                    <div class="nav-folder ${open ? 'open' : ''}" data-folder-id="${this.escape(node.id)}">
                        <button class="nav-folder-head ${open ? 'open' : ''}" type="button" data-nav-toggle="${this.escape(node.id)}" style="padding-left:${depth * 8}px" title="${this.escape(node.name || 'Folder')}">
                            ${this.chevronSvg()}
                            ${this.folderIconSvg()}
                            <span>${this.escape(node.name || 'Folder')}</span>
                        </button>
                        <div class="nav-folder-children">${this.navTreeHtml(node.children || [], depth + 1, activeId)}</div>
                    </div>
                `;
            }
            const ep = this.matchEndpoint(node);
            return `
                <button class="nav-endpoint ${activeId === node.id ? 'active' : ''}" type="button" data-tree-node="${this.escape(node.id)}" style="padding-left:${depth * 8}px" title="${this.escape(node.label || ep?.name || 'Request')}">
                    ${this.methodBadge(node.method || ep?.method)}
                    <span>${this.escape(node.label || ep?.name || 'Request')}</span>
                </button>
            `;
        }).join('');
    }

    overviewHtml() {
        return `
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
            ${this.overviewCatalogHtml()}
        `;
    }

    defaultHosts() {
        return [
            { id: 'live', title: 'Live', url: 'https://sellonline.takafuloman.om/' },
            { id: 'uat', title: 'UAT', url: 'https://uatsellonline.takafuloman.om/' },
        ];
    }

    monitoredHosts() {
        return (this.hosts && this.hosts.length) ? this.hosts : this.defaultHosts();
    }

    relatedHosts() {
        if (this.relatedHostList) return this.relatedHostList;
        return this.defaultRelatedHosts();
    }

    defaultRelatedHosts() {
        return [
            { id: 'motor-claim', title: 'Motor claim', url: 'https://claimsonline.takafuloman.om/' },
            { id: 'inspection', title: 'Inspection', url: 'https://takafulomanpreinspectionlive.azurewebsites.net/' },
            { id: 'e-insurance', title: 'E-insurance', url: 'https://oman-insurance.com/' },
            { id: 'whatsapp', title: 'WhatsApp', url: 'https://takafulinsoman.mehery.com/' },
        ];
    }

    async loadHosts() {
        try {
            const result = await this.api('hosts');
            this.hosts = result.hosts || this.defaultHosts();
            this.relatedHostList = Array.isArray(result.relatedHosts) ? result.relatedHosts : this.defaultRelatedHosts();
        } catch (e) {
            if (!this.hosts.length) this.hosts = this.defaultHosts();
            if (!this.relatedHostList) this.relatedHostList = this.defaultRelatedHosts();
        }
        return this.hosts;
    }

    readSidebarCollapsed() {
        try {
            return localStorage.getItem('adminSidebarCollapsed') === '1';
        } catch (e) {
            return false;
        }
    }

    isMobileNav() {
        return window.matchMedia('(max-width: 860px)').matches;
    }

    applySidebarCollapsed(collapsed) {
        const shell = document.getElementById('adminShell');
        const btn = document.getElementById('sidebarToggle');
        shell?.classList.toggle('sidebar-collapsed', Boolean(collapsed));
        btn?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        btn?.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        btn?.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    }

    toggleMobileSidebar(open) {
        const sidebar = document.getElementById('adminSidebar');
        const next = open == null ? !sidebar?.classList.contains('open') : Boolean(open);
        sidebar?.classList.toggle('open', next);
        document.getElementById('adminSidebarBackdrop')?.classList.toggle('open', next);
        document.getElementById('menuToggle')?.setAttribute('aria-expanded', next ? 'true' : 'false');
        document.getElementById('menuToggle')?.setAttribute('aria-label', next ? 'Close navigation' : 'Open navigation');
    }

    toggleSidebar() {
        if (this.isMobileNav()) {
            this.toggleMobileSidebar();
            return;
        }
        const collapsed = !document.getElementById('adminShell')?.classList.contains('sidebar-collapsed');
        this.applySidebarCollapsed(collapsed);
        try {
            localStorage.setItem('adminSidebarCollapsed', collapsed ? '1' : '0');
        } catch (e) {}
    }

    openHostSettings() {
        this.renderHostSettings();
        const drawer = document.getElementById('hostSettingsDrawer');
        drawer?.classList.add('open');
        drawer?.setAttribute('aria-hidden', 'false');
    }

    closeHostSettings() {
        const drawer = document.getElementById('hostSettingsDrawer');
        drawer?.classList.remove('open');
        drawer?.setAttribute('aria-hidden', 'true');
    }

    renderHostSettings() {
        const body = document.getElementById('hostSettingsBody');
        if (!body) return;
        const hosts = this.monitoredHosts();
        const related = this.relatedHosts();
        body.innerHTML = `
            <div class="host-settings-label">Hosts</div>
            <div id="hostSettingsRows">
                ${hosts.map((item) => this.hostSettingsRowHtml(item)).join('')}
            </div>
            <div class="host-settings-label">Related hosts</div>
            <div id="relatedHostSettingsRows">
                ${related.length ? related.map((item) => this.hostSettingsRowHtml(item)).join('') : '<p class="file-meta" id="relatedHostsEmpty">No related hosts yet.</p>'}
            </div>
            <p class="form-error" id="hostSettingsError"></p>
            <p class="form-ok" id="hostSettingsOk"></p>
        `;
        body.querySelectorAll('#hostSettingsRows .env-del').forEach((btn) => {
            btn.addEventListener('click', () => {
                const wrap = document.getElementById('hostSettingsRows');
                if (wrap && wrap.querySelectorAll('.host-edit-row').length <= 1) {
                    const err = document.getElementById('hostSettingsError');
                    if (err) err.textContent = 'Keep at least one host.';
                    return;
                }
                btn.closest('.host-edit-row')?.remove();
            });
        });
        body.querySelectorAll('#relatedHostSettingsRows .env-del').forEach((btn) => {
            btn.addEventListener('click', () => {
                btn.closest('.host-edit-row')?.remove();
                this.syncRelatedHostsEmpty();
            });
        });
    }

    syncRelatedHostsEmpty() {
        const wrap = document.getElementById('relatedHostSettingsRows');
        if (!wrap) return;
        const empty = wrap.querySelector('#relatedHostsEmpty');
        if (wrap.querySelectorAll('.host-edit-row').length) {
            empty?.remove();
            return;
        }
        if (!empty) wrap.innerHTML = '<p class="file-meta" id="relatedHostsEmpty">No related hosts yet.</p>';
    }

    hostSettingsRowHtml(item) {
        return `
            <div class="host-edit-row" data-host-id="${this.escape(item.id || '')}">
                <input class="host-title" type="text" value="${this.escape(item.title || '')}" placeholder="Name, e.g. Live">
                <input class="host-url-input" type="url" value="${this.escape(item.url || '')}" placeholder="https://">
                <button class="icon-btn env-del" type="button" title="Remove">×</button>
            </div>
        `;
    }

    addHostRow() {
        const wrap = document.getElementById('hostSettingsRows');
        if (!wrap) return;
        wrap.insertAdjacentHTML('beforeend', this.hostSettingsRowHtml({ id: '', title: '', url: 'https://' }));
        const row = wrap.lastElementChild;
        row?.querySelector('.env-del')?.addEventListener('click', () => {
            if (wrap.querySelectorAll('.host-edit-row').length <= 1) return;
            row.remove();
        });
        row?.querySelector('.host-title')?.focus();
    }

    addRelatedHostRow() {
        const wrap = document.getElementById('relatedHostSettingsRows');
        if (!wrap) return;
        wrap.querySelector('#relatedHostsEmpty')?.remove();
        wrap.insertAdjacentHTML('beforeend', this.hostSettingsRowHtml({ id: '', title: '', url: 'https://' }));
        const row = wrap.lastElementChild;
        row?.querySelector('.env-del')?.addEventListener('click', () => {
            row.remove();
            this.syncRelatedHostsEmpty();
        });
        row?.querySelector('.host-title')?.focus();
    }

    async saveHosts() {
        const err = document.getElementById('hostSettingsError');
        const ok = document.getElementById('hostSettingsOk');
        if (err) err.textContent = '';
        if (ok) ok.textContent = '';
        const hosts = [];
        document.querySelectorAll('#hostSettingsRows .host-edit-row').forEach((row) => {
            const title = row.querySelector('.host-title')?.value.trim() || '';
            const url = row.querySelector('.host-url-input')?.value.trim() || '';
            if (!title && !url) return;
            hosts.push({
                id: row.dataset.hostId || '',
                title,
                url,
            });
        });
        const relatedHosts = [];
        document.querySelectorAll('#relatedHostSettingsRows .host-edit-row').forEach((row) => {
            const title = row.querySelector('.host-title')?.value.trim() || '';
            const url = row.querySelector('.host-url-input')?.value.trim() || '';
            if (!title && !url) return;
            relatedHosts.push({
                id: row.dataset.hostId || '',
                title,
                url,
            });
        });
        try {
            const result = await this.api('save-hosts', { method: 'POST', body: { hosts, relatedHosts } });
            this.hosts = result.hosts || hosts;
            this.relatedHostList = Array.isArray(result.relatedHosts) ? result.relatedHosts : relatedHosts;
            if (ok) ok.textContent = 'Hosts saved. Overview will use these URLs.';
            this.renderHostSettings();
            if (document.getElementById('hostStatus')) this.render();
        } catch (e) {
            if (err) err.textContent = e.message;
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
        if (status) status.textContent = online ? (`Reachable${data.httpStatus ? ' · HTTP ' + data.httpStatus : ''}`) : (data && data.error ? data.error : 'Unreachable');
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
            if (!window.StaticAPI || typeof window.StaticAPI.probeHosts !== 'function') {
                throw new Error('Browser probe unavailable');
            }
            // Browser-only: visitor → Oman hosts (not GitHub / API proxy)
            const result = await window.StaticAPI.probeHosts();
            if (wrap && result.hosts && result.hosts.length && wrap.querySelectorAll('.host-card').length !== result.hosts.length) {
                this.hosts = result.hosts.map((host) => ({ id: host.id, title: host.title, url: host.url }));
                wrap.innerHTML = this.monitoredHosts().map((item) => this.hostCardHtml(item)).join('');
            }
            (result.hosts || []).forEach((host) => {
                this.paintHostCard(wrap?.querySelector(`[data-host="${host.id}"]`), host);
            });
            if (relatedWrap && Array.isArray(result.relatedHosts)) {
                this.relatedHostList = result.relatedHosts.map((host) => ({ id: host.id, title: host.title, url: host.url }));
                if (relatedWrap.querySelectorAll('.related-host-card').length !== result.relatedHosts.length) {
                    relatedWrap.innerHTML = this.relatedHosts().map((item) => this.relatedHostCardHtml(item)).join('');
                }
            }
            (result.relatedHosts || []).forEach((host) => {
                this.paintHostCard(relatedWrap?.querySelector(`[data-host="${host.id}"]`), host);
            });
        } catch (e) {
            const failed = { online: false, error: e.message || 'Check failed' };
            wrap?.querySelectorAll('.host-card').forEach((card) => this.paintHostCard(card, failed));
            relatedWrap?.querySelectorAll('.related-host-card').forEach((card) => this.paintHostCard(card, failed));
        }
    }

    collectionHtml() {
        const collections = this.files.collections || [];
        const environments = this.files.environments || [];
        const tab = this.filesTab === 'environment' ? 'environment' : 'collection';
        return `
            ${this.flash.error ? `<p class="form-error" id="uploadError">${this.escape(this.flash.error)}</p>` : ''}
            <div class="files-switch">
                <button class="files-switch-btn ${tab === 'collection' ? 'is-active' : ''}" type="button" data-files-tab="collection">Collection</button>
                <button class="files-switch-btn ${tab === 'environment' ? 'is-active' : ''}" type="button" data-files-tab="environment">Environment</button>
            </div>
            <div class="files-board" id="filesBoard">
                <div class="files-panel ${tab === 'collection' ? 'is-active' : ''}" data-files-panel="collection">
                    <div class="files-col">
                        <div class="files-card">
                            <div class="dropzone files-dropzone" id="collectionDropzone">
                                <strong>Upload a collection</strong>
                                <span>Postman Collection v2 JSON</span>
                                <input type="file" id="collectionFile" accept="application/json,.json" hidden>
                            </div>
                        </div>
                        <div class="files-card files-card-fill">
                            <div class="files-card-head">Uploaded collections</div>
                            <div class="files-list" id="collectionFileList">${this.filesListHtml(collections, 'collection')}</div>
                        </div>
                    </div>
                    <div class="files-col files-col-main">
                        <div class="files-card files-card-fill">
                            <div class="files-card-head">Folders &amp; APIs</div>
                            <div class="files-detail" id="collectionFileTree">${this.filesCollectionTreePane()}</div>
                        </div>
                    </div>
                </div>
                <div class="files-panel ${tab === 'environment' ? 'is-active' : ''}" data-files-panel="environment">
                    <div class="files-col">
                        <div class="files-card">
                            <div class="dropzone env files-dropzone" id="environmentDropzone">
                                <strong>Upload an environment</strong>
                                <span>Postman Environment JSON</span>
                                <input type="file" id="environmentFile" accept="application/json,.json" hidden>
                            </div>
                        </div>
                        <div class="files-card files-card-fill">
                            <div class="files-card-head">Uploaded environments</div>
                            <div class="files-list" id="environmentFileList">${this.filesListHtml(environments, 'environment')}</div>
                        </div>
                    </div>
                    <div class="files-col files-col-main">
                        <div class="files-card files-card-fill">
                            <div class="files-card-head">Environment details</div>
                            <div class="files-detail files-env-detail" id="environmentFileFields">${this.filesEnvEditorHtml()}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    filesListHtml(items, type) {
        if (!items.length) {
            return `<div class="notice">No ${type === 'collection' ? 'collections' : 'environments'} uploaded yet.</div>`;
        }
        const isCollection = type === 'collection';
        const selectedId = isCollection ? this.selectedCollectionFileId : this.selectedEnvironmentFileId;
        return items.map((item) => {
            const meta = isCollection
                ? `${item.folderCount || 0} folders · ${item.endpointCount || 0} APIs`
                : `${item.variableCount || 0} variable${item.variableCount === 1 ? '' : 's'}`;
            return `
                <div class="files-item ${item.id === selectedId ? 'is-selected' : ''}" data-select-file="${this.escape(item.id)}" data-file-type="${type}">
                    <div class="files-item-copy">
                        <strong>${this.escape(item.name)}${item.active ? ' <span class="badge-active">Active</span>' : ''}</strong>
                        <span class="file-meta">${this.escape(item.originalFilename || item.filename)} · ${this.escape(this.formatWhen(item.uploadedAt))} · ${meta}</span>
                    </div>
                    <div class="toolbar files-item-actions">
                        ${isCollection && !item.active ? `<button class="ghost-btn small activate-file" type="button" data-id="${this.escape(item.id)}">Use this</button>` : ''}
                        <button class="danger-btn small remove-file" type="button" data-id="${this.escape(item.id)}" data-name="${this.escape(item.name)}">Remove</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    filesCollectionTreePane() {
        const id = this.selectedCollectionFileId;
        if (!id) return '<div class="notice">Select an uploaded collection to browse its folders and APIs.</div>';
        if (this._collectionLookup[id] == null) return '<div class="notice">Loading collection…</div>';
        const items = this._collectionLookup[id]?.item || [];
        if (!items.length) return '<div class="notice">This collection has no folders or APIs.</div>';
        return `<div class="tree-editor is-readonly files-tree">${this.filesCollectionTreeHtml(items)}</div>`;
    }

    filesCollectionTreeHtml(items, prefix = '', depth = 0) {
        return (items || []).map((item, i) => {
            const key = prefix === '' ? String(i) : `${prefix}/${i}`;
            const name = item.name || (Array.isArray(item.item) ? 'Folder' : 'Request');
            if (Array.isArray(item.item)) {
                const open = this.filesFolderIsOpen(key);
                const count = this.countPostmanRequests(item.item);
                return `
                    <div class="tree-folder files-tree-folder ${open ? 'open' : ''}" data-files-folder="${this.escape(key)}">
                        <div class="tree-row folder" style="padding-left:${depth * 8}px">
                            <button class="tree-toggle ${open ? 'open' : ''}" type="button" data-files-toggle="${this.escape(key)}">${this.chevronSvg()}</button>
                            ${this.folderIconSvg()}
                            <span class="tree-label" title="${this.escape(name)}">${this.escape(name)}</span>
                            <small class="files-tree-count">${count} API${count === 1 ? '' : 's'}</small>
                        </div>
                        <div class="tree-children">${this.filesCollectionTreeHtml(item.item, key, depth + 1)}</div>
                    </div>
                `;
            }
            const method = item.request && item.request.method ? item.request.method : 'GET';
            return `
                <div class="tree-row step" style="padding-left:${depth * 8}px">
                    ${this.filesMethodHtml(method)}
                    <span class="tree-label" title="${this.escape(name)}">${this.escape(name)}</span>
                </div>
            `;
        }).join('');
    }

    filesFolderIsOpen(key) {
        return this.filesOpenFolders[key] === true;
    }

    countPostmanRequests(items) {
        return (items || []).reduce((sum, item) => {
            if (Array.isArray(item.item)) return sum + this.countPostmanRequests(item.item);
            return sum + 1;
        }, 0);
    }

    filesMethodHtml(method) {
        const value = String(method || 'GET').toUpperCase();
        return `<span class="files-method ${this.escape(value.toLowerCase())}">${this.escape(value)}</span>`;
    }

    filesEnvEditorHtml() {
        const id = this.selectedEnvironmentFileId;
        if (!id) {
            return '<div class="notice">Select an uploaded environment to rename it and edit its variables.</div>';
        }
        const selected = (this.files.environments || []).find((item) => item.id === id);
        const values = this.envValuesFor(id);
        const unique = [];
        this.suggestedEnvKeys().forEach((key) => unique.push(key));
        Object.keys(values).forEach((key) => {
            if (unique.indexOf(key) < 0) unique.push(key);
        });
        const selectedName = this.envItemName(selected)
            || (this._envLookup && this._envLookup[id] && this._envLookup[id].name)
            || '';
        return `
            <div class="files-env-editor">
            <label class="env-var-pop-field">
                <span>Name</span>
                <input id="filesEnvName" type="text" value="${this.escape(selectedName)}" placeholder="Takaful Oman — UAT" autocomplete="off">
            </label>
            <div id="filesEnvRows">
                ${unique.map((key) => this.adminEnvRowHtml(key, values[key] || '')).join('')}
            </div>
            <p class="form-error" id="filesEnvError"></p>
            <p class="form-ok" id="filesEnvOk"></p>
            <div class="toolbar files-env-actions">
                <button class="ghost-btn" id="addFilesEnvBtn" type="button">Add variable</button>
                <button class="primary-btn" id="saveFilesEnvBtn" type="button">Save environment</button>
            </div>
            </div>
        `;
    }

    productName(id) {
        return this.allProducts().find((p) => p.id === id)?.name || '';
    }

    readFileText(file) {
        if (file.text) {
            return file.text().then((text) => text.replace(/^\uFEFF/, ''));
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || '').replace(/^\uFEFF/, ''));
            reader.onerror = () => reject(new Error('Could not read that file.'));
            reader.readAsText(file);
        });
    }

    formatWhen(iso) {
        if (!iso) return 'Unknown';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return iso;
        return date.toLocaleString();
    }

    bindDropzone(dropzoneId, inputId, handler) {
        const dropzone = document.getElementById(dropzoneId);
        const input = document.getElementById(inputId);
        if (!dropzone || !input) return;
        const nextZone = dropzone.cloneNode(true);
        dropzone.parentNode.replaceChild(nextZone, dropzone);
        const nextInput = document.getElementById(inputId);
        nextZone.addEventListener('click', () => nextInput.click());
        nextZone.addEventListener('dragover', (e) => { e.preventDefault(); nextZone.classList.add('drag'); });
        nextZone.addEventListener('dragleave', () => nextZone.classList.remove('drag'));
        nextZone.addEventListener('drop', (e) => {
            e.preventDefault();
            nextZone.classList.remove('drag');
            const file = e.dataTransfer.files[0];
            if (file) handler(file);
        });
        nextInput.addEventListener('change', () => {
            if (nextInput.files[0]) handler(nextInput.files[0]);
            nextInput.value = '';
        });
    }

    bindProductFiles() {
        this.bindDropzone('productFileDropzone', 'productFileInput', (file) => this.uploadProductFile(file));
        document.querySelectorAll('.remove-product-file').forEach((btn) => {
            btn.addEventListener('click', () => this.removeProductFile(btn.dataset.fileId, btn.dataset.fileName));
        });
    }

    async uploadProductFile(file) {
        const product = this.editingProduct();
        if (!product) return;
        this.syncProductForms();
        this.flash = { ok: '', error: '' };
        try {
            this.showLoader();
            const result = await this.api('upload-product-file', {
                method: 'POST',
                file,
                body: { productId: product.id },
            });
            if (result.products) this.productsData.products = this.flattenCatalog(result.products);
            else {
                const current = this.productById(product.id);
                if (current) current.files = result.files || [];
            }
            this.flash.ok = `Uploaded “${file.name}”.`;
            this.notifyPlayground('products');
            this.render();
        } catch (e) {
            this.flash.error = e.message;
            this.render();
        } finally {
            this.hideLoader();
        }
    }

    async removeProductFile(fileId, name) {
        const product = this.editingProduct();
        if (!product || !fileId) return;
        if (!window.confirm(`Remove “${name || 'this document'}”?`)) return;
        this.syncProductForms();
        this.flash = { ok: '', error: '' };
        try {
            this.showLoader();
            const result = await this.api('delete-product-file', {
                method: 'POST',
                body: { productId: product.id, fileId },
            });
            if (result.products) this.productsData.products = this.flattenCatalog(result.products);
            else {
                const current = this.productById(product.id);
                if (current) current.files = result.files || [];
            }
            this.flash.ok = `Removed “${name || 'document'}”.`;
            this.notifyPlayground('products');
            this.render();
        } catch (e) {
            this.flash.error = e.message;
            this.render();
        } finally {
            this.hideLoader();
        }
    }

    renderCollectionWorkspace() {
        const workspace = document.getElementById('workspace');
        if (!workspace) return;
        this.ensureFilesSelection();
        const gen = ++this._filesRenderGen;
        workspace.innerHTML = this.collectionHtml();
        this.bindCollection();
        if (!this.filesNeedFetch()) return;
        this.ensureSelectedFilesLoaded().then(() => {
            if (gen !== this._filesRenderGen || this.view !== 'collection') return;
            workspace.innerHTML = this.collectionHtml();
            this.bindCollection();
        });
    }

    ensureFilesSelection() {
        const collections = this.files.collections || [];
        const environments = this.files.environments || [];
        if (!collections.some((item) => item.id === this.selectedCollectionFileId)) {
            this.selectedCollectionFileId = this.files.activeCollectionId
                || collections[0]?.id
                || '';
        }
        if (!environments.some((item) => item.id === this.selectedEnvironmentFileId)) {
            this.selectedEnvironmentFileId = this.files.activeEnvironmentId
                || environments[0]?.id
                || '';
        }
    }

    filesNeedFetch() {
        const colId = this.selectedCollectionFileId;
        const envId = this.selectedEnvironmentFileId;
        const missingCollection = Boolean(colId && this._collectionLookup[colId] == null);
        const missingEnv = Boolean(envId && !(this._envLookup && this._envLookup[envId]));
        return missingCollection || missingEnv;
    }

    async ensureSelectedFilesLoaded() {
        const colId = this.selectedCollectionFileId;
        if (colId && this._collectionLookup[colId] == null) {
            try {
                const pack = await this.api('download-collection', { method: 'POST', body: { id: colId } });
                this._collectionLookup[colId] = pack.collection || { item: [] };
            } catch (e) {
                this._collectionLookup[colId] = { item: [] };
            }
        }
        const envId = this.selectedEnvironmentFileId;
        if (envId && !(this._envLookup && this._envLookup[envId])) {
            try {
                const pack = await this.api('download-environment', { method: 'POST', body: { id: envId } });
                this.applyDownloadedEnvToLookup(pack);
            } catch (e) {}
        }
    }

    async selectUploadedFile(id, type) {
        if (!id) return;
        if (type === 'collection') {
            if (this.selectedCollectionFileId !== id) this.filesOpenFolders = {};
            this.selectedCollectionFileId = id;
        } else {
            this.selectedEnvironmentFileId = id;
        }
        this.filesTab = type === 'environment' ? 'environment' : 'collection';
        this.flash = { ok: '', error: '' };
        this.renderCollectionWorkspace();
    }

    bindCollection() {
        this.bindDropzone('collectionDropzone', 'collectionFile', (file) => this.uploadFile('upload-collection', file, 'collection'));
        this.bindDropzone('environmentDropzone', 'environmentFile', (file) => this.uploadFile('upload-environment', file, 'environment'));
        document.querySelectorAll('[data-files-tab]').forEach((btn) => {
            btn.addEventListener('click', () => this.setFilesTab(btn.dataset.filesTab));
        });
        document.querySelectorAll('[data-select-file]').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this.selectUploadedFile(row.dataset.selectFile, row.dataset.fileType);
            });
        });
        document.querySelectorAll('.remove-file').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile(btn.dataset.id, btn.dataset.name);
            });
        });
        document.querySelectorAll('.activate-file').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.activateCollection(btn.dataset.id);
            });
        });
        document.querySelectorAll('[data-files-toggle]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleFilesFolder(btn.dataset.filesToggle);
            });
        });
        document.getElementById('addFilesEnvBtn')?.addEventListener('click', () => this.addFilesEnvRow());
        document.getElementById('saveFilesEnvBtn')?.addEventListener('click', () => this.saveFilesEnv());
        document.querySelectorAll('#filesEnvRows .env-del').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (!btn.disabled) btn.closest('.env-row')?.remove();
            });
        });
    }

    setFilesTab(tab) {
        this.filesTab = tab === 'environment' ? 'environment' : 'collection';
        document.querySelectorAll('[data-files-tab]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.filesTab === this.filesTab);
        });
        document.querySelectorAll('[data-files-panel]').forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.filesPanel === this.filesTab);
        });
    }

    toggleFilesFolder(key) {
        const folder = document.querySelector(`[data-files-folder="${CSS.escape(key)}"]`);
        const next = !folder?.classList.contains('open');
        this.filesOpenFolders[key] = next;
        if (!folder) return;
        folder.classList.toggle('open', next);
        folder.querySelectorAll(':scope > .tree-row .tree-toggle').forEach((btn) => {
            btn.classList.toggle('open', next);
        });
    }

    addFilesEnvRow() {
        const wrap = document.getElementById('filesEnvRows');
        if (!wrap) return;
        wrap.insertAdjacentHTML('beforeend', this.adminEnvRowHtml('', ''));
        const row = wrap.lastElementChild;
        row?.querySelector('.env-del')?.addEventListener('click', () => row.remove());
        row?.querySelector('.env-key')?.focus();
    }

    readFilesEnvRows() {
        const values = {};
        document.querySelectorAll('#filesEnvRows .env-row').forEach((row) => {
            const key = row.querySelector('.env-key')?.value.trim();
            if (!key) return;
            values[key] = row.querySelector('.env-val')?.value || '';
        });
        return values;
    }

    async saveFilesEnv() {
        const err = document.getElementById('filesEnvError');
        const ok = document.getElementById('filesEnvOk');
        if (err) err.textContent = '';
        if (ok) ok.textContent = '';
        const id = this.selectedEnvironmentFileId;
        if (!id) {
            if (err) err.textContent = 'Select an environment first.';
            return;
        }
        const name = document.getElementById('filesEnvName')?.value.trim() || 'Environment';
        const values = this.readFilesEnvRows();
        try {
            this.showLoader();
            const result = await this.api('save-environment', {
                method: 'POST',
                body: { id, name, values },
            });
            this.files = result.files || this.files;
            this.selectedEnvironmentFileId = result.id || id;
            this._envLookup = this._envLookup || {};
            this._envLookup[this.selectedEnvironmentFileId] = { name, values };
            this.notifyPlayground('env');
            this.renderEnvDot();
            this.updateResolvedUrl();
            this.flash = { ok: 'Environment saved.', error: '' };
            this.renderCollectionWorkspace();
        } catch (e) {
            if (err) err.textContent = e.message;
        } finally {
            this.hideLoader();
        }
    }

    async uploadFile(action, file, kind) {
        this.flash = { ok: '', error: '' };
        try {
            this.showLoader();
            const text = await this.readFileText(file);
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                throw new Error('That file is not valid JSON.');
            }
            const body = { filename: file.name };
            if (kind === 'collection') body.collection = json;
            else body.environment = json;
            const result = await this.api(action, { method: 'POST', body });
            this.files = result.files || this.files;
            if (result.summary) this.summary = result.summary;
            if (result.maps) this.productsData.maps = result.maps;
            if (result.item?.id) {
                if (kind === 'collection') {
                    this.filesOpenFolders = {};
                    this.selectedCollectionFileId = result.item.id;
                    this._collectionLookup[result.item.id] = json;
                    this.filesTab = 'collection';
                } else {
                    this.selectedEnvironmentFileId = result.item.id;
                    this.filesTab = 'environment';
                    this.applyDownloadedEnvToLookup({
                        id: result.item.id,
                        name: result.item.name,
                        environment: json,
                    });
                }
            }
            this.notifyPlayground(kind === 'collection' ? 'collection' : 'products');
            this.render();
        } catch (e) {
            this.flash.error = e.message;
            this.render();
        } finally {
            this.hideLoader();
        }
    }

    async removeFile(id, name) {
        if (!window.confirm(`Remove “${name}”? This cannot be undone.`)) return;
        this.flash = { ok: '', error: '' };
        try {
            this.showLoader();
            const result = await this.api('delete-file', { method: 'POST', body: { id } });
            this.files = result.files || this.files;
            this.summary = await this.api('collection');
            if (this._collectionLookup[id]) delete this._collectionLookup[id];
            if (this._envLookup && this._envLookup[id]) delete this._envLookup[id];
            if (this.selectedCollectionFileId === id) this.selectedCollectionFileId = '';
            if (this.selectedEnvironmentFileId === id) this.selectedEnvironmentFileId = '';
            this.render();
        } catch (e) {
            this.flash.error = e.message;
            this.render();
        } finally {
            this.hideLoader();
        }
    }

    async activateCollection(id) {
        this.flash = { ok: '', error: '' };
        try {
            this.showLoader();
            const result = await this.api('activate-collection', { method: 'POST', body: { id } });
            this.files = result.files || this.files;
            this.summary = await this.api('collection');
            this.selectedCollectionFileId = id;
            this.render();
        } catch (e) {
            this.flash.error = e.message;
            this.render();
        } finally {
            this.hideLoader();
        }
    }

    catalogCard(item, selectedId, attr) {
        const kind = this.kindOf(item);
        const related = item.productId ? this.productById(item.productId) : null;
        const steps = this.flatSteps(item).length;
        const published = item.published !== false;
        let meta = kind === 'utility' ? 'Shared' : (kind === 'service' ? 'Service' : 'Product');
        if (kind === 'service' && related) meta += ` · ${related.name}`;
        meta += ` · ${steps} API${steps === 1 ? '' : 's'}`;
        meta += published ? ' · Published' : ' · Unpublished';
        return `
            <button class="folder-card ${item.id === selectedId ? 'active' : ''}" type="button" ${attr}="${this.escape(item.id || '')}">
                <div class="folder-icon">${this.folderGlyph(item)}</div>
                <h3>${this.escape(item.name || 'Untitled')}</h3>
                <p>${this.escape(meta)}</p>
            </button>
        `;
    }

    overviewProductCard(item) {
        const kind = this.kindOf(item);
        const related = item.productId ? this.productById(item.productId) : null;
        const steps = this.flatSteps(item).length;
        const files = item.files || [];
        const env = this.sharedEnvironment();
        const published = item.published !== false;
        let meta = kind === 'service' ? 'Service' : 'Product';
        if (kind === 'service' && related) meta += ` · ${related.name}`;
        const docs = files.length ? files.map((file) => `
            <a class="overview-dl-item" href="${this.escape(file.url)}" download="${this.escape(file.name || 'document')}" target="_blank" rel="noopener">
                ${this.fileTypeIcon(file.name || file.filename)}
                <span>${this.escape(file.name || 'Document')}</span>
            </a>
        `).join('') : '<p class="overview-dl-empty">No documents uploaded</p>';
        return `
            <article class="folder-card overview-item-card">
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
                        <div class="overview-stat overview-stat-status ${published ? 'is-live' : 'is-hidden'}" title="${published ? 'Published to the playground' : 'Unpublished — admin only'}">
                            <b>${published ? 'Online' : 'Offline'}</b>
                        </div>
                    </div>
                    <div class="overview-dl-wrap">
                        <button class="overview-dl-toggle" type="button" title="Download files" aria-haspopup="true" aria-expanded="false">
                            ${this.iconDownload()}
                        </button>
                        <div class="overview-dl-menu hidden">
                            <button class="overview-dl-item" type="button" data-download-collection="${this.escape(item.id || '')}">
                                ${this.fileTypeIcon('collection.col')}
                                <span>Collection</span>
                            </button>
                            ${env
                                ? `<button class="overview-dl-item" type="button" data-download-env>
                                    ${this.fileTypeIcon('environment.env')}
                                    <span>${this.escape(env.name || 'Environment')}</span>
                                </button>`
                                : `<p class="overview-dl-empty">No environment uploaded</p>`}
                            <div class="overview-dl-divider"></div>
                            ${docs}
                        </div>
                    </div>
                </div>
            </article>
        `;
    }

    overviewCatalogHtml() {
        const products = this.itemsOf('product');
        const services = this.itemsOf('service');
        return `
            <div class="catalog-head"><h2>Products</h2></div>
            ${products.length ? `<div class="folder-grid overview-grid">${products.map((item) => this.overviewProductCard(item)).join('')}</div>` : '<div class="notice">No products yet.</div>'}
            <div class="catalog-head"><h2>Services</h2></div>
            ${services.length ? `<div class="folder-grid overview-grid">${services.map((item) => this.overviewProductCard(item)).join('')}</div>` : '<div class="notice">No services yet.</div>'}
        `;
    }

    catalogSections(selectedId, attr, withAdd) {
        const products = this.itemsOf('product');
        const services = this.itemsOf('service');
        return `
            <div class="catalog-head">
                <h2>Products</h2>
                ${withAdd ? '<button class="ghost-btn small add-catalog-product" type="button">Add product</button>' : ''}
            </div>
            ${products.length ? `<div class="folder-grid">${products.map((item) => this.catalogCard(item, selectedId, attr)).join('')}</div>` : '<div class="notice">No products yet.</div>'}
            <div class="catalog-head">
                <h2>Services</h2>
                ${withAdd ? '<button class="ghost-btn small add-catalog-service" type="button">Add service</button>' : ''}
            </div>
            ${services.length ? `<div class="folder-grid">${services.map((item) => this.catalogCard(item, selectedId, attr)).join('')}</div>` : '<div class="notice">No services yet.</div>'}
        `;
    }

    downloadProductCollection(product) {
        if (!product) return;
        const payload = this.buildPostmanCollection(
            `Takaful Oman — ${product.name}`,
            this.treeToPostmanItems(this.productTree(product))
        );
        this.saveJsonFile(payload, this.exportFilename(product.name, 'postman_collection'));
    }

    sharedEnvironment() {
        const envs = this.files.environments || [];
        if (!envs.length) return null;
        const preferred = this.files.activeEnvironmentId;
        return envs.find((item) => item.id === preferred)
            || envs.find((item) => item.active)
            || envs[0];
    }

    async downloadSharedEnvironment() {
        try {
            const result = await this.api('download-environment', {
                method: 'POST',
                body: { id: this.files.activeEnvironmentId || '' },
            });
            if (!result.environment) return;
            if (result.id) this.files.activeEnvironmentId = result.id;
            const filename = result.originalFilename
                || this.exportFilename(result.name || 'environment', 'postman_environment');
            this.saveJsonFile(result.environment, filename);
        } catch (e) {
            this.flash = { ok: '', error: e.message || 'Could not download the saved environment.' };
            this.render();
        }
    }

    treeToPostmanItems(nodes) {
        return (nodes || []).map((node) => {
            if (node.type === 'folder') {
                return {
                    name: node.name || 'Folder',
                    item: this.treeToPostmanItems(node.children || []),
                };
            }
            const ep = this.matchEndpoint(node) || {};
            const headers = this.normalizeKv(node.headers || ep.headers).filter((row) => row.enabled && row.key).map((row) => ({
                key: row.key,
                value: row.value,
                type: 'text',
            }));
            const body = node.body || ep.body || '';
            const item = {
                name: node.label || node.name || ep.name || 'Request',
                request: {
                    method: String(node.method || ep.method || 'GET').toUpperCase(),
                    header: headers,
                    url: node.url || ep.url || node.path || ep.path || '',
                    description: node.docsKey || ep.docsKey || '',
                },
            };
            if (body) {
                item.request.body = { mode: 'raw', raw: body, options: { raw: { language: 'json' } } };
            }
            const scripts = node.scripts || ep.scripts || [];
            if (scripts.length) {
                item.event = scripts.map((script) => ({
                    listen: script.listen,
                    script: {
                        type: 'text/javascript',
                        exec: Array.isArray(script.exec) ? script.exec : String(script.exec || '').split('\n'),
                    },
                }));
            }
            return item;
        }).filter(Boolean);
    }

    buildPostmanCollection(name, items) {
        return {
            info: {
                name,
                description: 'Exported from Takaful Oman API Admin. Import this file into Postman.',
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
            },
            item: items,
        };
    }

    exportFilename(name, kind) {
        const slug = String(name || 'export').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        return `Takaful_Oman_${slug}.${kind}.json`;
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

    productsHtml() {
        const editing = this.editingProduct();
        if (!editing) return this.overviewHtml();
        const step = this.findNode(this.productTree(editing), this.selectedTreeNodeId)?.node;
        const isStep = step?.type === 'step' && !this.collectionModalOpen;
        return `
            ${isStep ? this.endpointWorkspaceHtml(editing) : this.productLandingHtml(editing)}
            ${this.collectionModalOpen ? this.collectionModalHtml(editing) : ''}
            ${this.repoPickerOpen ? this.repoPickerHtml() : ''}
        `;
    }

    editingProduct() {
        return this.productById(this.selectedItemId);
    }

    folderOptions(selected) {
        const folders = (this.summary?.folders || []).map((f) => f.name);
        if (selected && !folders.includes(selected)) folders.unshift(selected);
        return `<option value="">Select folder from last collection</option>${folders.map((name) => `
            <option value="${this.escape(name)}" ${selected === name ? 'selected' : ''}>${this.escape(name)}</option>
        `).join('')}`;
    }

    envOptions(selected) {
        const envs = this.files.environments || [];
        return `<option value="">No environment</option>${envs.map((env) => `
            <option value="${this.escape(env.id)}" ${selected === env.id ? 'selected' : ''}>${this.escape(this.envItemName(env))} · ${this.escape(this.formatWhen(env.uploadedAt))}</option>
        `).join('')}`;
    }

    envName(id) {
        return this.envItemName((this.files.environments || []).find((env) => env.id === id));
    }

    envItemName(item) {
        if (!item) return '';
        const lookup = item.id && this._envLookup && this._envLookup[item.id];
        const name = (item.name && String(item.name).trim())
            || (lookup && lookup.name)
            || item.originalFilename
            || item.originalFilename
            || '';
        return name || 'Untitled environment';
    }

    productLandingHtml(product) {
        const kind = this.kindOf(product);
        const noun = kind === 'service' ? 'service' : 'product';
        const keywords = Array.isArray(product.keywords) ? product.keywords.join(', ') : String(product.keywords || '');
        const published = product.published !== false;
        const files = product.files || [];
        const steps = this.flatSteps(product).length;
        const relatedProducts = this.itemsOf('product').filter((item) => item.id !== product.id);
        return `
            <section class="hero">
                <div>
                    <h1>${this.escape(product.name || 'Product')}</h1>
                    <p>${kind === 'service' ? 'Service' : 'Product'} · ${steps} API${steps === 1 ? '' : 's'} · ${published ? 'Published to the playground' : 'Unpublished — hidden from the playground'}</p>
                </div>
            </section>
            <article class="product-editor account-card" data-id="${this.escape(product.id || '')}">
                <h2>Settings</h2>
                <div class="admin-form">
                    <input class="p-folder" type="hidden" value="${this.escape(product.folder || '')}">
                    <div class="settings-grid">
                        <span class="field-label">Icon</span>
                        <div class="icon-picker">
                            ${this.iconChooserHtml(product)}
                            <input class="p-icon" type="hidden" value="${this.escape(product.icon || this.defaultProductIcon(product))}">
                        </div>
                        <span class="field-label">Type</span>
                        ${this.kindChooserHtml(kind)}
                        <span class="field-label">Name</span>
                        <input class="p-name" value="${this.escape(product.name || '')}">
                        <span class="field-label">Collection Details</span>
                        <button class="collection-launch" id="openCollectionBtn" type="button">Collection</button>
                        ${kind === 'service' ? `
                        <span class="field-label">Related product</span>
                        ${this.relatedProductChooserHtml(product, relatedProducts)}` : ''}
                    </div>
                    <input class="p-id" type="hidden" value="${this.escape(product.id || '')}">
                    <input class="p-keywords" type="hidden" value="${this.escape(keywords)}">
                    <div class="toolbar settings-actions">
                        <button class="status-toggle ${published ? 'is-live' : 'is-hidden'}" id="publishToggleBtn" type="button" aria-pressed="${published ? 'true' : 'false'}" title="${published ? 'Published to the playground' : 'Unpublished — admin only'}">
                            <b>${published ? 'Online' : 'Offline'}</b>
                        </button>
                        <input class="p-published" type="checkbox" ${published ? 'checked' : ''} hidden>
                        <div class="settings-action-btns">
                            <button class="danger-btn remove-product" type="button">Delete ${noun}</button>
                            <button class="primary-btn" id="saveProductsBtn" type="button">Save ${noun}</button>
                        </div>
                    </div>
                    <p class="form-error" id="productError">${this.escape(this.flash.error)}</p>
                </div>
            </article>
            <article class="product-files-card">
                <h2>Related documents</h2>
                <p class="file-meta">Upload PDFs or other files for this ${noun}. Visitors see them on the playground overview when it is published.</p>
                <div class="dropzone" id="productFileDropzone">
                    <strong>Upload a document</strong>
                    <span>PDF, Word, Excel, PowerPoint, image, text, or ZIP — up to 15 MB</span>
                    <input type="file" id="productFileInput" hidden>
                </div>
                ${files.length ? `
                    <table class="admin-table">
                        <thead><tr><th>Document</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
                        <tbody>
                            ${files.map((file) => `
                                <tr>
                                    <td class="file-name-cell">
                                        ${this.fileTypeIcon(file.name || file.filename)}
                                        <a href="${this.escape(file.url)}" target="_blank" rel="noopener">${this.escape(file.name)}</a>
                                    </td>
                                    <td>${this.formatBytes(file.size)}</td>
                                    <td>${this.escape(this.formatWhen(file.uploadedAt))}</td>
                                    <td><button class="danger-btn small remove-product-file" type="button" data-file-id="${this.escape(file.id)}" data-file-name="${this.escape(file.name)}">Remove</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<div class="notice">No documents yet.</div>'}
            </article>
        `;
    }

    iconChooserHtml(product) {
        const currentId = product.icon || this.defaultProductIcon(product);
        const current = this.productIconList().find((icon) => icon.id === currentId) || { id: currentId, label: 'Icon' };
        return `
            <div class="icon-chooser">
                <button class="icon-current" id="iconCurrentBtn" type="button" title="Change icon" aria-expanded="false" aria-haspopup="true">
                    ${this.iconById(current.id)}
                    <span>${this.escape(current.label)}</span>
                </button>
                <div class="icon-menu hidden" id="iconMenu">
                    <div class="icon-grid">
                        ${this.productIconList().map((icon) => `
                            <button class="icon-pick ${currentId === icon.id ? 'active' : ''}" type="button" data-icon="${icon.id}" title="${this.escape(icon.label)}">
                                ${this.iconById(icon.id)}
                                <small>${this.escape(icon.label)}</small>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    closeIconMenu() {
        document.getElementById('iconMenu')?.classList.add('hidden');
        document.getElementById('iconCurrentBtn')?.setAttribute('aria-expanded', 'false');
    }

    kindChooserHtml(kind) {
        const current = kind === 'service' ? 'service' : 'product';
        const label = current === 'service' ? 'Service' : 'Product';
        return `
            <div class="kind-chooser">
                <button class="kind-current" id="kindCurrentBtn" type="button" aria-expanded="false" aria-haspopup="listbox">
                    <span>${label}</span>
                </button>
                <div class="kind-menu hidden" id="kindMenu" role="listbox">
                    <button class="kind-pick ${current === 'product' ? 'active' : ''}" type="button" data-kind="product">Product</button>
                    <button class="kind-pick ${current === 'service' ? 'active' : ''}" type="button" data-kind="service">Service</button>
                </div>
                <input class="p-kind" type="hidden" value="${current}">
            </div>
        `;
    }

    closeKindMenu() {
        document.getElementById('kindMenu')?.classList.add('hidden');
        document.getElementById('kindCurrentBtn')?.setAttribute('aria-expanded', 'false');
    }

    relatedProductChooserHtml(product, relatedProducts) {
        const currentId = product.productId || '';
        const current = (relatedProducts || []).find((item) => item.id === currentId);
        const label = current?.name || 'None';
        return `
            <div class="kind-chooser related-chooser">
                <button class="kind-current" id="relatedProductBtn" type="button" aria-expanded="false" aria-haspopup="listbox">
                    <span>${this.escape(label)}</span>
                </button>
                <div class="kind-menu hidden" id="relatedProductMenu" role="listbox">
                    <button class="kind-pick ${!currentId ? 'active' : ''}" type="button" data-product-id="" role="option">None</button>
                    ${(relatedProducts || []).map((item) => `
                        <button class="kind-pick ${currentId === item.id ? 'active' : ''}" type="button" data-product-id="${this.escape(item.id)}" role="option">${this.escape(item.name)}</button>
                    `).join('')}
                </div>
                <input class="p-product" type="hidden" value="${this.escape(currentId)}">
            </div>
        `;
    }

    closeRelatedProductMenu() {
        document.getElementById('relatedProductMenu')?.classList.add('hidden');
        document.getElementById('relatedProductBtn')?.setAttribute('aria-expanded', 'false');
    }

    applyRelatedProduct(productId) {
        const input = document.querySelector('.p-product');
        const btn = document.getElementById('relatedProductBtn');
        const id = String(productId || '');
        const related = this.itemsOf('product');
        const current = related.find((item) => item.id === id);
        const label = current?.name || 'None';
        if (input) input.value = id;
        if (btn) btn.innerHTML = `<span>${this.escape(label)}</span>`;
        document.querySelectorAll('#relatedProductMenu .kind-pick').forEach((el) => {
            el.classList.toggle('active', String(el.dataset.productId || '') === id);
        });
        this.closeRelatedProductMenu();
        this.syncProductForms();
    }

    applyProductKind(kind) {
        const input = document.querySelector('.p-kind');
        const btn = document.getElementById('kindCurrentBtn');
        const next = kind === 'service' ? 'service' : 'product';
        if (input) input.value = next;
        if (btn) btn.innerHTML = `<span>${next === 'service' ? 'Service' : 'Product'}</span>`;
        document.querySelectorAll('#kindMenu .kind-pick').forEach((el) => el.classList.toggle('active', el.dataset.kind === next));
        this.closeKindMenu();
        this.syncProductForms();
        this.render();
    }

    applyProductIcon(id) {
        const icon = this.productIconList().find((item) => item.id === id) || { id, label: 'Icon' };
        const input = document.querySelector('.p-icon');
        const current = document.getElementById('iconCurrentBtn');
        if (input) input.value = icon.id;
        if (current) {
            current.innerHTML = `${this.iconById(icon.id)}<span>${this.escape(icon.label)}</span>`;
        }
        document.querySelectorAll('.icon-pick').forEach((el) => el.classList.toggle('active', el.dataset.icon === icon.id));
        this.closeIconMenu();
        this.syncProductForms();
        const iconWrap = document.querySelector(`#adminTree .sidebar-accordion[data-accordion-id="${this.selectedItemId}"] .folder-icon`);
        if (iconWrap) iconWrap.innerHTML = this.folderGlyph(this.editingProduct());
    }

    productForm(product) {
        const kind = this.kindOf(product);
        const noun = kind === 'service' ? 'service' : 'product';
        const relatedProducts = this.itemsOf('product').filter((item) => item.id !== product.id);
        const keywords = Array.isArray(product.keywords) ? product.keywords.join(', ') : String(product.keywords || '');
        const stepSelected = this.findNode(this.productTree(product), this.selectedTreeNodeId)?.node?.type === 'step';
        return `
            <details class="product-settings" ${stepSelected ? '' : 'open'}>
                <summary>Product settings</summary>
                <article class="product-editor" data-id="${this.escape(product.id || '')}">
                    <div class="admin-form">
                        <div class="form-row">
                            <label>Name<input class="p-name" value="${this.escape(product.name || '')}"></label>
                            <label>ID<input class="p-id" value="${this.escape(product.id || '')}" placeholder="auto-from-name"></label>
                        </div>
                        <label class="publish-toggle">
                            <input class="p-published" type="checkbox" ${product.published !== false ? 'checked' : ''}>
                            <span>Publish to the public playground</span>
                        </label>
                        <div class="form-row">
                            <label>Type
                                <select class="p-kind">
                                    <option value="product" ${kind === 'product' ? 'selected' : ''}>Product</option>
                                    <option value="service" ${kind === 'service' ? 'selected' : ''}>Service</option>
                                </select>
                            </label>
                            <label>Keywords (comma separated)
                                <input class="p-keywords" value="${this.escape(keywords)}">
                            </label>
                        </div>
                        ${kind === 'service' ? `
                        <div class="form-row">
                            <label>Related product
                                ${this.relatedProductChooserHtml(product, relatedProducts)}
                            </label>
                        </div>` : ''}
                        <div class="form-row">
                            <label>Default collection folder
                                <select class="p-folder">${this.folderOptions(product.folder || '')}</select>
                            </label>
                        </div>
                        <div class="toolbar">
                            <button class="ghost-btn remove-product" type="button">Remove ${noun}</button>
                            <button class="primary-btn" id="saveProductsBtn" type="button">Save ${noun}</button>
                        </div>
                        <p class="form-error" id="productError">${this.escape(this.flash.error)}</p>
                        <p class="form-ok" id="productOk">${this.escape(this.flash.ok)}</p>
                    </div>
                </article>
            </details>
        `;
    }

    folderIsOpen(id, depth) {
        if (this.openFolders[id] === true) return true;
        if (this.openFolders[id] === false) return false;
        return false;
    }

    treeEditorHtml(nodes, depth, options = {}) {
        const list = nodes || [];
        const readOnly = Boolean(options.readOnly);
        const hideSeq = Boolean(options.hideSeq);
        return list.map((node) => {
            if (node.type === 'folder') {
                const open = this.folderIsOpen(node.id, depth);
                return `
                    <div class="tree-folder ${open ? 'open' : ''}" data-folder-wrap="${this.escape(node.id)}">
                        <div class="tree-row folder ${this.selectedTreeNodeId === node.id ? 'active' : ''}" ${readOnly ? '' : 'draggable="true"'} data-node-id="${this.escape(node.id)}" data-kind="folder" style="padding-left:${depth * 8}px">
                            ${readOnly ? '' : '<span class="drag-handle" title="Drag to move">⋮⋮</span>'}
                            <button class="tree-toggle ${open ? 'open' : ''}" type="button" data-toggle-folder="${this.escape(node.id)}">${this.chevronSvg()}</button>
                            ${this.folderIconSvg()}
                            ${hideSeq ? '' : this.seqHtml(node, readOnly)}
                            ${this.treeNameHtml(node.id, node.name || 'Folder', 'Folder name', readOnly)}
                            ${readOnly ? '' : this.treeMenuHtml(node.id)}
                        </div>
                        <div class="tree-children">${open ? this.treeEditorHtml(node.children || [], depth + 1, options) : ''}</div>
                    </div>
                `;
            }
            const linked = this.matchEndpoint(node);
            return `
                <div class="tree-row step ${this.selectedTreeNodeId === node.id ? 'active' : ''}" ${readOnly ? '' : 'draggable="true"'} data-node-id="${this.escape(node.id)}" data-kind="step" style="padding-left:${depth * 8}px">
                    ${readOnly ? '' : '<span class="drag-handle" title="Drag to move">⋮⋮</span>'}
                    ${this.methodBadge(node.method || linked?.method)}
                    ${hideSeq ? '' : this.seqHtml(node, readOnly)}
                    ${this.treeNameHtml(node.id, node.label || linked?.name || 'Request', 'Request name', readOnly)}
                    ${readOnly ? '' : this.treeMenuHtml(node.id)}
                </div>
            `;
        }).join('');
    }

    parseSeq(value) {
        const n = parseInt(String(value ?? '').trim(), 10);
        return Number.isFinite(n) && n > 0 ? n : '';
    }

    seqHtml(node, readOnly = false) {
        const value = this.parseSeq(node?.seq);
        if (readOnly) {
            return value
                ? `<span class="tree-seq-chip" title="Flow sequence">${value}</span>`
                : '<span class="tree-seq-chip is-empty" aria-hidden="true"></span>';
        }
        return `<input class="tree-seq" type="number" min="1" step="1" inputmode="numeric" value="${value}" placeholder="#" title="Flow sequence — duplicate numbers are allowed when two APIs serve the same object" data-seq-node="${this.escape(node.id)}" aria-label="Flow sequence">`;
    }

    setNodeSeq(id, raw) {
        const product = this.editingProduct();
        if (!product) return;
        const found = this.findNode(this.productTree(product), id);
        if (!found) return;
        const seq = this.parseSeq(raw);
        if (seq) found.node.seq = seq;
        else delete found.node.seq;
    }

    treeNameHtml(id, value, placeholder, readOnly = false) {
        if (!readOnly && this.renamingNodeId === id) {
            return `<input class="tree-name" data-rename-input="${this.escape(id)}" value="${this.escape(value || '')}" placeholder="${this.escape(placeholder)}">`;
        }
        const label = value || placeholder;
        return `<span class="tree-label" title="${this.escape(label)}">${this.escape(label)}</span>`;
    }

    treeMenuHtml(id) {
        return `<button class="tree-menu-btn" type="button" data-tree-menu="${this.escape(id)}" title="Settings">${this.settingsIconSvg()}</button>`;
    }

    openTreeMenu(btn, id) {
        const portal = document.getElementById('treeMenuPortal');
        if (!portal) return;
        if (this.menuNodeId === id && !portal.classList.contains('hidden')) {
            this.closeTreeMenu();
            return;
        }
        const rect = btn.getBoundingClientRect();
        this.menuNodeId = id;
        portal.classList.remove('hidden');
        const menuWidth = Math.max(portal.offsetWidth, 148);
        const menuHeight = portal.offsetHeight || 80;
        const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8);
        const below = rect.bottom + 6;
        const top = below + menuHeight > window.innerHeight - 8
            ? Math.max(8, rect.top - menuHeight - 6)
            : below;
        portal.style.top = `${top}px`;
        portal.style.left = `${left}px`;
    }

    closeTreeMenu() {
        this.menuNodeId = null;
        document.getElementById('treeMenuPortal')?.classList.add('hidden');
    }

    endpointWorkspaceHtml(product) {
        const found = this.findNode(this.productTree(product), this.selectedTreeNodeId);
        const step = found?.node?.type === 'step' ? found.node : null;
        if (!step) {
            return `
                <section class="hero">
                    <div>
                        <h1>${this.escape(product.name || 'Product')}</h1>
                        <p>Add folders and APIs in the tree on the left. Drag to reorder. Click an endpoint to open its details and documentation.</p>
                    </div>
                </section>
            `;
        }
        const ep = this.matchEndpoint(step);
        const draft = this.stepDraft(step);
        const tab = this.apiDetailTab || 'details';
        return `
            <section class="endpoint-workspace">
                <div class="view-tabs endpoint-page-tabs">
                    <button class="tab-btn ${tab === 'details' ? 'active' : ''}" type="button" data-api-tab="details">Endpoint Details</button>
                    <button class="tab-btn ${tab === 'docs' ? 'active' : ''}" type="button" data-api-tab="docs">Endpoint Documentation</button>
                </div>
                <div class="endpoint-title">
                    <h1>${this.escape(draft.label || 'API')}</h1>
                </div>
                ${tab === 'docs' ? this.endpointDocsHtml(ep, step) : this.endpointDetailsHtml(ep, step, draft)}
            </section>
        `;
    }

    stepDraft(step) {
        const ep = this.matchEndpoint(step);
        const local = Boolean(step.url || (step.query && step.query.length) || (step.headers && step.headers.length) || step.body);
        const sourceUrl = step.url || ep?.url || '{{host}}/';
        const parsed = this.parseUrlQuery(sourceUrl);
        const storedQuery = this.normalizeKv(local ? (step.query || []) : (ep?.query || []));
        const query = storedQuery.length ? storedQuery : parsed.query;
        const headers = this.normalizeKv(local ? (step.headers || []) : (ep?.headers || []));
        const body = local ? (step.body || '') : (ep?.body || '');
        const method = String(step.method || ep?.method || 'GET').toUpperCase();
        const bodyMode = step.bodyMode || (body ? 'raw' : (['GET', 'HEAD'].indexOf(method) >= 0 ? 'none' : 'raw'));
        return {
            label: step.label || ep?.name || 'Request',
            method,
            url: this.composeUrl(parsed.base || sourceUrl, query),
            path: step.path || ep?.path || this.pathFromUrl(sourceUrl),
            query,
            headers,
            body,
            bodyMode,
            formData: this.normalizeKv(step.formData || []),
            urlencoded: this.normalizeKv(step.urlencoded || []),
            auth: step.auth && step.auth.type ? step.auth : { type: 'none', token: '', username: '', password: '' },
            scripts: local && step.scripts ? step.scripts : (step.scripts && step.scripts.length ? step.scripts : (ep?.scripts || [])),
            crumbs: ep?.crumbs || [],
        };
    }

    parseUrlQuery(url) {
        const raw = String(url || '');
        const qIndex = raw.indexOf('?');
        if (qIndex < 0) return { base: raw, query: [] };
        const base = raw.slice(0, qIndex);
        const query = [];
        raw.slice(qIndex + 1).split('&').forEach((part) => {
            if (!part) return;
            const eq = part.indexOf('=');
            const key = this.decodeQueryPart(eq < 0 ? part : part.slice(0, eq));
            const value = eq < 0 ? '' : this.decodeQueryPart(part.slice(eq + 1));
            if (key) query.push({ key, value, enabled: true });
        });
        return { base, query };
    }

    decodeQueryPart(value) {
        try {
            return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
        } catch (e) {
            return String(value || '');
        }
    }

    composeUrl(base, query) {
        const root = String(base || '').split('?')[0];
        const rows = this.normalizeKv(query).filter((row) => row.enabled && row.key);
        if (!rows.length) return root;
        const params = rows.map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`).join('&');
        return `${root}?${params}`;
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
        const mode = draft?.bodyMode || (draft?.body ? 'raw' : 'none');
        if (mode === 'none') return false;
        if (mode === 'raw') return Boolean(String(draft?.body || '').trim());
        if (mode === 'form-data') return this.kvHasValues(draft?.formData);
        if (mode === 'urlencoded') return this.kvHasValues(draft?.urlencoded);
        return Boolean(String(draft?.body || '').trim());
    }

    scriptsHaveValues(draft) {
        const scripts = draft?.scripts || [];
        return Boolean(this.scriptText(scripts, 'prerequest').trim() || this.scriptText(scripts, 'test').trim());
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
            const pre = this.scriptText(draft?.scripts || [], 'prerequest').trim();
            const test = this.scriptText(draft?.scripts || [], 'test').trim();
            scriptPane = pre ? 'prerequest' : (test ? 'test' : 'prerequest');
        }
        return { tab, scriptPane };
    }

    kvTableHtml(id, rows) {
        const list = rows.slice();
        return `<table class="kv-table" id="${id}">
            <thead><tr><th></th><th>Key</th><th>Value</th><th></th></tr></thead>
            <tbody>
                ${list.map((row, i) => `
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

    scriptText(scripts, listen) {
        const found = (scripts || []).find((item) => item && item.listen === listen);
        if (!found) return '';
        const exec = found.exec != null ? found.exec : (found.script && found.script.exec);
        if (Array.isArray(exec)) return exec.join('\n');
        return exec ? String(exec) : '';
    }

    methodPickerHtml(method) {
        const current = String(method || 'GET').toUpperCase();
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        return `
            <div class="method-picker" id="epMethodPicker">
                <input type="hidden" id="epMethod" value="${this.escape(current)}">
                <button class="method-picker-btn method-${current.toLowerCase()}" id="epMethodBtn" type="button" aria-haspopup="listbox" aria-expanded="false">
                    <span>${this.escape(current)}</span>
                    <svg class="method-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="method-picker-menu hidden" id="epMethodMenu" role="listbox">
                    ${methods.map((m) => `
                        <button type="button" class="method-option method-${m.toLowerCase()} ${m === current ? 'is-current' : ''}" data-method="${m}" role="option">${m}</button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    closeMethodPicker() {
        document.getElementById('epMethodMenu')?.classList.add('hidden');
        document.getElementById('epMethodBtn')?.setAttribute('aria-expanded', 'false');
    }

    setEditorMethod(method) {
        const value = String(method || 'GET').toUpperCase();
        const hidden = document.getElementById('epMethod');
        if (hidden) hidden.value = value;
        this.closeMethodPicker();
        this.syncEndpointEditor();
        const step = this.currentStep();
        if (step) step.method = value;
        this.render();
    }

    highlightUrl(value) {
        return this.escape(value).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, key) => {
            const name = String(key || '').trim();
            return `<span class="url-var" data-env-var="${this.escape(name)}">${this.escape(m)}</span>`;
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

    lineGutter(text) {
        const n = Math.max(1, String(text || '').split('\n').length);
        let lines = '';
        for (let i = 1; i <= n; i++) lines += `${i}\n`;
        return lines.trimEnd();
    }

    prettyJson(text) {
        try {
            return JSON.stringify(JSON.parse(this.stripLineComments(text)), null, 4);
        } catch (e) {
            return this.beautifyJsonc(text);
        }
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

    stripLineComments(source) {
        const s = String(source ?? '');
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

    formatBytes(n) {
        const size = Number(n) || 0;
        if (size < 1024) return `${size} B`;
        if (size < 1048576) return `${(size / 1024).toFixed(2)} KB`;
        return `${(size / 1048576).toFixed(2)} MB`;
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
            json: { fill: '#E87722', label: 'JSON' },
            col: { fill: '#13aceb', label: 'COL' },
            env: { fill: '#8fc637', label: 'ENV' },
        };
        const kind = kinds[ext] || { fill: '#6B7280', label: (ext || 'FILE').toUpperCase().slice(0, 3) };
        const small = kind.label.length > 1;
        return `<svg class="file-type-icon" viewBox="0 0 32 40" aria-hidden="true" title="${this.escape(kind.label)}">
            <path d="M4 2h16l8 8v26a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="${kind.fill}"/>
            <path d="M20 2v6a2 2 0 0 0 2 2h6" fill="rgba(255,255,255,0.28)"/>
            <text x="16" y="26" text-anchor="middle" fill="#fff" font-size="${small ? 8 : 13}" font-weight="800" font-family="Nunito Sans, sans-serif">${kind.label}</text>
        </svg>`;
    }

    statusPhrase(status) {
        const map = {
            200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found',
            400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
            409: 'Conflict', 422: 'Unprocessable Entity', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
        };
        return map[status] || '';
    }

    parseResponseJson(body) {
        const raw = String(body ?? '');
        if (typeof globalThis.JsonViewer === 'undefined') return { ok: false, value: raw };
        let parsed = JsonViewer.parse(this.stripLineComments(raw));
        if (!parsed.ok) parsed = JsonViewer.parse(raw);
        return parsed;
    }

    looksLikeHtml(text) {
        const s = String(text || '').trim();
        return s.startsWith('<') && /<\/[a-z][a-z0-9:-]*>/i.test(s);
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
        const parsed = this.parseResponseJson(body);
        if (parsed.ok && typeof parsed.value === 'object' && parsed.value !== null) {
            return `
                <div class="json-viewer" id="responseViewer" data-mode="tree">
                    ${this.responseFilterBarHtml(true)}
                    ${JsonViewer.treeHtml(parsed.value, this.responseCollapsed)}
                </div>
            `;
        }
        const text = parsed.ok ? JSON.stringify(parsed.value) : String(body ?? '');
        this._responseRawText = text;
        return `
            <div class="json-viewer" id="responseViewer" data-mode="raw">
                ${this.responseFilterBarHtml(false)}
                <pre class="json-raw" id="responseRawBody">${this.escape(text)}</pre>
            </div>
        `;
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
        ta.addEventListener('input', paint);
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

    bindUrlHighlight() {
        const input = document.getElementById('epUrl');
        const overlay = document.getElementById('epUrlHighlight');
        if (!input || !overlay) return;
        const paint = () => {
            overlay.innerHTML = this.highlightUrl(input.value);
            overlay.scrollLeft = input.scrollLeft;
        };
        input.addEventListener('input', paint);
        input.addEventListener('scroll', paint);
        paint();
    }

    endpointDetailsHtml(ep, step, draft) {
        const tab = this.editorTab || 'params';
        const method = draft.method;
        const res = this.epResponse;
        const responseTab = this.responseTab || 'body';
        const cookieHeaders = res?.headers ? Object.keys(res.headers).filter((k) => k.toLowerCase() === 'set-cookie') : [];
        const resHeaderCount = res?.headers ? Object.keys(res.headers).length : 0;
        const ok = res && res.status >= 200 && res.status < 300;
        const bodyMode = draft.bodyMode || 'raw';
        const auth = draft.auth || { type: 'none' };
        const flags = this.tabFlags(draft);
        const headerCount = this.normalizeKv(draft.headers).length;
        return `
            <article class="api-detail endpoint-editor postman-editor" style="--pm-split: ${this.pmSplit}">
                <section class="pm-request">
                    <div class="request-bar pm-request-bar">
                        ${this.methodPickerHtml(method)}
                        <div class="url-highlight-wrap">
                            <div class="url-highlight" id="epUrlHighlight" aria-hidden="true">${this.highlightUrl(draft.url)}</div>
                            <input class="url-input" id="epUrl" value="${this.escape(draft.url)}" placeholder="{{host}}/api/v1/..." spellcheck="false">
                        </div>
                        <button class="eye-btn" id="epEyeBtn" type="button" title="Show what will be sent" aria-label="Show what will be sent">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M2.5 12S6.2 6.5 12 6.5 21.5 12 21.5 12 17.8 17.5 12 17.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.7"/>
                                <circle cx="12" cy="12" r="3.1" stroke="currentColor" stroke-width="1.7"/>
                            </svg>
                        </button>
                        <button class="eye-btn" id="epFocusBtn" type="button" title="Open tester in a new tab" aria-label="Open tester in a new tab">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                            </svg>
                        </button>
                        <button class="send-btn" id="epSendBtn" type="button">Send</button>
                        <button class="ghost-btn" id="epSaveBtn" type="button">Save</button>
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
                        <button class="pm-tab ${tab === 'params' ? 'active' : ''}" type="button" data-editor-tab="params">Params${flags.params ? '<span class="tab-dot"></span>' : ''}</button>
                        <button class="pm-tab ${tab === 'auth' ? 'active' : ''}" type="button" data-editor-tab="auth">Authorization${flags.auth ? '<span class="tab-dot"></span>' : ''}</button>
                        <button class="pm-tab ${tab === 'headers' ? 'active' : ''}" type="button" data-editor-tab="headers">Headers${flags.headers ? `<span class="tab-dot"></span>${headerCount ? ` <span class="tab-count">${headerCount}</span>` : ''}` : ''}</button>
                        <button class="pm-tab ${tab === 'body' ? 'active' : ''}" type="button" data-editor-tab="body">Body${flags.body ? '<span class="tab-dot"></span>' : ''}</button>
                        <button class="pm-tab ${tab === 'scripts' ? 'active' : ''}" type="button" data-editor-tab="scripts">Scripts${flags.scripts ? '<span class="tab-dot"></span>' : ''}</button>
                    </div>
                    <div class="pm-pane">
                        ${tab === 'params' ? `
                            <h4>Query Params</h4>
                            ${this.kvTableHtml('queryTable', draft.query)}
                            <button class="linkish" id="addQuery" type="button">+ Add query parameter</button>
                        ` : ''}
                        ${tab === 'auth' ? `
                            <div class="pm-auth">
                                <label>Type
                                    <select id="epAuthType">
                                        <option value="none" ${auth.type === 'none' ? 'selected' : ''}>No Auth</option>
                                        <option value="bearer" ${auth.type === 'bearer' ? 'selected' : ''}>Bearer Token</option>
                                        <option value="basic" ${auth.type === 'basic' ? 'selected' : ''}>Basic Auth</option>
                                    </select>
                                </label>
                                ${auth.type === 'bearer' ? `<label>Token<input id="epAuthToken" type="text" value="${this.escape(auth.token || '')}" placeholder="token"></label>` : ''}
                                ${auth.type === 'basic' ? `
                                    <label>Username<input id="epAuthUser" type="text" value="${this.escape(auth.username || '')}"></label>
                                    <label>Password<input id="epAuthPass" type="password" value="${this.escape(auth.password || '')}"></label>
                                ` : ''}
                                ${auth.type === 'none' ? '<p class="file-meta">This request does not use authorization.</p>' : ''}
                            </div>
                        ` : ''}
                        ${tab === 'headers' ? `
                            ${this.kvTableHtml('headerTable', draft.headers)}
                            <button class="linkish" id="addHeader" type="button">+ Add header</button>
                        ` : ''}
                        ${tab === 'body' ? `
                            <div class="pm-body-toolbar">
                                ${['none', 'form-data', 'urlencoded', 'raw'].map((mode) => `
                                    <label class="pm-mode ${bodyMode === mode ? 'active' : ''}">
                                        <input type="radio" name="epBodyMode" value="${mode}" ${bodyMode === mode ? 'checked' : ''}>
                                        ${mode === 'urlencoded' ? 'x-www-form-urlencoded' : mode}
                                    </label>
                                `).join('')}
                                ${bodyMode === 'raw' ? `
                                    <button class="pm-lang" id="downloadBodyJson" type="button" title="Download JSON">JSON</button>
                                    <button class="linkish" id="beautifyBody" type="button">Beautify</button>
                                ` : ''}
                            </div>
                            ${bodyMode === 'none' ? '<div class="notice">This request does not have a body.</div>' : ''}
                            ${bodyMode === 'form-data' ? `${this.kvTableHtml('formDataTable', draft.formData)}<button class="linkish" id="addFormData" type="button">+ Add row</button>` : ''}
                            ${bodyMode === 'urlencoded' ? `${this.kvTableHtml('urlencodedTable', draft.urlencoded)}<button class="linkish" id="addUrlencoded" type="button">+ Add row</button>` : ''}
                            ${bodyMode === 'raw' ? this.codeEditorHtml('epBody', draft.body, false) : ''}
                        ` : ''}
                        ${tab === 'scripts' ? `
                            <div class="pm-scripts">
                                <div class="pm-script-nav" role="tablist" aria-label="Script type">
                                    <button class="pm-script-tab ${this.scriptPane !== 'test' ? 'active' : ''}" type="button" data-script-pane="prerequest" role="tab" aria-selected="${this.scriptPane !== 'test' ? 'true' : 'false'}">
                                        Pre-request${this.scriptText(draft.scripts, 'prerequest').trim() ? '<span class="tab-dot"></span>' : ''}
                                    </button>
                                    <button class="pm-script-tab ${this.scriptPane === 'test' ? 'active' : ''}" type="button" data-script-pane="test" role="tab" aria-selected="${this.scriptPane === 'test' ? 'true' : 'false'}">
                                        Post-response${this.scriptText(draft.scripts, 'test').trim() ? '<span class="tab-dot"></span>' : ''}
                                    </button>
                                </div>
                                <div class="pm-script-body">
                                    <div class="pm-script-editor ${this.scriptPane === 'test' ? 'hidden' : ''}">
                                        ${this.codeEditorHtml('epPreScript', this.scriptText(draft.scripts, 'prerequest'), false, 'script')}
                                    </div>
                                    <div class="pm-script-editor ${this.scriptPane === 'test' ? '' : 'hidden'}">
                                        ${this.codeEditorHtml('epTestScript', this.scriptText(draft.scripts, 'test'), false, 'script')}
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </section>
                <div class="pm-splitter" id="pmSplitter" role="separator" aria-orientation="horizontal" title="Drag to resize"></div>
                <section class="pm-response">
                    <div class="pm-response-head">
                        <div class="pm-tabs">
                            <button class="pm-tab ${responseTab === 'body' ? 'active' : ''}" type="button" data-response-tab="body">Body</button>
                            <button class="pm-tab ${responseTab === 'headers' ? 'active' : ''}" type="button" data-response-tab="headers">Headers${resHeaderCount ? ` <span class="tab-count">${resHeaderCount}</span>` : ''}</button>
                            <button class="pm-tab ${responseTab === 'cookies' ? 'active' : ''}" type="button" data-response-tab="cookies">Cookies${cookieHeaders.length ? ` <span class="tab-count">${cookieHeaders.length}</span>` : ''}</button>
                            <button class="pm-tab ${responseTab === 'preview' ? 'active' : ''}" type="button" data-response-tab="preview">Preview</button>
                        </div>
                        ${res ? `<div class="response-meta">
                            <span class="status-pill ${ok ? 'ok' : 'bad'}">${res.status || 'ERR'} ${this.escape(this.statusPhrase(res.status))}</span>
                            <span>${res.timeMs ?? '—'} ms</span>
                            <span>${this.formatBytes(res.size != null ? res.size : String(res.body || '').length)}</span>
                            <button class="pm-lang" id="downloadResponseJson" type="button" title="Download JSON">JSON</button>
                            <button class="linkish" id="copyResponse" type="button">Copy</button>
                        </div>` : ''}
                    </div>
                    ${!res ? '<div class="response-placeholder">Send the request to see the response.</div>' : ''}
                    ${res && responseTab === 'preview' ? '<iframe class="visualizer-frame" id="epVisualizer" title="Response preview" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>' : ''}
                    ${res && responseTab === 'body' ? this.responseBodyHtml(res.body) : ''}
                    ${res && responseTab === 'headers' ? `
                        <div class="json-viewer" id="responseViewer" data-mode="headers">
                            ${this.responseFilterBarHtml(false)}
                            <table class="kv-table pm-readonly-table">
                                <thead><tr><th>Key</th><th>Value</th></tr></thead>
                                <tbody>${Object.keys(res.headers || {}).map((key) => `<tr><td>${this.escape(key)}</td><td>${this.escape(String(res.headers[key]))}</td></tr>`).join('') || '<tr><td colspan="2">No headers</td></tr>'}</tbody>
                            </table>
                        </div>
                    ` : ''}
                    ${res && responseTab === 'cookies' ? `
                        <div class="json-viewer" id="responseViewer" data-mode="cookies">
                            ${this.responseFilterBarHtml(false)}
                            <table class="kv-table pm-readonly-table">
                                <thead><tr><th>Set-Cookie</th></tr></thead>
                                <tbody>${cookieHeaders.length ? cookieHeaders.map((key) => `<tr><td>${this.escape(String(res.headers[key]))}</td></tr>`).join('') : '<tr><td>No cookies</td></tr>'}</tbody>
                            </table>
                        </div>
                    ` : ''}
                </section>
                <p class="form-error" id="epEditError">${this.escape(this.flash.error)}</p>
                <p class="form-ok" id="epEditOk">${this.escape(this.flash.ok)}</p>
            </article>
        `;
    }

    endpointDocsHtml(ep, step) {
        const draft = this.stepDraft(step);
        const method = String(draft.method || ep?.method || 'GET').toUpperCase();
        const url = draft.url || ep?.url || ep?.path || '';
        return `
            <article class="api-detail docs-editor-card">
                <div class="docs-endpoint-head">
                    <span class="pill-${method.toLowerCase()}">${this.escape(method)}</span>
                    <code>${this.escape(url)}</code>
                </div>
                <p class="file-meta">Write documentation for this API. Only what you save here is published — request field changes do not overwrite it.</p>
                ${this.docEditorMarkup('apiDoc', true)}
                <div class="toolbar">
                    <button class="ghost-btn" id="previewDocsBtn" type="button">${this.docPreview ? 'Edit' : 'Preview'}</button>
                    <button class="primary-btn" id="saveDocsBtn" type="button">Save documentation</button>
                </div>
                <p class="form-error" id="epError"></p>
                <p class="form-ok" id="epOk"></p>
            </article>
        `;
    }

    repoPickerHtml() {
        const tree = this.repoTree();
        const picks = this.repoPicks || [];
        const split = this.repoSplit > 0.32 && this.repoSplit < 0.74 ? this.repoSplit : 0.56;
        const noun = this.kindOf(this.editingProduct()) === 'service' ? 'service' : 'product';
        const n = picks.length;
        return `
            <div class="repo-modal" id="repoModal">
                <div class="repo-panel" role="dialog" aria-modal="true" aria-labelledby="repoPickerTitle" tabindex="-1">
                    <div class="drawer-head repo-head">
                        <div>
                            <h2 id="repoPickerTitle">Add from collection</h2>
                            <p>Click a folder to expand it. Select folders or APIs one by one — they appear on the right before you add them to this ${noun}.</p>
                        </div>
                        <button class="icon-btn" id="closeRepoBtn" type="button" aria-label="Close">×</button>
                    </div>
                    <div class="repo-split" id="repoSplit" style="grid-template-columns:${Math.round(split * 100)}% 8px minmax(0,1fr)">
                        <div class="repo-pane repo-tree-pane">
                            <div class="repo-pane-head">Collection</div>
                            <div class="repo-list" id="repoTreeList">
                                ${tree.length ? this.repoTreeHtml(tree, 0) : '<div class="repo-empty">Upload a collection repository first.</div>'}
                            </div>
                        </div>
                        <div class="repo-splitter" id="repoSplitter" role="separator" aria-orientation="vertical" title="Drag to resize"></div>
                        <div class="repo-pane repo-picked-pane">
                            <div class="repo-pane-head">
                                <span>Selected</span>
                                <span class="repo-pick-count" id="repoPickCount">${n}</span>
                            </div>
                            <div class="repo-picked" id="repoPicked">${this.repoPickedHtml()}</div>
                        </div>
                    </div>
                    <div class="drawer-foot repo-foot">
                        <button class="ghost-btn" id="cancelRepoBtn" type="button">Cancel</button>
                        <button class="primary-btn" id="addRepoPicksBtn" type="button" ${n ? '' : 'disabled'}>${n ? `Add ${n} selected` : 'Add selected'}</button>
                    </div>
                </div>
            </div>
        `;
    }

    repoTree() {
        const root = [];
        const folders = new Map();
        const ensure = (crumbs) => {
            let list = root;
            const path = [];
            crumbs.forEach((name) => {
                path.push(name);
                const key = path.join('\u0001');
                if (!folders.has(key)) {
                    const folder = { type: 'folder', name, path: path.slice(), children: [] };
                    folders.set(key, folder);
                    list.push(folder);
                }
                list = folders.get(key).children;
            });
            return list;
        };
        (this.summary?.endpoints || []).forEach((ep) => {
            const crumbs = ep.crumbs && ep.crumbs.length > 1 ? ep.crumbs.slice(0, -1) : [ep.folder || 'General'];
            ensure(crumbs).push({ type: 'request', ep });
        });
        return root;
    }

    countRepoRequests(node) {
        if (node.type === 'request') return 1;
        return (node.children || []).reduce((sum, child) => sum + this.countRepoRequests(child), 0);
    }

    repoPathKey(path) {
        return (path || []).join('\u0001');
    }

    parseRepoPath(value) {
        if (Array.isArray(value)) return value;
        if (String(value || '').indexOf('[') === 0) {
            try { return JSON.parse(value); } catch (e) { return []; }
        }
        return String(value || '').split(/[|/]/).filter(Boolean);
    }

    sameRepoPath(a, b) {
        const left = a || [];
        const right = b || [];
        return left.length === right.length && left.every((name, i) => name === right[i]);
    }

    isUnderRepoPath(child, parent) {
        const c = child || [];
        const p = parent || [];
        if (!p.length || c.length < p.length) return false;
        return p.every((name, i) => c[i] === name);
    }

    repoRequestCrumbs(ep) {
        if (ep?.crumbs && ep.crumbs.length > 1) return ep.crumbs.slice(0, -1);
        return [ep?.folder || 'General'];
    }

    repoFolderPicked(path) {
        return (this.repoPicks || []).some((pick) => pick.type === 'folder' && this.sameRepoPath(pick.path, path));
    }

    repoFolderCovered(path) {
        return (this.repoPicks || []).some((pick) => pick.type === 'folder' && this.isUnderRepoPath(path, pick.path) && !this.sameRepoPath(path, pick.path));
    }

    repoRequestPicked(id) {
        return (this.repoPicks || []).some((pick) => pick.type === 'request' && pick.id === id);
    }

    repoRequestCovered(ep) {
        const crumbs = this.repoRequestCrumbs(ep);
        return (this.repoPicks || []).some((pick) => pick.type === 'folder' && this.isUnderRepoPath(crumbs, pick.path));
    }

    findRepoFolder(path) {
        let node = { type: 'folder', children: this.repoTree() };
        for (const name of path || []) {
            node = (node.children || []).find((child) => child.type === 'folder' && child.name === name) || null;
            if (!node) return null;
        }
        return node;
    }

    repoPickBtnHtml(on, covered) {
        return `
            <button class="repo-pick ${on ? 'is-on' : ''}" type="button" ${covered ? 'disabled' : ''} aria-pressed="${on ? 'true' : 'false'}" title="${covered ? 'Included in a selected folder' : (on ? 'Remove from selection' : 'Select')}">
                <svg class="repo-plus" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M6 2.2v7.6M2.2 6h7.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <svg class="repo-check" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.3 6.2L4.8 8.7L9.7 3.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
        `;
    }

    repoTreeHtml(nodes, depth) {
        return (nodes || []).map((node) => {
            if (node.type === 'folder') {
                const path = node.path || [];
                const key = this.repoPathKey(path);
                const open = Boolean(this.repoOpenFolders[key]);
                const count = this.countRepoRequests(node);
                const hasChildren = (node.children || []).length > 0;
                const picked = this.repoFolderPicked(path);
                const covered = this.repoFolderCovered(path);
                return `
                    <div class="repo-tree-folder ${open ? 'is-open' : ''}" data-folder-key="${this.escape(key)}">
                        <div class="repo-row folder ${picked ? 'is-picked' : ''} ${covered ? 'is-covered' : ''}" data-repo-path="${this.escape(JSON.stringify(path))}" style="padding-left:${8 + depth * 14}px">
                            <button class="repo-toggle ${open ? 'is-open' : ''}" type="button" data-repo-toggle="${this.escape(JSON.stringify(path))}" ${hasChildren ? '' : 'disabled'} aria-expanded="${open ? 'true' : 'false'}" aria-label="${open ? 'Collapse' : 'Expand'} ${this.escape(node.name)}">
                                ${this.chevronSvg()}
                            </button>
                            <button class="repo-folder-main" type="button" data-repo-toggle="${this.escape(JSON.stringify(path))}" ${hasChildren ? '' : 'disabled'}>
                                ${this.folderIconSvg()}
                                <span>${this.escape(node.name)}</span>
                            </button>
                            <small>${count} API${count === 1 ? '' : 's'}</small>
                            ${this.repoPickBtnHtml(picked, covered)}
                        </div>
                        ${hasChildren ? `<div class="repo-tree-children">${this.repoTreeHtml(node.children, depth + 1)}</div>` : ''}
                    </div>
                `;
            }
            const ep = node.ep;
            const picked = this.repoRequestPicked(ep.id);
            const covered = this.repoRequestCovered(ep);
            return `
                <div class="repo-row request ${picked ? 'is-picked' : ''} ${covered ? 'is-covered' : ''}" data-repo-id="${this.escape(ep.id)}" style="padding-left:${26 + depth * 14}px">
                    ${this.methodBadge(ep.method)}
                    <span class="repo-row-copy">
                        <span>${this.escape(ep.name)}</span>
                        <small>${this.escape(ep.path || ep.url || '')}</small>
                    </span>
                    ${this.repoPickBtnHtml(picked, covered)}
                </div>
            `;
        }).join('');
    }

    repoPickedHtml() {
        const picks = this.repoPicks || [];
        if (!picks.length) {
            return '<div class="repo-empty">Nothing selected yet. Choose a folder or API on the left — it will appear here.</div>';
        }
        return picks.map((pick, i) => {
            if (pick.type === 'folder') {
                const count = pick.count || 0;
                return `
                    <div class="repo-chosen folder">
                        ${this.folderIconSvg()}
                        <div class="repo-chosen-copy">
                            <strong>${this.escape(pick.name)}</strong>
                            <small>${count} API${count === 1 ? '' : 's'} · entire folder</small>
                        </div>
                        <button class="icon-btn repo-unpick" type="button" data-unpick-index="${i}" aria-label="Remove">×</button>
                    </div>
                `;
            }
            return `
                <div class="repo-chosen request">
                    ${this.methodBadge(pick.method)}
                    <div class="repo-chosen-copy">
                        <strong>${this.escape(pick.name)}</strong>
                        <small>${this.escape(pick.path || '')}</small>
                    </div>
                    <button class="icon-btn repo-unpick" type="button" data-unpick-index="${i}" aria-label="Remove">×</button>
                </div>
            `;
        }).join('');
    }

    matchEndpoint(step) {
        const endpoints = this.summary?.endpoints || [];
        if (step.endpointId) {
            const byId = endpoints.find((ep) => ep.id === step.endpointId);
            if (byId) return byId;
        }
        if (step.docsKey) {
            const byKey = endpoints.find((ep) => ep.docsKey === step.docsKey);
            if (byKey) return byKey;
        }
        if (step.name) {
            return endpoints.find((ep) => ep.name === step.name && (!step.folder || ep.folder === step.folder))
                || endpoints.find((ep) => ep.name === step.name);
        }
        return null;
    }

    endpointPicker(step, linked) {
        const endpoints = this.summary?.endpoints || [];
        const groups = new Map();
        endpoints.forEach((ep) => {
            const folder = ep.folder || 'General';
            if (!groups.has(folder)) groups.set(folder, []);
            groups.get(folder).push(ep);
        });
        const selectedId = linked?.id || step.endpointId || '';
        return `<option value="">Choose an API from any collection folder</option>${[...groups.entries()].map(([folder, eps]) => `
            <optgroup label="${this.escape(folder)}">
                ${eps.map((ep) => `<option value="${this.escape(ep.id)}" ${ep.id === selectedId ? 'selected' : ''}>${this.escape(ep.method)} ${this.escape(ep.name)}</option>`).join('')}
            </optgroup>
        `).join('')}`;
    }

    bindSidebarTree() {
        const root = document.querySelector(`#adminTree .sidebar-accordion[data-accordion-id="${this.selectedItemId}"]`);
        if (!root) return;
        this.bindTreeEditor(root, { readOnly: true, navigate: !this.collectionModalOpen });
    }

    bindCollectionModal() {
        const modal = document.getElementById('collectionModal');
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'collectionModal') this.cancelCollectionTree();
        });
        document.getElementById('closeCollectionBtn')?.addEventListener('click', () => this.cancelCollectionTree());
        modal.querySelector('[data-collection-save]')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.saveCollectionTree();
        });
        modal.querySelector('[data-collection-cancel]')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.cancelCollectionTree();
        });
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.repoPickerOpen) this.cancelCollectionTree();
        });
        this.bindTreeEditor(modal, { readOnly: false, navigate: false });
        modal.querySelector('.collection-panel')?.focus();
    }

    bindTreeEditor(root, { readOnly = false, navigate = true } = {}) {
        if (!root) return;
        if (!readOnly) {
            root.querySelector('.add-tree-folder')?.addEventListener('click', () => this.addTreeNode(null, 'folder'));
            root.querySelector('.add-tree-manual')?.addEventListener('click', () => this.addTreeNode(null, 'step'));
            root.querySelector('.add-tree-repo')?.addEventListener('click', () => this.openRepoPicker(null));
            root.querySelectorAll('[data-tree-menu]').forEach((btn) => {
                btn.addEventListener('mousedown', (e) => e.stopPropagation());
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openTreeMenu(btn, btn.dataset.treeMenu);
                });
            });
            root.querySelectorAll('[data-seq-node]').forEach((input) => {
                input.addEventListener('click', (e) => e.stopPropagation());
                input.addEventListener('mousedown', (e) => e.stopPropagation());
                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    }
                });
                input.addEventListener('change', () => this.setNodeSeq(input.dataset.seqNode, input.value));
            });
            const rename = root.querySelector('[data-rename-input]');
            if (rename) {
                rename.focus();
                rename.select();
                rename.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.finishRename();
                    }
                    if (e.key === 'Escape') {
                        this.renamingNodeId = null;
                        this.render();
                    }
                });
                rename.addEventListener('blur', () => this.finishRename());
            }
            this.bindTreeDrag(root.querySelector('.tree-editor'));
        }
        root.querySelectorAll('[data-toggle-folder]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.toggleFolder;
                const wrap = btn.closest('.tree-folder');
                this.openFolders[id] = !wrap?.classList.contains('open');
                this.syncProductForms();
                this.render();
            });
        });
        root.querySelectorAll('.tree-row').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button, input, .tree-menu')) return;
                if (this.selectedTreeNodeId === row.dataset.nodeId) return;
                this.syncProductForms();
                this.renamingNodeId = null;
                this.selectedTreeNodeId = row.dataset.nodeId;
                if (!navigate) {
                    this.render();
                    return;
                }
                this.epResponse = null;
                this.epVisualizer = null;
                this.responseCollapsed = new Set();
                this.responseHit = 0;
                this.responseTab = 'body';
                this.editorTab = 'params';
                this.flash = { ok: '', error: '' };
                if (row.dataset.kind === 'step') {
                    this.apiDetailTab = this.apiDetailTab || 'details';
                    const found = this.findNode(this.productTree(this.editingProduct()), this.selectedTreeNodeId);
                    if (found?.node?.type === 'step') {
                        const pick = this.firstTabWithValues(this.stepDraft(found.node));
                        this.editorTab = pick.tab;
                        this.scriptPane = pick.scriptPane;
                    }
                    this.toggleMobileSidebar(false);
                }
                this.render();
            });
        });
    }

    startRename(id) {
        this.syncProductForms();
        this.renamingNodeId = id;
        this.render();
    }

    finishRename() {
        if (!this.renamingNodeId) return;
        this.syncProductForms();
        this.renamingNodeId = null;
        this.render();
    }

    bindEndpointEditor() {
        if (!document.getElementById('epUrl')) return;
        document.querySelectorAll('[data-editor-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.syncEndpointEditor();
                this.editorTab = btn.dataset.editorTab;
                this.render();
            });
        });
        document.querySelectorAll('[data-script-pane]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.syncEndpointEditor();
                this.scriptPane = btn.dataset.scriptPane;
                this.editorTab = 'scripts';
                this.render();
            });
        });
        document.getElementById('epMethodBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = document.getElementById('epMethodMenu');
            const btn = document.getElementById('epMethodBtn');
            if (!menu) return;
            const open = menu.classList.contains('hidden');
            menu.classList.toggle('hidden', !open);
            btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.querySelectorAll('#epMethodMenu [data-method]').forEach((opt) => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setEditorMethod(opt.dataset.method);
            });
        });
        document.getElementById('epUrl')?.addEventListener('change', () => {
            this.syncEndpointEditor(true);
            this.render();
        });
        document.getElementById('addQuery')?.addEventListener('click', () => {
            this.syncEndpointEditor();
            const step = this.currentStep();
            if (!step) return;
            step.query = (step.query || []).concat([{ key: '', value: '', enabled: true }]);
            this.editorTab = 'params';
            this.render();
        });
        document.getElementById('addHeader')?.addEventListener('click', () => {
            this.syncEndpointEditor();
            const step = this.currentStep();
            if (!step) return;
            step.headers = (step.headers || []).concat([{ key: '', value: '', enabled: true }]);
            this.editorTab = 'headers';
            this.render();
        });
        document.getElementById('addFormData')?.addEventListener('click', () => {
            this.syncEndpointEditor();
            const step = this.currentStep();
            if (!step) return;
            step.formData = (step.formData || []).concat([{ key: '', value: '', enabled: true }]);
            this.render();
        });
        document.getElementById('addUrlencoded')?.addEventListener('click', () => {
            this.syncEndpointEditor();
            const step = this.currentStep();
            if (!step) return;
            step.urlencoded = (step.urlencoded || []).concat([{ key: '', value: '', enabled: true }]);
            this.render();
        });
        document.querySelectorAll('input[name="epBodyMode"]').forEach((input) => {
            input.addEventListener('change', () => {
                this.syncEndpointEditor();
                const step = this.currentStep();
                if (step) step.bodyMode = input.value;
                this.editorTab = 'body';
                this.render();
            });
        });
        document.getElementById('epAuthType')?.addEventListener('change', (e) => {
            this.syncEndpointEditor();
            const step = this.currentStep();
            if (step) {
                step.auth = step.auth || { type: 'none', token: '', username: '', password: '' };
                step.auth.type = e.target.value;
            }
            this.editorTab = 'auth';
            this.render();
        });
        document.getElementById('beautifyBody')?.addEventListener('click', () => {
            const ta = document.getElementById('epBody');
            if (!ta) return;
            ta.value = this.beautifyJsonc(ta.value);
            ta.dispatchEvent(new Event('input'));
            this.syncEndpointEditor();
        });
        document.getElementById('downloadBodyJson')?.addEventListener('click', () => {
            const ta = document.getElementById('epBody');
            this.saveTextFile(ta ? ta.value : '', this.jsonFilename(this.currentStep()?.name, 'request'));
        });
        document.getElementById('downloadResponseJson')?.addEventListener('click', () => {
            const text = this.epResponse ? this.prettyJson(String(this.epResponse.body ?? '')) : '';
            this.saveTextFile(text, this.jsonFilename(`${this.currentStep()?.name || 'request'}-response`, 'response'));
        });
        document.querySelectorAll('[data-response-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.responseTab = btn.dataset.responseTab;
                this.syncEndpointEditor();
                this.render();
            });
        });
        document.getElementById('copyResponse')?.addEventListener('click', () => {
            const text = this.epResponse ? this.prettyJson(String(this.epResponse.body ?? '')) : '';
            if (navigator.clipboard && text) navigator.clipboard.writeText(text);
        });
        document.querySelectorAll('.kv-remove').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                row?.parentNode?.removeChild(row);
                this.syncEndpointEditor();
            });
        });
        document.querySelectorAll('#queryTable .kv-key, #queryTable .kv-value, #queryTable .kv-enabled').forEach((input) => {
            input.addEventListener('input', () => this.syncEndpointEditor());
            input.addEventListener('change', () => this.syncEndpointEditor());
        });
        document.getElementById('epSendBtn')?.addEventListener('click', () => this.sendEndpoint());
        document.getElementById('epSaveBtn')?.addEventListener('click', () => this.saveEndpoint());
        document.getElementById('epEyeBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSendPreview();
        });
        document.getElementById('epFocusBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTesterTab();
        });
        document.getElementById('copySendPreview')?.addEventListener('click', () => {
            const text = this._sendPreviewText || document.getElementById('sendPreviewBody')?.textContent || '';
            if (navigator.clipboard && text) navigator.clipboard.writeText(text);
        });
        document.getElementById('downloadSendPreview')?.addEventListener('click', () => {
            const text = this._sendPreviewText || document.getElementById('sendPreviewBody')?.textContent || '';
            this.saveTextFile(text, this.jsonFilename(`${this.currentStep()?.name || 'request'}-preview`, 'request').replace(/\.json$/i, '.txt'));
        });
        document.getElementById('closeSendPreview')?.addEventListener('click', () => this.closeSendPreview());
        document.getElementById('sendPreview')?.addEventListener('click', (e) => {
            if (e.target.id === 'sendPreview') this.closeSendPreview();
        });
        this.bindUrlHighlight();
        this.bindCodeEditor('epBody');
        this.bindCodeEditor('epPreScript');
        this.bindCodeEditor('epTestScript');
        this.bindPmSplitter();
        this.bindResponseViewer();
        this.applyVisualizerFrame();
    }

    currentStep() {
        const found = this.findNode(this.productTree(this.editingProduct()), this.selectedTreeNodeId);
        return found?.node?.type === 'step' ? found.node : null;
    }

    pathFromUrl(url) {
        const raw = String(url || '').split('?')[0];
        try {
            if (/^https?:\/\//i.test(raw)) return new URL(raw).pathname;
        } catch (e) { /* ignore */ }
        const stripped = raw.replace(/^https?:\/\/[^/]+/i, '');
        return stripped.indexOf('/') === 0 ? stripped : (stripped ? `/${stripped}` : '');
    }

    syncEndpointEditor(fromUrl) {
        const step = this.currentStep();
        if (!step || !document.getElementById('epUrl')) return;
        step.method = (document.getElementById('epMethod')?.value || step.method || 'GET').toUpperCase();
        const typedUrl = document.getElementById('epUrl')?.value || '';
        if (fromUrl) {
            const parsed = this.parseUrlQuery(typedUrl);
            step.url = parsed.base;
            step.query = parsed.query.length ? parsed.query : (step.query || []);
        } else {
            step.url = typedUrl.split('?')[0];
            if (document.getElementById('queryTable')) step.query = this.readKv('#queryTable');
        }
        step.url = this.composeUrl(step.url, step.query || []);
        const urlInput = document.getElementById('epUrl');
        if (urlInput && urlInput.value !== step.url && !fromUrl) urlInput.value = step.url;
        const overlay = document.getElementById('epUrlHighlight');
        if (overlay && urlInput) overlay.innerHTML = this.highlightUrl(urlInput.value);
        step.path = this.pathFromUrl(step.url);
        if (document.getElementById('headerTable')) step.headers = this.readKv('#headerTable');
        if (document.getElementById('formDataTable')) step.formData = this.readKv('#formDataTable');
        if (document.getElementById('urlencodedTable')) step.urlencoded = this.readKv('#urlencodedTable');
        const mode = document.querySelector('input[name="epBodyMode"]:checked')?.value;
        if (mode) step.bodyMode = mode;
        if (document.getElementById('epBody')) step.body = document.getElementById('epBody').value;
        if (document.getElementById('epAuthType') || document.getElementById('epAuthToken') || document.getElementById('epAuthUser')) {
            step.auth = {
                type: document.getElementById('epAuthType')?.value || step.auth?.type || 'none',
                token: document.getElementById('epAuthToken')?.value ?? (step.auth?.token || ''),
                username: document.getElementById('epAuthUser')?.value ?? (step.auth?.username || ''),
                password: document.getElementById('epAuthPass')?.value ?? (step.auth?.password || ''),
            };
        }
        if (document.getElementById('epPreScript') || document.getElementById('epTestScript')) {
            const scripts = [];
            const pre = document.getElementById('epPreScript')?.value || '';
            const test = document.getElementById('epTestScript')?.value || '';
            if (pre.trim()) scripts.push({ listen: 'prerequest', exec: pre.split('\n') });
            if (test.trim()) scripts.push({ listen: 'test', exec: test.split('\n') });
            step.scripts = scripts;
        }
        this.updateResolvedUrl();
    }

    async saveEndpoint() {
        this.syncEndpointEditor();
        this.flash = { ok: 'Request saved. The playground will use this method, URL, params, headers, and body.', error: '' };
        await this.saveProducts({ preserveFlash: true });
    }

    productEnvValues() {
        const id = this.activeEnvId();
        if (!id) return {};
        if (this._envLookup && this._envLookup[id] && this._envLookup[id].values) {
            return this._envLookup[id].values;
        }
        const env = (this.files.environments || []).find((item) => item.id === id);
        return env && env.values ? env.values : {};
    }

    activeEnvId() {
        if (this.files.activeEnvironmentId) return this.files.activeEnvironmentId;
        if (this.envDrawerId) return this.envDrawerId;
        const preferred = this.editingProduct()?.environmentId;
        if (preferred) return preferred;
        const ids = Object.keys(this._envLookup || {});
        if (ids.length) return ids[0];
        return (this.files.environments || [])[0]?.id || '';
    }

    async ensureEnvLookup(force) {
        if (!force && this._envLookup) return this._envLookup;
        try {
            const response = await fetch(`collection/env-values.json?t=${Date.now()}`);
            this._envLookup = await response.json();
        } catch (e) {
            this._envLookup = this._envLookup || {};
        }
        return this._envLookup;
    }

    suggestedEnvKeys() {
        return ['host', 'user', 'pwd', 'token', 'ins_token', 'encoded_token', 'encoded_ins_token'];
    }

    renderEnvDot() {
        const dot = document.getElementById('adminEnvDot');
        if (dot) dot.classList.toggle('ready', Boolean(this.productEnvValues().host));
    }

    async openAdminEnv() {
        try {
            this.files = await this.api('files');
        } catch (e) {}
        await this.ensureEnvLookup(true);
        const shared = this.sharedEnvironment();
        this.envDrawerId = this.files.activeEnvironmentId || (shared && shared.id) || '';
        if (this.envDrawerId) {
            try {
                const pack = await this.api('download-environment', {
                    method: 'POST',
                    body: { id: this.envDrawerId },
                });
                this.applyDownloadedEnvToLookup(pack);
                if (pack.id) this.envDrawerId = pack.id;
            } catch (e) {}
        }
        this.renderAdminEnvDrawer();
        const drawer = document.getElementById('adminEnvDrawer');
        drawer?.classList.add('open');
        drawer?.setAttribute('aria-hidden', 'false');
    }

    closeAdminEnv() {
        const drawer = document.getElementById('adminEnvDrawer');
        drawer?.classList.remove('open');
        drawer?.setAttribute('aria-hidden', 'true');
    }

    applyDownloadedEnvToLookup(pack) {
        if (!pack || !pack.id || !pack.environment) return;
        const values = {};
        (pack.environment.values || []).forEach((row) => {
            if (!row || !row.key) return;
            values[row.key] = row.value == null ? '' : String(row.value);
        });
        this._envLookup = this._envLookup || {};
        this._envLookup[pack.id] = {
            name: pack.name || pack.environment.name || this.envName(pack.id),
            values,
        };
    }

    envValuesFor(id) {
        if (id && this._envLookup && this._envLookup[id] && this._envLookup[id].values) {
            return this._envLookup[id].values;
        }
        return {};
    }

    renderAdminEnvDrawer() {
        const body = document.getElementById('adminEnvBody');
        if (!body) return;
        const envs = this.files.environments || [];
        const selectedId = this.envDrawerId || '';
        const selected = envs.find((item) => item.id === selectedId);
        const values = this.envValuesFor(selectedId);
        const unique = [];
        this.suggestedEnvKeys().forEach((key) => unique.push(key));
        Object.keys(values).forEach((key) => {
            if (unique.indexOf(key) < 0) unique.push(key);
        });
        const selectedName = this.envItemName(selected)
            || (this._envLookup && this._envLookup[selectedId] && this._envLookup[selectedId].name)
            || '';
        const selectedVarCount = selected
            ? (selected.variableCount || selected.variableCount || Object.keys(values).length)
            : unique.length;
        body.innerHTML = `
            <label class="env-var-pop-field">
                <span>Environment</span>
                <select id="adminEnvSelect">
                    <option value="">Create a new environment</option>
                    ${envs.map((item) => `<option value="${this.escape(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${this.escape(this.envItemName(item))}</option>`).join('')}
                </select>
            </label>
            <p class="file-meta env-select-meta">${selectedId
                ? `${selectedVarCount} variable${selectedVarCount === 1 ? '' : 's'}${selectedId === this.files.activeEnvironmentId ? ' · saved' : ''}`
                : 'Choose a saved environment or create a new one.'}</p>
            <p class="file-meta" style="margin-bottom:12px">${selectedId ? 'These values are stored on the server and used by the playground. Rename environments on the Collections tab.' : 'Saving will create a new environment from these variables. You can rename it on the Collections tab.'}</p>
            <div id="adminEnvRows">
                ${unique.map((key) => this.adminEnvRowHtml(key, values[key] || '')).join('')}
            </div>
            <p class="form-error" id="adminEnvError"></p>
            <p class="form-ok" id="adminEnvOk"></p>
        `;
        document.getElementById('adminEnvSelect')?.addEventListener('change', async (e) => {
            this.envDrawerId = e.target.value;
            if (this.envDrawerId) {
                try {
                    const pack = await this.api('download-environment', {
                        method: 'POST',
                        body: { id: this.envDrawerId },
                    });
                    this.applyDownloadedEnvToLookup(pack);
                } catch (err) {}
            }
            this.renderAdminEnvDrawer();
        });
        body.querySelectorAll('.env-del').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (!btn.disabled) btn.closest('.env-row')?.remove();
            });
        });
    }

    adminEnvRowHtml(key, value) {
        const locked = this.suggestedEnvKeys().indexOf(key) >= 0;
        return `
            <div class="env-row">
                <input class="env-key" value="${this.escape(key)}" ${locked ? 'readonly' : ''} placeholder="variable">
                <input class="env-val" type="${/pwd|token|password|secret/i.test(key) ? 'password' : 'text'}" value="${this.escape(value)}" placeholder="${key === 'host' ? 'https://api.example.com' : ''}">
                <button class="icon-btn env-del" type="button" ${locked ? 'disabled' : ''} title="Remove">×</button>
            </div>
        `;
    }

    addAdminEnvRow() {
        const wrap = document.getElementById('adminEnvRows');
        if (!wrap) return;
        wrap.insertAdjacentHTML('beforeend', this.adminEnvRowHtml('', ''));
        const row = wrap.lastElementChild;
        row?.querySelector('.env-del')?.addEventListener('click', () => row.remove());
        row?.querySelector('.env-key')?.focus();
    }

    readAdminEnvRows() {
        const values = {};
        document.querySelectorAll('#adminEnvRows .env-row').forEach((row) => {
            const key = row.querySelector('.env-key')?.value.trim();
            if (!key) return;
            values[key] = row.querySelector('.env-val')?.value || '';
        });
        return values;
    }

    async saveAdminEnv() {
        const err = document.getElementById('adminEnvError');
        const ok = document.getElementById('adminEnvOk');
        if (err) err.textContent = '';
        if (ok) ok.textContent = '';
        const id = document.getElementById('adminEnvSelect')?.value || '';
        const selected = (this.files.environments || []).find((item) => item.id === id);
        const name = this.envItemName(selected)
            || (this._envLookup && this._envLookup[id] && this._envLookup[id].name)
            || 'Admin environment';
        const values = this.readAdminEnvRows();
        try {
            this.showLoader();
            const result = await this.api('save-environment', {
                method: 'POST',
                body: { id, name, values },
            });
            this.files = result.files || this.files;
            this.envDrawerId = result.id || id;
            await this.ensureEnvLookup(true);
            this.notifyPlayground('env');
            this.renderAdminEnvDrawer();
            this.renderEnvDot();
            this.updateResolvedUrl();
            const okEl = document.getElementById('adminEnvOk');
            if (okEl) okEl.textContent = 'Environment saved.';
        } catch (e) {
            if (err) err.textContent = e.message;
        } finally {
            this.hideLoader();
        }
    }

    onEnvVarHover(e) {
        const target = e.target;
        if (!target || !target.closest) return;
        if (target.closest('#envVarPopover')) {
            this.cancelEnvVarPopHide();
            return;
        }
        const tagged = target.closest('[data-env-var]');
        if (tagged) {
            this.openEnvVarPop(tagged, tagged.getAttribute('data-env-var'));
            return;
        }
        if (target.matches && target.matches('.kv-key, .kv-value, #epAuthToken, #epAuthUser, #epAuthPass')) {
            const match = String(target.value || '').match(/\{\{\s*([^}]+?)\s*\}\}/);
            if (match) {
                this.openEnvVarPop(target, match[1].trim());
                return;
            }
        }
        this.scheduleEnvVarPopHide();
    }

    cancelEnvVarPopHide() {
        if (this._envPopTimer) {
            clearTimeout(this._envPopTimer);
            this._envPopTimer = null;
        }
    }

    scheduleEnvVarPopHide() {
        this.cancelEnvVarPopHide();
        this._envPopTimer = setTimeout(() => this.hideEnvVarPop(), 220);
    }

    async openEnvVarPop(anchor, key) {
        const name = String(key || '').trim();
        const pop = document.getElementById('envVarPopover');
        if (!name || !pop || !anchor) return;
        this.cancelEnvVarPopHide();
        await this.ensureEnvLookup();
        const envId = this.activeEnvId();
        const envPack = envId && this._envLookup ? this._envLookup[envId] : null;
        const values = (envPack && envPack.values) || {};
        const current = values[name] != null ? String(values[name]) : '';
        const envName = envPack && envPack.name ? envPack.name : this.envName(envId);
        this._envPopKey = name;
        const input = document.getElementById('envVarPopValue');
        const save = document.getElementById('envVarPopSave');
        if (input) {
            input.value = current;
            input.type = /pwd|token|password|secret/i.test(name) ? 'password' : 'text';
            input.disabled = !envId;
        }
        if (save) save.disabled = !envId;
        pop.classList.remove('hidden');
        const box = anchor.getBoundingClientRect();
        const width = pop.offsetWidth || 320;
        let left = box.left;
        if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
        if (left < 12) left = 12;
        let top = box.bottom + 8;
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
        const popBox = pop.getBoundingClientRect();
        if (popBox.bottom > window.innerHeight - 8) {
            pop.style.top = `${Math.max(8, box.top - popBox.height - 8)}px`;
        }
    }

    hideEnvVarPop() {
        this.cancelEnvVarPopHide();
        document.getElementById('envVarPopover')?.classList.add('hidden');
        this._envPopKey = null;
    }

    async saveEnvVarPop() {
        const key = this._envPopKey;
        const envId = this.activeEnvId();
        const input = document.getElementById('envVarPopValue');
        if (!key || !envId) return;
        const value = input ? input.value : '';
        try {
            await this.api('save-env-value', {
                method: 'POST',
                body: { id: envId, key, value },
            });
            if (!this._envLookup[envId]) this._envLookup[envId] = { name: this.envName(envId), values: {} };
            if (!this._envLookup[envId].values) this._envLookup[envId].values = {};
            this._envLookup[envId].values[key] = value;
            this.files.activeEnvironmentId = envId;
            this.envDrawerId = envId;
            this.updateResolvedUrl();
            this.notifyPlayground('env');
        } catch (e) {
            if (input) input.title = e.message || 'Could not save the environment value.';
        }
    }

    resolveVars(text, values) {
        const vars = values || this.productEnvValues();
        return String(text || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
            const found = vars[key];
            return found != null && found !== '' ? String(found) : `{{${key}}}`;
        });
    }

    async loadEnvValues() {
        const id = this.activeEnvId();
        if (!id) return {};
        await this.ensureEnvLookup();
        return this.productEnvValues();
    }

    updateResolvedUrl() {
        const el = document.getElementById('epResolvedUrl');
        const step = this.currentStep();
        if (!el || !step) return;
        const resolved = this.resolveVars(this.buildEditorUrl(step));
        el.textContent = resolved && resolved !== (step.url || '') ? resolved : '';
    }

    cloneEnvValues(values) {
        const out = {};
        Object.keys(values || {}).forEach((key) => {
            out[key] = values[key];
        });
        return out;
    }

    scriptSource(scripts, listen) {
        return this.scriptText(scripts || [], listen);
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
                unset: (key) => {
                    if (key && Object.prototype.hasOwnProperty.call(env, key)) {
                        delete env[key];
                        context.dirty = true;
                    }
                },
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
            test: (name, fn) => {
                try { if (typeof fn === 'function') fn(); } catch (e) { /* ignore failing tests */ }
            },
            expect: () => ({ to: { eql() {}, equal() {}, a() {}, ok: true } }),
            sendRequest: () => {},
            cookies: { get: () => '' },
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
            context.scriptError = e.message || String(e);
        }
        return visualizer;
    }

    async persistEnvChanges(before, after) {
        const envId = this.activeEnvId();
        if (!envId) return;
        const keys = {};
        Object.keys(before || {}).forEach((key) => { keys[key] = true; });
        Object.keys(after || {}).forEach((key) => { keys[key] = true; });
        const names = Object.keys(keys);
        for (let i = 0; i < names.length; i++) {
            const key = names[i];
            const next = after[key] == null ? '' : String(after[key]);
            const prev = before[key] == null ? '' : String(before[key]);
            if (next === prev) continue;
            try {
                await this.api('save-env-value', { method: 'POST', body: { id: envId, key, value: next } });
                if (!this._envLookup) this._envLookup = {};
                if (!this._envLookup[envId]) this._envLookup[envId] = { name: this.envName(envId), values: {} };
                if (!this._envLookup[envId].values) this._envLookup[envId].values = {};
                this._envLookup[envId].values[key] = next;
            } catch (e) { /* continue remaining keys */ }
        }
        this.notifyPlayground('env');
    }

    buildResolvedPayload(step, values) {
        const url = this.resolveVars(this.buildEditorUrl(step), values);
        const headers = {};
        this.normalizeKv(step.headers).filter((row) => row.enabled && row.key).forEach((row) => {
            headers[this.resolveVars(row.key, values)] = this.resolveVars(row.value, values);
        });
        const auth = step.auth || { type: 'none' };
        if (auth.type === 'bearer' && auth.token) {
            headers.Authorization = `Bearer ${this.resolveVars(auth.token, values)}`;
        }
        if (auth.type === 'basic' && (auth.username || auth.password)) {
            headers.Authorization = `Basic ${btoa(`${this.resolveVars(auth.username || '', values)}:${this.resolveVars(auth.password || '', values)}`)}`;
        }
        const mode = step.bodyMode || (step.body ? 'raw' : 'none');
        let body = null;
        if (['GET', 'HEAD'].indexOf(String(step.method || 'GET').toUpperCase()) < 0 && mode !== 'none') {
            if (mode === 'raw') {
                body = this.resolveVars(this.stripLineComments(step.body || ''), values).trim();
                if (!body) body = null;
                if (body && !headers['Content-Type'] && !headers['content-type']) {
                    headers['Content-Type'] = 'application/json';
                }
            } else if (mode === 'form-data') {
                const rows = this.normalizeKv(step.formData).filter((row) => row.enabled && String(row.key || '').trim());
                const boundary = `----TakafulForm${Date.now()}`;
                body = rows.map((row) => {
                    const key = this.resolveVars(row.key, values);
                    const val = this.resolveVars(row.value, values);
                    return `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
                }).join('') + `--${boundary}--\r\n`;
                if (!headers['Content-Type'] && !headers['content-type']) {
                    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
                }
            } else {
                const rows = this.normalizeKv(step.urlencoded).filter((row) => row.enabled && String(row.key || '').trim());
                body = rows.map((row) => `${encodeURIComponent(this.resolveVars(row.key, values))}=${encodeURIComponent(this.resolveVars(row.value, values))}`).join('&');
                if (!headers['Content-Type'] && !headers['content-type']) {
                    headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }
            }
        }
        return { url, method: step.method || 'GET', headers, body };
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
                return JSON.stringify(this.omitEmptyJson(JSON.parse(this.stripLineComments(raw))), null, 2);
            } catch (e) { /* keep falling through */ }
        }
        if (raw.includes('=') && !trimmed.startsWith('{') && !trimmed.includes('\n')) {
            return raw.split('&').filter((part) => decodeURIComponent((part.split('=')[0] || '').replace(/\+/g, ' ')).trim()).join('&');
        }
        return raw.split(/\r?\n/).filter((line) => line.trim()).join('\n');
    }

    formatSendPreview(payload) {
        const body = this.compactPreviewBody(payload.body);
        const lines = [payload.url || '', '', 'Headers'];
        const keys = Object.keys(payload.headers || {});
        if (!keys.length) lines.push('(none)');
        keys.forEach((key) => lines.push(`${key}: ${payload.headers[key]}`));
        lines.push('', 'Body');
        lines.push(body == null || body === '' ? '(empty)' : String(body));
        return lines.join('\n');
    }

    async toggleSendPreview() {
        const wrap = document.getElementById('sendPreview');
        const body = document.getElementById('sendPreviewBody');
        const methodEl = document.getElementById('sendPreviewMethod');
        if (!wrap || !body) return;
        if (!wrap.classList.contains('hidden')) {
            this.closeSendPreview();
            return;
        }
        this.syncEndpointEditor();
        const step = this.currentStep();
        if (!step) return;
        const values = this.cloneEnvValues(await this.loadEnvValues());
        const scripts = (step.scripts && step.scripts.length) ? step.scripts : (this.matchEndpoint(step)?.scripts || []);
        this.runPmScript(this.scriptSource(scripts, 'prerequest'), { values, dirty: false });
        const payload = this.buildResolvedPayload(step, values);
        const method = String(payload.method || 'GET').toUpperCase();
        this._sendPreviewText = `${method} ${payload.url || ''}\n\n${this.formatSendPreview(payload)}`;
        if (methodEl) {
            methodEl.textContent = method;
            methodEl.className = `send-preview-method method-${method.toLowerCase()}`;
        }
        body.textContent = this.formatSendPreview(payload);
        wrap.classList.remove('hidden');
        wrap.hidden = false;
    }

    openTesterTab() {
        this.syncEndpointEditor();
        const url = new URL(window.location.href);
        url.searchParams.set('focus', 'tester');
        if (this.selectedItemId) url.searchParams.set('item', this.selectedItemId);
        if (this.selectedTreeNodeId) url.searchParams.set('node', this.selectedTreeNodeId);
        const step = this.currentStep();
        const draft = step ? this.stepDraft(step) : null;
        const name = String(draft?.label || step?.label || 'API').trim() || 'API';
        url.searchParams.set('title', name);
        window.open(url.toString(), '_blank');
    }

    syncDocumentTitle() {
        const fallback = 'Takaful Oman — API Admin';
        if (!this.testerFocus) {
            document.title = fallback;
            return;
        }
        const fromUrl = new URLSearchParams(window.location.search).get('title');
        const step = this.currentStep();
        const draft = step ? this.stepDraft(step) : null;
        const name = String(draft?.label || step?.label || fromUrl || 'API').trim() || 'API';
        document.title = `${name} — Takaful Oman`;
    }

    closeSendPreview() {
        const wrap = document.getElementById('sendPreview');
        wrap?.classList.add('hidden');
        if (wrap) wrap.hidden = true;
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
                this.pmSplit = Math.min(0.8, Math.max(0.24, ratio));
                editor.style.setProperty('--pm-split', String(this.pmSplit));
            };
            const onUp = () => {
                split.removeEventListener('pointermove', onMove);
                split.removeEventListener('pointerup', onUp);
                try { localStorage.setItem('adminPmSplit', String(this.pmSplit)); } catch (err) { /* ignore */ }
            };
            split.addEventListener('pointermove', onMove);
            split.addEventListener('pointerup', onUp);
        });
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
        const frame = document.getElementById('epVisualizer');
        if (!frame) return;
        if (this.epVisualizer && this.epVisualizer.template) {
            frame.srcdoc = this.wrapVisualizerDoc(this.renderVisualizerHtml(this.epVisualizer));
            return;
        }
        const body = String(this.epResponse?.body ?? '');
        if (this.looksLikeHtml(body)) {
            frame.srcdoc = this.wrapVisualizerDoc(body);
            return;
        }
        frame.srcdoc = this.emptyPreviewHtml();
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
        } else if (viewer) {
            const needle = String(q).trim().toLowerCase();
            let count = 0;
            viewer.querySelectorAll('tbody tr').forEach((row) => {
                const keep = !needle || row.textContent.toLowerCase().includes(needle);
                row.hidden = !keep;
                if (keep && needle) count += 1;
            });
            result = { count: needle ? count : 0 };
        }
        const n = result.count || 0;
        if (meta) meta.textContent = String(q).trim() ? `${n} match${n === 1 ? '' : 'es'}` : '';
        const showNav = n > 0 && viewer?.dataset.mode !== 'headers' && viewer?.dataset.mode !== 'cookies';
        if (prev) prev.hidden = !showNav;
        if (next) next.hidden = !showNav;
        if (showNav) this.stepResponseHit(0);
    }

    stepResponseHit(delta) {
        const root = document.getElementById('responseJsonTree')
            || document.getElementById('responseRawBody')
            || document.getElementById('responseViewer');
        this.responseHit = JsonViewer.stepHit(root, delta, this.responseHit);
    }

    async sendEndpoint() {
        this.syncEndpointEditor();
        this.closeSendPreview();
        const step = this.currentStep();
        const err = document.getElementById('epEditError');
        if (err) err.textContent = '';
        const ok = document.getElementById('epEditOk');
        if (ok) ok.textContent = '';
        const btn = document.getElementById('epSendBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Sending…';
        }
        const started = performance.now();
        try {
            const original = this.cloneEnvValues(await this.loadEnvValues());
            const values = this.cloneEnvValues(original);
            const scripts = (step.scripts && step.scripts.length) ? step.scripts : (this.matchEndpoint(step)?.scripts || []);
            const preCtx = { values, dirty: false, request: { url: this.buildEditorUrl(step), method: step.method } };
            this.runPmScript(this.scriptSource(scripts, 'prerequest'), preCtx);
            if (preCtx.dirty) await this.persistEnvChanges(original, values);
            const payload = this.buildResolvedPayload(step, values);
            if (!/^https?:\/\//i.test(payload.url) || payload.url.indexOf('{{') >= 0) {
                throw new Error('Enter a full http(s) URL, or map an environment with host so {{variables}} can be replaced.');
            }
            if (!window.StaticAPI || typeof window.StaticAPI.proxyRequest !== 'function') {
                throw new Error('Static API is not loaded');
            }
            const data = await window.StaticAPI.proxyRequest(payload);
            if (data.error && data.body == null) throw new Error(data.error);
            this.epResponse = {
                status: data.status,
                body: data.body != null ? data.body : (data.error || data),
                headers: data.headers || {},
                timeMs: data.timeMs != null ? data.timeMs : Math.round(performance.now() - started),
                size: data.size != null ? data.size : String(data.body || '').length,
            };
            const afterPre = this.cloneEnvValues(values);
            const testCtx = { values, dirty: false, response: this.epResponse };
            const visualizer = this.runPmScript(this.scriptSource(scripts, 'test'), testCtx);
            if (testCtx.dirty) await this.persistEnvChanges(afterPre, values);
            this.responseCollapsed = new Set();
            this.responseHit = 0;
            this.epVisualizer = visualizer.template ? visualizer : null;
            this.responseTab = this.epVisualizer ? 'preview' : 'body';
            this.flash.error = '';
        } catch (e) {
            this.epResponse = { status: 0, body: e.message, headers: {}, timeMs: Math.round(performance.now() - started), size: 0 };
            this.epVisualizer = null;
            this.flash.error = e.message;
            if (err) err.textContent = e.message;
        } finally {
            this.render();
        }
    }

    buildEditorUrl(step) {
        return this.composeUrl(step?.url, step?.query);
    }

    bindProducts() {
        document.querySelectorAll('#workspace [data-item-id]').forEach((btn) => {
            btn.addEventListener('click', () => this.selectCatalogItem(btn.dataset.itemId));
        });
        document.querySelectorAll('#workspace .add-catalog-product').forEach((btn) => {
            btn.addEventListener('click', () => this.addCatalogItem('product'));
        });
        document.querySelectorAll('#workspace .add-catalog-service').forEach((btn) => {
            btn.addEventListener('click', () => this.addCatalogItem('service'));
        });
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
                this.downloadProductCollection(this.productById(btn.dataset.downloadCollection));
                this.closeOverviewDownloadMenus();
            });
        });
        document.querySelectorAll('[data-download-env]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.downloadSharedEnvironment();
                this.closeOverviewDownloadMenus();
            });
        });
        document.querySelectorAll('.overview-dl-menu a.overview-dl-item').forEach((link) => {
            link.addEventListener('click', () => this.closeOverviewDownloadMenus());
        });
        document.getElementById('refreshHostStatus')?.addEventListener('click', () => this.loadHostStatus());
        if (document.getElementById('hostStatus')) this.loadHostStatus();
        document.querySelectorAll('[data-api-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.syncProductForms();
                this.stashDocsDraft();
                this.apiDetailTab = btn.dataset.apiTab;
                this.render();
            });
        });
        this.bindEndpointEditor();
        this.bindRepoPicker();
        this.bindCollectionModal();
        this.bindProductFiles();
        const editing = this.editingProduct();
        const step = this.findNode(this.productTree(editing), this.selectedTreeNodeId)?.node;
        const linked = step?.type === 'step' ? this.matchEndpoint(step) : null;
        if (step?.type === 'step' && this.apiDetailTab === 'docs') {
            this.selectedId = linked?.id || null;
            this.bindDocEditor('apiDoc', linked?.docsHtml || linked?.description || step.docsHtml || '');
            document.getElementById('previewDocsBtn')?.addEventListener('click', () => {
                this.stashDocsDraft();
                this.docPreview = !this.docPreview;
                this.render();
            });
            document.getElementById('saveDocsBtn')?.addEventListener('click', () => this.saveDocs());
        }
        if (!document.querySelector('.product-editor')) return;
        document.getElementById('openCollectionBtn')?.addEventListener('click', () => this.openCollectionModal());
        document.getElementById('kindCurrentBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeIconMenu();
            this.closeRelatedProductMenu();
            const menu = document.getElementById('kindMenu');
            const btn = document.getElementById('kindCurrentBtn');
            const open = menu?.classList.contains('hidden');
            menu?.classList.toggle('hidden', !open);
            btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.querySelectorAll('#kindMenu .kind-pick').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.applyProductKind(btn.dataset.kind);
            });
        });
        document.getElementById('relatedProductBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeIconMenu();
            this.closeKindMenu();
            const menu = document.getElementById('relatedProductMenu');
            const btn = document.getElementById('relatedProductBtn');
            const open = menu?.classList.contains('hidden');
            menu?.classList.toggle('hidden', !open);
            btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.querySelectorAll('#relatedProductMenu .kind-pick').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.applyRelatedProduct(btn.dataset.productId);
            });
        });
        document.querySelectorAll('.remove-product').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const name = document.querySelector('.p-name')?.value || 'this item';
                const ok = await this.askConfirm({
                    message: `Delete “${name}”? This cannot be undone.`,
                    okLabel: 'Delete',
                    danger: true,
                });
                if (!ok) return;
                this.syncProductForms();
                const index = (this.productsData.products || []).findIndex((item) => item.id === this.selectedItemId);
                if (index >= 0) this.productsData.products.splice(index, 1);
                this.selectedItemId = null;
                this.saveProducts();
            });
        });
        document.getElementById('iconCurrentBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeKindMenu();
            this.closeRelatedProductMenu();
            const menu = document.getElementById('iconMenu');
            const btn = document.getElementById('iconCurrentBtn');
            const open = menu?.classList.contains('hidden');
            menu?.classList.toggle('hidden', !open);
            btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.querySelectorAll('.icon-pick').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.applyProductIcon(btn.dataset.icon);
            });
        });
        document.getElementById('publishToggleBtn')?.addEventListener('click', () => {
            const input = document.querySelector('.p-published');
            const btn = document.getElementById('publishToggleBtn');
            if (!input || !btn) return;
            input.checked = !input.checked;
            const on = input.checked;
            btn.classList.toggle('is-live', on);
            btn.classList.toggle('is-hidden', !on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.title = on ? 'Published to the playground' : 'Unpublished — admin only';
            btn.innerHTML = `<b>${on ? 'Online' : 'Offline'}</b>`;
        });
        document.getElementById('saveProductsBtn')?.addEventListener('click', async () => {
            const noun = this.kindOf(this.editingProduct()) === 'service' ? 'service' : 'product';
            const ok = await this.askConfirm({
                message: `Save this ${noun}? The playground will use the name, icon, and publish setting.`,
                okLabel: 'Save',
            });
            if (ok) this.saveProducts();
        });
        if (document.getElementById('productDoc')) this.bindDocEditor('productDoc', editing?.docs || '');
    }

    bindRepoPicker() {
        const modal = document.getElementById('repoModal');
        if (!modal) return;
        document.querySelectorAll('[data-repo-toggle]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleRepoFolder(this.parseRepoPath(btn.dataset.repoToggle));
            });
        });
        document.querySelectorAll('.repo-row.folder').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.repo-pick')) return;
                const toggle = row.querySelector('[data-repo-toggle]');
                if (!toggle || toggle.disabled) return;
                this.toggleRepoFolder(this.parseRepoPath(toggle.dataset.repoToggle));
            });
        });
        document.querySelectorAll('.repo-row.folder .repo-pick').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const row = btn.closest('.repo-row');
                this.toggleRepoFolderPick(this.parseRepoPath(row?.dataset.repoPath));
            });
        });
        document.querySelectorAll('.repo-row.request').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (row.classList.contains('is-covered')) return;
                e.preventDefault();
                this.toggleRepoRequestPick(row.dataset.repoId);
            });
        });
        this.bindRepoUnpick();
        const close = () => {
            this.repoPickerOpen = false;
            this.repoPicks = [];
            this.repoOpenFolders = {};
            this.render();
        };
        document.getElementById('closeRepoBtn')?.addEventListener('click', close);
        document.getElementById('cancelRepoBtn')?.addEventListener('click', close);
        document.getElementById('addRepoPicksBtn')?.addEventListener('click', () => this.applyRepoPicks());
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'repoModal') close();
        });
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });
        this.bindRepoSplitter();
        document.querySelector('.repo-panel')?.focus();
    }

    bindRepoUnpick() {
        document.querySelectorAll('[data-unpick-index]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const index = Number(btn.dataset.unpickIndex);
                if (Number.isNaN(index)) return;
                this.repoPicks.splice(index, 1);
                this.refreshRepoSelection();
            });
        });
    }

    bindRepoSplitter() {
        const split = document.getElementById('repoSplitter');
        const body = document.getElementById('repoSplit');
        if (!split || !body) return;
        split.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            split.setPointerCapture(e.pointerId);
            const rect = body.getBoundingClientRect();
            const onMove = (ev) => {
                const ratio = (ev.clientX - rect.left) / rect.width;
                this.repoSplit = Math.min(0.72, Math.max(0.34, ratio));
                body.style.gridTemplateColumns = `${Math.round(this.repoSplit * 100)}% 8px minmax(0,1fr)`;
            };
            const onUp = () => {
                split.removeEventListener('pointermove', onMove);
                split.removeEventListener('pointerup', onUp);
                document.body.classList.remove('is-col-resizing');
            };
            document.body.classList.add('is-col-resizing');
            split.addEventListener('pointermove', onMove);
            split.addEventListener('pointerup', onUp);
        });
    }

    toggleRepoFolder(path) {
        const key = this.repoPathKey(path);
        const next = !this.repoOpenFolders[key];
        this.repoOpenFolders[key] = next;
        const folder = [...document.querySelectorAll('.repo-tree-folder')].find((el) => el.dataset.folderKey === key);
        if (!folder) return;
        folder.classList.toggle('is-open', next);
        folder.querySelectorAll(':scope > .repo-row .repo-toggle').forEach((btn) => {
            btn.classList.toggle('is-open', next);
            btn.setAttribute('aria-expanded', next ? 'true' : 'false');
        });
    }

    toggleRepoFolderPick(path) {
        if (!path?.length || this.repoFolderCovered(path)) return;
        if (this.repoFolderPicked(path)) {
            this.repoPicks = this.repoPicks.filter((pick) => !(pick.type === 'folder' && this.sameRepoPath(pick.path, path)));
        } else {
            const node = this.findRepoFolder(path);
            if (!node) return;
            this.repoPicks = this.repoPicks.filter((pick) => {
                if (pick.type === 'folder') return !this.isUnderRepoPath(pick.path, path);
                const ep = (this.summary?.endpoints || []).find((item) => item.id === pick.id);
                return ep ? !this.isUnderRepoPath(this.repoRequestCrumbs(ep), path) : true;
            });
            this.repoPicks.push({
                type: 'folder',
                path: path.slice(),
                name: node.name,
                count: this.countRepoRequests(node),
            });
        }
        this.refreshRepoSelection();
    }

    toggleRepoRequestPick(id) {
        const ep = (this.summary?.endpoints || []).find((item) => item.id === id);
        if (!ep || this.repoRequestCovered(ep)) return;
        if (this.repoRequestPicked(id)) {
            this.repoPicks = this.repoPicks.filter((pick) => !(pick.type === 'request' && pick.id === id));
        } else {
            this.repoPicks.push({
                type: 'request',
                id,
                method: ep.method,
                name: ep.name,
                path: ep.path || ep.url || '',
            });
        }
        this.refreshRepoSelection();
    }

    refreshRepoSelection() {
        const picked = document.getElementById('repoPicked');
        const count = document.getElementById('repoPickCount');
        const addBtn = document.getElementById('addRepoPicksBtn');
        const n = (this.repoPicks || []).length;
        if (picked) {
            picked.innerHTML = this.repoPickedHtml();
            this.bindRepoUnpick();
        }
        if (count) count.textContent = String(n);
        if (addBtn) {
            addBtn.disabled = !n;
            addBtn.textContent = n ? `Add ${n} selected` : 'Add selected';
        }
        document.querySelectorAll('.repo-row.folder').forEach((row) => {
            const path = this.parseRepoPath(row.dataset.repoPath);
            const on = this.repoFolderPicked(path);
            const covered = this.repoFolderCovered(path);
            row.classList.toggle('is-picked', on);
            row.classList.toggle('is-covered', covered);
            const btn = row.querySelector('.repo-pick');
            if (btn) {
                btn.disabled = covered;
                btn.classList.toggle('is-on', on);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                btn.title = covered ? 'Included in a selected folder' : (on ? 'Remove from selection' : 'Select');
            }
        });
        document.querySelectorAll('.repo-row.request').forEach((row) => {
            const id = row.dataset.repoId;
            const ep = (this.summary?.endpoints || []).find((item) => item.id === id);
            const on = this.repoRequestPicked(id);
            const covered = ep ? this.repoRequestCovered(ep) : false;
            row.classList.toggle('is-picked', on);
            row.classList.toggle('is-covered', covered);
            const btn = row.querySelector('.repo-pick');
            if (btn) {
                btn.disabled = covered;
                btn.classList.toggle('is-on', on);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
        });
    }

    openRepoPicker(parentId) {
        this.syncProductForms();
        this.repoParentId = parentId;
        this.repoPicks = [];
        this.repoOpenFolders = {};
        this.repoPickerOpen = true;
        this.render();
    }

    insertRepoNode(node, parentId) {
        const product = this.editingProduct();
        const tree = this.productTree(product);
        const targetId = parentId || (this.findNode(tree, this.selectedTreeNodeId)?.node?.type === 'folder' ? this.selectedTreeNodeId : null);
        if (targetId) {
            const found = this.findNode(tree, targetId);
            if (found?.node?.type === 'folder') {
                found.node.children = found.node.children || [];
                found.node.children.push(node);
                this.openFolders[targetId] = true;
                return;
            }
        }
        tree.push(node);
    }

    applyRepoPicks() {
        const picks = (this.repoPicks || []).slice();
        if (!picks.length) return;
        this.syncProductForms();
        const stamp = Date.now();
        const index = { i: 0 };
        let lastId = null;
        let lastType = null;
        picks.forEach((pick) => {
            if (pick.type === 'folder') {
                const node = this.findRepoFolder(pick.path);
                if (!node) return;
                const cloned = this.cloneRepoNode(node, stamp, index);
                this.insertRepoNode(cloned, this.repoParentId);
                this.walkTree([cloned], (item) => {
                    if (item.type === 'folder') this.openFolders[item.id] = true;
                });
                lastId = cloned.id;
                lastType = 'folder';
            } else {
                const ep = (this.summary?.endpoints || []).find((item) => item.id === pick.id);
                if (!ep) return;
                const node = this.stepFromEndpoint(ep, `${stamp}-${index.i++}`);
                this.insertRepoNode(node, this.repoParentId);
                lastId = node.id;
                lastType = 'step';
            }
        });
        this.repoPickerOpen = false;
        this.repoPicks = [];
        this.repoOpenFolders = {};
        if (lastId) this.selectedTreeNodeId = lastId;
        if (lastType === 'step') this.apiDetailTab = 'details';
        this.render();
    }

    stepFromEndpoint(ep, suffix) {
        return {
            type: 'step',
            id: `step-${Date.now()}${suffix != null ? `-${suffix}` : ''}`,
            label: ep.name,
            endpointId: ep.id,
            docsKey: ep.docsKey,
            name: ep.name,
            method: ep.method,
            path: ep.path,
            folder: ep.folder,
            url: ep.url,
            headers: this.normalizeKv(ep.headers),
            query: this.normalizeKv(ep.query),
            body: ep.body || '',
            scripts: ep.scripts || [],
        };
    }

    applyRepoEndpoint(nodeId, endpointId) {
        this.syncProductForms();
        const ep = (this.summary?.endpoints || []).find((item) => item.id === endpointId);
        const found = this.findNode(this.productTree(this.editingProduct()), nodeId);
        if (!found || found.node.type === 'folder') return;
        if (!ep) return;
        const next = this.stepFromEndpoint(ep);
        next.id = found.node.id;
        next.label = found.node.label || next.label;
        found.list[found.index] = next;
        this.render();
    }

    addStepFromRepo(endpointId, parentId) {
        const ep = (this.summary?.endpoints || []).find((item) => item.id === endpointId);
        if (!ep) return;
        this.syncProductForms();
        const product = this.editingProduct();
        const tree = this.productTree(product);
        const node = this.stepFromEndpoint(ep);
        const targetId = parentId || (this.findNode(tree, this.selectedTreeNodeId)?.node?.type === 'folder' ? this.selectedTreeNodeId : null);
        if (targetId) {
            const found = this.findNode(tree, targetId);
            if (found?.node?.type === 'folder') {
                found.node.children = found.node.children || [];
                found.node.children.push(node);
                this.openFolders[targetId] = true;
            } else {
                tree.push(node);
            }
        } else {
            tree.push(node);
        }
        this.repoPickerOpen = false;
        this.selectedTreeNodeId = node.id;
        this.apiDetailTab = 'details';
        this.render();
    }

    addFolderFromRepo(folderPath, parentId) {
        let path = [];
        if (Array.isArray(folderPath)) {
            path = folderPath;
        } else if (String(folderPath || '').indexOf('[') === 0) {
            try { path = JSON.parse(folderPath); } catch (e) { path = []; }
        } else {
            path = String(folderPath || '').split(/[|/]/).filter(Boolean);
        }
        if (!path.length) return;
        let node = { type: 'folder', children: this.repoTree() };
        path.forEach((name) => {
            node = (node.children || []).find((child) => child.type === 'folder' && child.name === name) || null;
        });
        if (!node) return;
        this.syncProductForms();
        const product = this.editingProduct();
        const tree = this.productTree(product);
        const stamp = Date.now();
        const index = { i: 0 };
        const cloned = this.cloneRepoNode(node, stamp, index);
        const targetId = parentId || (this.findNode(tree, this.selectedTreeNodeId)?.node?.type === 'folder' ? this.selectedTreeNodeId : null);
        if (targetId) {
            const found = this.findNode(tree, targetId);
            if (found?.node?.type === 'folder') {
                found.node.children = found.node.children || [];
                found.node.children.push(cloned);
                this.openFolders[targetId] = true;
            } else {
                tree.push(cloned);
            }
        } else {
            tree.push(cloned);
        }
        this.repoPickerOpen = false;
        this.openFolders[cloned.id] = true;
        this.selectedTreeNodeId = cloned.id;
        this.walkTree([cloned], (item) => {
            if (item.type === 'folder') this.openFolders[item.id] = true;
        });
        this.render();
    }

    cloneRepoNode(node, stamp, index) {
        if (node.type === 'folder') {
            const id = `folder-${stamp}-${index.i++}`;
            return {
                type: 'folder',
                id,
                name: node.name,
                children: (node.children || []).map((child) => this.cloneRepoNode(child, stamp, index)),
            };
        }
        return this.stepFromEndpoint(node.ep, `${stamp}-${index.i++}`);
    }

    bindTreeDrag(editor) {
        editor = editor || document.querySelector('#adminTree .sidebar-accordion.is-open .tree-editor');
        if (!editor) return;
        if (editor.classList.contains('is-readonly')) return;
        editor.querySelectorAll('.tree-row[data-node-id]').forEach((row) => {
            row.addEventListener('dragstart', (e) => {
                if (e.target.closest('input, select, button, textarea')) {
                    e.preventDefault();
                    return;
                }
                this.dragNodeId = row.dataset.nodeId;
                e.dataTransfer.setData('text/plain', row.dataset.nodeId);
                e.dataTransfer.effectAllowed = 'move';
                row.classList.add('dragging');
            });
            row.addEventListener('dragend', () => {
                row.classList.remove('dragging');
                editor.querySelectorAll('.drop-before, .drop-after, .drop-inside').forEach((el) => {
                    el.classList.remove('drop-before', 'drop-after', 'drop-inside');
                });
            });
            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const pos = this.dropPosition(row, e);
                row.classList.remove('drop-before', 'drop-after', 'drop-inside');
                row.classList.add(`drop-${pos}`);
            });
            row.addEventListener('dragleave', () => {
                row.classList.remove('drop-before', 'drop-after', 'drop-inside');
            });
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const pos = this.dropPosition(row, e);
                this.moveNodeTo(this.dragNodeId, row.dataset.nodeId, pos);
            });
        });
        editor.addEventListener('dragover', (e) => e.preventDefault());
        editor.addEventListener('drop', (e) => {
            if (e.target === editor || e.target.classList.contains('tree-drop-root')) {
                e.preventDefault();
                this.moveNodeTo(this.dragNodeId, null, 'root');
            }
        });
    }

    dropPosition(row, e) {
        const rect = row.getBoundingClientRect();
        const y = e.clientY - rect.top;
        if (row.dataset.kind === 'folder') {
            if (y < rect.height * 0.28) return 'before';
            if (y > rect.height * 0.72) return 'after';
            return 'inside';
        }
        return y < rect.height / 2 ? 'before' : 'after';
    }

    moveNodeTo(fromId, toId, pos) {
        if (!fromId) return;
        this.syncProductForms();
        const tree = this.productTree(this.editingProduct());
        const from = this.findNode(tree, fromId);
        if (!from) return;
        if (toId && fromId === toId) return;
        if (from.node.type === 'folder' && toId && this.findNode(from.node.children || [], toId)) return;
        const node = from.list.splice(from.index, 1)[0];
        if (!toId || pos === 'root') {
            tree.push(node);
        } else {
            const to = this.findNode(tree, toId);
            if (!to) {
                tree.push(node);
            } else if (pos === 'inside' && to.node.type === 'folder') {
                to.node.children = to.node.children || [];
                to.node.children.push(node);
                this.openFolders[to.node.id] = true;
            } else if (pos === 'before') {
                to.list.splice(to.index, 0, node);
            } else {
                to.list.splice(to.index + 1, 0, node);
            }
        }
        this.selectedTreeNodeId = node.id;
        this.render();
    }

    addTreeNode(parentId, type) {
        this.syncProductForms();
        const product = this.editingProduct();
        if (!product) return;
        const tree = this.productTree(product);
        const node = type === 'folder'
            ? { type: 'folder', id: `folder-${Date.now()}`, name: 'New folder', children: [] }
            : { type: 'step', id: `step-${Date.now()}`, label: 'New request', method: 'GET', url: '{{host}}/', query: [], headers: [], body: '', bodyMode: 'none', scripts: [] };
        if (parentId) {
            const found = this.findNode(tree, parentId);
            if (found?.node?.type === 'folder') {
                found.node.children = found.node.children || [];
                found.node.children.push(node);
                this.openFolders[parentId] = true;
            } else {
                tree.push(node);
            }
        } else if (this.selectedTreeNodeId) {
            const selected = this.findNode(tree, this.selectedTreeNodeId);
            if (selected?.node?.type === 'folder') {
                selected.node.children = selected.node.children || [];
                selected.node.children.push(node);
                this.openFolders[selected.node.id] = true;
            } else {
                tree.push(node);
            }
        } else {
            tree.push(node);
        }
        this.selectedTreeNodeId = node.id;
        if (type === 'folder') this.openFolders[node.id] = true;
        if (type === 'step') {
            this.apiDetailTab = 'details';
            this.editorTab = 'params';
            this.epResponse = null;
        }
        this.renamingNodeId = node.id;
        this.flash = { ok: '', error: '' };
        this.render();
    }

    moveTreeNode(id, dir) {
        this.syncProductForms();
        const product = this.editingProduct();
        const found = this.findNode(this.productTree(product), id);
        if (!found) return;
        const next = found.index + dir;
        if (next < 0 || next >= found.list.length) return;
        const copy = found.list.splice(found.index, 1)[0];
        found.list.splice(next, 0, copy);
        this.render();
    }

    indentTreeNode(id) {
        this.syncProductForms();
        const found = this.findNode(this.productTree(this.editingProduct()), id);
        if (!found || found.index === 0) return;
        const prev = found.list[found.index - 1];
        if (prev.type !== 'folder') return;
        const node = found.list.splice(found.index, 1)[0];
        prev.children = prev.children || [];
        prev.children.push(node);
        this.openFolders[prev.id] = true;
        this.render();
    }

    outdentTreeNode(id) {
        this.syncProductForms();
        const found = this.findNode(this.productTree(this.editingProduct()), id);
        if (!found || !found.parent || !found.parentList) return;
        const node = found.list.splice(found.index, 1)[0];
        found.parentList.splice(found.parentIndex + 1, 0, node);
        this.render();
    }

    removeTreeNode(id) {
        this.syncProductForms();
        const product = this.editingProduct();
        const found = this.findNode(this.productTree(product), id);
        if (!found) return;
        found.list.splice(found.index, 1);
        if (this.selectedTreeNodeId === id) this.selectedTreeNodeId = null;
        this.render();
    }

    addCatalogItem(kind) {
        if (this.view === 'products') this.syncProductForms();
        this.view = 'products';
        const id = `${kind}-${Date.now()}`;
        const item = {
            id,
            name: kind === 'service' ? 'New service' : 'New product',
            kind,
            keywords: [],
            folder: '',
            environmentId: '',
            docs: '',
            published: false,
            files: [],
            tree: [],
        };
        if (kind === 'service') {
            item.productId = this.itemsOf('product')[0]?.id || '';
        }
        this.productsData.products.push(item);
        this.selectedItemId = id;
        this.render();
    }

    syncTreeFromDom() {
        const product = this.editingProduct();
        if (!product) return;
        const tree = this.productTree(product);
        document.querySelectorAll('.tree-row[data-node-id]').forEach((row) => {
            const found = this.findNode(tree, row.dataset.nodeId);
            if (!found) return;
            const name = row.querySelector('.tree-name')?.value.trim() || '';
            if (found.node.type === 'folder') {
                found.node.name = name || found.node.name || 'Folder';
                return;
            }
            if (name) found.node.label = name;
        });
        const detail = document.querySelector('.detail-endpoint');
        if (detail?.value && this.selectedTreeNodeId) {
            const found = this.findNode(tree, this.selectedTreeNodeId);
            const ep = (this.summary?.endpoints || []).find((item) => item.id === detail.value);
            if (found?.node && found.node.type !== 'folder' && ep) {
                this.assignEndpoint(found.node, ep);
                if (!found.node.label) found.node.label = ep.name;
            }
        }
    }

    assignEndpoint(node, ep) {
        if (!node || !ep) return;
        node.endpointId = ep.id;
        node.docsKey = ep.docsKey;
        node.name = ep.name;
        node.method = ep.method;
        node.path = ep.path;
        node.folder = ep.folder;
        node.url = ep.url;
        node.headers = ep.headers || [];
        node.query = ep.query || [];
        node.body = ep.body || '';
        node.scripts = ep.scripts || [];
    }

    methodBadge(method) {
        const value = String(method || '').toUpperCase();
        if (!value) return '<span class="method unknown">—</span>';
        return `<span class="method ${this.escape(value.toLowerCase())}">${this.escape(value)}</span>`;
    }

    syncProductForms() {
        const el = document.querySelector('.product-editor');
        if (!el) return;
        this.syncTreeFromDom();
        this.syncEndpointEditor();
        const currentId = el.dataset.id;
        const index = (this.productsData.products || []).findIndex((item) => item.id === currentId);
        if (index < 0) return;
        const kind = el.querySelector('.p-kind')?.value || 'product';
        const nextId = (el.querySelector('.p-id')?.value || '').trim() || currentId;
        const keywords = (el.querySelector('.p-keywords')?.value || '').split(',').map((item) => item.trim()).filter(Boolean);
        const current = this.productsData.products[index];
        const patch = {
            ...current,
            id: nextId,
            name: el.querySelector('.p-name').value,
            kind,
            keywords,
            folder: el.querySelector('.p-folder')?.value || current.folder || '',
            environmentId: el.querySelector('.p-env')?.value || current.environmentId || '',
            docs: document.getElementById('productDoc')?.innerHTML || current.docs || '',
            published: el.querySelector('.p-published') ? Boolean(el.querySelector('.p-published').checked) : current.published !== false,
            icon: el.querySelector('.p-icon')?.value || current.icon || '',
            files: current.files || [],
            tree: this.productTree(current),
        };
        delete patch.flow;
        if (kind === 'service') {
            patch.productId = el.querySelector('.p-product')?.value || current.productId || '';
        } else {
            delete patch.productId;
        }
        this.productsData.products[index] = patch;
        if (this.selectedItemId === currentId) this.selectedItemId = nextId;
    }
    async saveProducts(opts = {}) {
        const err = document.getElementById('productError');
        if (err) err.textContent = '';
        this.syncProductForms();
        try {
            this.showLoader();
            const result = await this.api('save-products', {
                method: 'POST',
                body: { products: this.productsData.products, maps: this.productsData.maps || {} },
            });
            this.productsData.products = this.flattenCatalog(result.products);
            this.productsData.maps = result.maps;
            this.productsData.folderEnvironments = result.folderEnvironments || {};
            if (this.selectedItemId && !this.productById(this.selectedItemId) && result.products?.length) {
                this.selectedItemId = result.products[result.products.length - 1].id;
            }
            const saved = this.editingProduct();
            if (saved) this._treeSnapshots[saved.id] = this.cloneTree(this.productTree(saved));
            if (!opts.preserveFlash) this.flash.ok = '';
            this.notifyPlayground('products');
            this.render();
        } catch (e) {
            this.flash.ok = '';
            this.flash.error = e.message;
            if (err) err.textContent = e.message;
        } finally {
            this.hideLoader();
        }
    }

    apisHtml() {
        const product = this.productById(this.selectedDocProductId);
        const steps = this.flatSteps(product);
        if (this.selectedDocNodeId && !steps.some((step) => step.id === this.selectedDocNodeId)) {
            this.selectedDocNodeId = null;
        }
        if (!this.selectedDocNodeId && steps.length) this.selectedDocNodeId = steps[0].id;
        const step = steps.find((item) => item.id === this.selectedDocNodeId) || null;
        const linked = step ? this.matchEndpoint(step) : null;
        if (linked) this.selectedId = linked.id;
        const canShow = Boolean(step);
        return `
            <section class="hero">
                <div>
                    <h1>API Documentation</h1>
                    <p>Open a product or service, then pick an API from the tree. Documentation is whatever the admin saves for that endpoint.</p>
                </div>
            </section>
            ${this.catalogSections(this.selectedDocProductId, 'data-doc-product', false)}
            ${canShow ? this.docsForm(linked || {
                name: step.label,
                method: step.method || 'GET',
                crumbs: [],
                path: step.path || step.url || '',
                url: step.url || '',
                query: step.query || [],
                headers: step.headers || [],
                body: step.body || '',
                scripts: step.scripts || [],
                docsHtml: step.docsHtml || '',
                description: step.docsHtml || '',
            }, step) : `<div class="empty-state">Choose a product or service, then select an API in the tree to view its documentation.</div>`}
        `;
    }

    productById(id) {
        return this.allProducts().find((p) => p.id === id);
    }

    docsForm(ep, step) {
        const draft = step ? this.stepDraft(step) : null;
        const method = String(draft?.method || ep?.method || 'GET').toUpperCase();
        const url = draft?.url || ep?.url || ep?.path || '';
        return `
            <article class="product-editor docs-editor-card">
                <h3>${this.escape(step?.label || ep.name)}</h3>
                <div class="docs-endpoint-head">
                    <span class="pill-${method.toLowerCase()}">${this.escape(method)}</span>
                    <code>${this.escape(url)}</code>
                </div>
                <p class="file-meta">Edit and save documentation for this API. Method and endpoint above update from the request; the body below is saved separately.</p>
                ${this.docEditorMarkup('apiDoc', true)}
                <div class="toolbar">
                    <button class="ghost-btn" id="previewDocsBtn" type="button">${this.docPreview ? 'Edit' : 'Preview'}</button>
                    <button class="primary-btn" id="saveDocsBtn" type="button">Save documentation</button>
                </div>
                <p class="form-error" id="epError"></p>
                <p class="form-ok" id="epOk"></p>
            </article>
        `;
    }

    docEditorMarkup(id, withPreview = false) {
        const icon = {
            undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H5v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11a7 7 0 1 0 2-4.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7h4v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 11a7 7 0 1 1-2-4.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            bold: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7V5Zm0 7h7a3.5 3.5 0 0 1 0 7H7v-7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
            italic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5h8M6 19h8M14.5 5 9.5 19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            underline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v7a5 5 0 0 0 10 0V5M6 19h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            strike: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M8.5 8.2C9.2 6.8 10.6 6 12.2 6c2.1 0 3.5 1.1 3.5 2.7 0 1.1-.6 1.9-1.8 2.4M8.2 14.3c.5 1.7 2 2.7 4 2.7 2.3 0 4-1.3 4-3.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            sub: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h6.5L9.2 14H6.8L6 6Zm9.2 7.2c.5-.5 1.1-.8 1.8-.8 1.1 0 1.8.6 1.8 1.5 0 .7-.4 1.2-1.4 1.8l-1.5.9V18h4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            sup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h6.5L9.2 16H6.8L6 8Zm9.2-1.5c.5-.5 1.1-.8 1.8-.8 1.1 0 1.8.6 1.8 1.5 0 .7-.4 1.2-1.4 1.8l-1.5.9V12h4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h10M4 14h16M4 18h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            center: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 10h10M4 14h16M6 18h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M10 10h10M4 14h16M8 18h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            justify: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h16M4 18h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            ul: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="1.4" fill="currentColor"/><circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="6" cy="17" r="1.4" fill="currentColor"/><path d="M10 7h10M10 12h10M10 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            ol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7h10M10 12h10M10 17h10M5.2 5.8V9M4.5 9H6M4.8 13.2c.5-.5 1.4-.4 1.7.2.2.4 0 .9-.5 1.2L4.5 16H7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            indent: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 18h16M12 10h8M12 14h8M4 9.5l3.5 2.5L4 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            outdent: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 18h16M12 10h8M12 14h8M7.5 9.5 4 12l3.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7.3l2-2a4 4 0 0 0-5.7-5.6l-1.1 1.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14 10a4 4 0 0 0-5.7-.3l-2 2a4 4 0 0 0 5.7 5.6l1.1-1.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            unlink: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 14.5a3.5 3.5 0 0 0 5 .2l1.3-1.3M14.5 9.5a3.5 3.5 0 0 0-5-.2L8.2 10.6M5 5l14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><path d="m8 16 3-3 2 2 3-3 3 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            table: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M4 15h16M10 5v14M15 5v14" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
            line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            script: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            callout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H12l-4 3v-3H7.5A2.5 2.5 0 0 1 5 13.5v-7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9h6M9 12h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 8-4 4 4 4M15 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h12l-1.2 13.2A2 2 0 0 1 15.8 21H9.2a2 2 0 0 1-2-1.8L6 6m2.5 0V4.8A1.8 1.8 0 0 1 10.3 3h3.4A1.8 1.8 0 0 1 15.5 4.8V6M4 6h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        };
        return `
            <div class="doc-toolbar" data-editor="${id}">
                <div class="doc-tool-group" data-group="history">
                    <span class="doc-tool-label">History</span>
                    <div class="doc-tool-row">
                        <button type="button" class="doc-tool-btn" data-cmd="undo" title="Undo">${icon.undo}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="redo" title="Redo">${icon.redo}</button>
                    </div>
                </div>
                <div class="doc-tool-group" data-group="style">
                    <span class="doc-tool-label">Style</span>
                    <div class="doc-tool-row">
                        <select class="doc-tool-select" data-block-format title="Paragraph style">
                            <option value="p">Normal</option>
                            <option value="h2">Heading</option>
                            <option value="h3">Subheading</option>
                            <option value="h4">Title</option>
                            <option value="blockquote">Quote</option>
                        </select>
                        <select class="doc-tool-select is-size" data-font-size title="Font size">
                            <option value="">Size</option>
                            <option value="2">Small</option>
                            <option value="3">Normal</option>
                            <option value="4">Medium</option>
                            <option value="5">Large</option>
                            <option value="6">X-Large</option>
                        </select>
                    </div>
                </div>
                <div class="doc-tool-group" data-group="format">
                    <span class="doc-tool-label">Format</span>
                    <div class="doc-tool-row">
                        <button type="button" class="doc-tool-btn" data-cmd="bold" title="Bold">${icon.bold}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="italic" title="Italic">${icon.italic}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="underline" title="Underline">${icon.underline}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="strikeThrough" title="Strikethrough">${icon.strike}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="subscript" title="Subscript">${icon.sub}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="superscript" title="Superscript">${icon.sup}</button>
                    </div>
                </div>
                <div class="doc-tool-group" data-group="color">
                    <span class="doc-tool-label">Color</span>
                    <div class="doc-tool-row">
                        <label class="doc-color-btn" title="Text color">
                            <span class="doc-color-label">A</span>
                            <input type="color" data-doc-color="foreColor" value="#1f2937">
                        </label>
                        <label class="doc-color-btn is-highlight" title="Highlight">
                            <span class="doc-color-label">A</span>
                            <input type="color" data-doc-color="hiliteColor" value="#fff59d">
                        </label>
                    </div>
                </div>
                <div class="doc-tool-group" data-group="align">
                    <span class="doc-tool-label">Align</span>
                    <div class="doc-tool-row">
                        <button type="button" class="doc-tool-btn" data-cmd="justifyLeft" title="Align left">${icon.left}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="justifyCenter" title="Align center">${icon.center}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="justifyRight" title="Align right">${icon.right}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="justifyFull" title="Justify">${icon.justify}</button>
                    </div>
                </div>
                <div class="doc-tool-group" data-group="lists">
                    <span class="doc-tool-label">Lists</span>
                    <div class="doc-tool-row">
                        <button type="button" class="doc-tool-btn" data-cmd="insertUnorderedList" title="Bulleted list">${icon.ul}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="insertOrderedList" title="Numbered list">${icon.ol}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="outdent" title="Decrease indent">${icon.outdent}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="indent" title="Increase indent">${icon.indent}</button>
                    </div>
                </div>
                <div class="doc-tool-group" data-group="insert">
                    <span class="doc-tool-label">Insert</span>
                    <div class="doc-tool-row">
                        <button type="button" class="doc-tool-btn" data-cmd="createLink" title="Insert link">${icon.link}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="unlink" title="Remove link">${icon.unlink}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="image" title="Insert image">${icon.image}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="table" title="Insert table">${icon.table}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="insertHorizontalRule" title="Horizontal line">${icon.line}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="script" title="Insert script">${icon.script}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="callout" title="Insert callout">${icon.callout}</button>
                        <button type="button" class="doc-tool-btn" data-cmd="inlineCode" title="Inline code">${icon.code}</button>
                    </div>
                </div>
                <div class="doc-tool-group" data-group="clean">
                    <span class="doc-tool-label">Clean</span>
                    <div class="doc-tool-row">
                        <button type="button" class="doc-tool-btn" data-cmd="removeFormat" title="Clear formatting">${icon.clear}</button>
                    </div>
                </div>
            </div>
            <div class="table-panel hidden" id="${id}-table">
                <div class="table-panel-grid">
                    <label>Rows
                        <input id="${id}-table-rows" type="number" min="1" max="20" value="3">
                    </label>
                    <label>Columns
                        <input id="${id}-table-cols" type="number" min="1" max="10" value="3">
                    </label>
                    <label class="table-header-toggle">
                        <input id="${id}-table-header" type="checkbox" checked>
                        <span>Header row</span>
                    </label>
                </div>
                <div class="toolbar" style="margin:0">
                    <button class="primary-btn small" type="button" data-insert-table="${id}">Insert table</button>
                    <button class="ghost-btn small" type="button" data-cancel-table="${id}">Cancel</button>
                </div>
            </div>
            <div class="script-panel hidden" id="${id}-script">
                <div class="script-panel-grid">
                    <label>Language
                        <select id="${id}-script-lang">
                            <option value="JavaScript">JavaScript</option>
                            <option value="JSON">JSON</option>
                            <option value="cURL">cURL</option>
                            <option value="PHP">PHP</option>
                        </select>
                    </label>
                    <label>Inherit from request
                        <select id="${id}-script-source">
                            <option value="">Blank / custom</option>
                            <option value="prerequest">Pre-request script</option>
                            <option value="test">Post-response tests</option>
                            <option value="body">Request body</option>
                        </select>
                    </label>
                    <button class="ghost-btn small" type="button" data-load-script="${id}">Load from request</button>
                </div>
                <label>Script
                    <textarea id="${id}-script-body" class="script-panel-body" placeholder="Paste or load a script, then edit before inserting" spellcheck="false"></textarea>
                </label>
                <div class="docs-script-preview-wrap">
                    <div class="docs-script-card">
                        <div class="docs-script-head">
                            <span class="docs-script-lang" id="${id}-script-preview-lang">JavaScript</span>
                        </div>
                        <pre class="docs-script docs-script-dark"><code class="docs-script-code" id="${id}-script-preview">&nbsp;</code></pre>
                    </div>
                </div>
                <div class="toolbar" style="margin:0">
                    <button class="primary-btn small" type="button" data-insert-script="${id}">Insert script</button>
                    <button class="ghost-btn small" type="button" data-cancel-script="${id}">Cancel</button>
                </div>
            </div>
            <div class="doc-editor ${withPreview && this.docPreview ? 'hidden' : ''}" id="${id}" contenteditable="true"></div>
            ${withPreview ? `<div class="doc-preview docs ${this.docPreview ? '' : 'hidden'}" id="${id}-preview"></div>` : ''}
            <input type="file" id="${id}-image" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
        `;
    }

    bindDocEditor(id, initial) {
        const editor = document.getElementById(id);
        if (!editor) return;
        editor.innerHTML = this.toEditorHtml(initial);
        try {
            document.execCommand('styleWithCSS', false, true);
        } catch (e) { /* ignore */ }
        const toolbar = document.querySelector(`.doc-toolbar[data-editor="${id}"]`);
        toolbar?.querySelectorAll('[data-cmd]').forEach((btn) => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.saveDocSelection(id);
            });
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.runDocCommand(id, btn.dataset.cmd);
            });
        });
        toolbar?.querySelector('[data-block-format]')?.addEventListener('mousedown', () => this.saveDocSelection(id));
        toolbar?.querySelector('[data-block-format]')?.addEventListener('change', (e) => {
            const tag = e.target.value || 'p';
            this.restoreDocSelection(id);
            document.execCommand('formatBlock', false, tag);
        });
        toolbar?.querySelector('[data-font-size]')?.addEventListener('mousedown', () => this.saveDocSelection(id));
        toolbar?.querySelector('[data-font-size]')?.addEventListener('change', (e) => {
            const size = e.target.value;
            if (!size) return;
            this.restoreDocSelection(id);
            document.execCommand('fontSize', false, size);
            e.target.value = '';
        });
        toolbar?.querySelectorAll('[data-doc-color]').forEach((input) => {
            input.addEventListener('mousedown', () => this.saveDocSelection(id));
            input.addEventListener('input', () => {
                this.restoreDocSelection(id);
                const cmd = input.dataset.docColor;
                document.execCommand(cmd === 'hiliteColor' ? 'hiliteColor' : 'foreColor', false, input.value);
            });
        });
        document.querySelector(`[data-insert-script="${id}"]`)?.addEventListener('click', () => this.insertScript(id));
        document.querySelector(`[data-cancel-script="${id}"]`)?.addEventListener('click', () => {
            document.getElementById(`${id}-script`)?.classList.add('hidden');
        });
        document.querySelector(`[data-load-script="${id}"]`)?.addEventListener('click', () => this.loadScriptFromRequest(id));
        document.getElementById(`${id}-script-lang`)?.addEventListener('change', () => {
            this.normalizeScriptPanelBody(id);
            this.paintScriptPreview(id);
            this.fitScriptTextarea(id);
        });
        document.getElementById(`${id}-script-body`)?.addEventListener('input', () => {
            this.paintScriptPreview(id);
            this.fitScriptTextarea(id);
        });
        document.getElementById(`${id}-script-source`)?.addEventListener('change', () => {
            const source = document.getElementById(`${id}-script-source`)?.value || '';
            if (source) this.loadScriptFromRequest(id);
        });
        document.querySelector(`[data-insert-table="${id}"]`)?.addEventListener('click', () => this.insertDocTable(id));
        document.querySelector(`[data-cancel-table="${id}"]`)?.addEventListener('click', () => {
            document.getElementById(`${id}-table`)?.classList.add('hidden');
        });
        document.getElementById(`${id}-image`)?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) this.insertDocImage(id, file);
            e.target.value = '';
        });
        this.paintScriptPreview(id);
        this.fitScriptTextarea(id);
        this.enhanceDocScripts(editor, { editable: true });
        this.enhanceDocTables(editor);
        this.ensureDocTrail(editor);
        if (this.docPreview) {
            const preview = document.getElementById(`${id}-preview`);
            if (preview) {
                preview.innerHTML = editor.innerHTML;
                this.enhanceDocScripts(preview, { editable: false });
                preview.querySelectorAll('.docs-table-shell').forEach((shell) => {
                    const table = shell.querySelector('table.docs-table');
                    if (table && shell.parentNode) {
                        shell.replaceWith(table);
                    }
                });
            }
        }
    }

    ensureDocTrail(editor) {
        if (!editor) return;
        const last = editor.lastElementChild;
        const isEmptyPara = last
            && last.tagName === 'P'
            && !String(last.textContent || '').trim()
            && !last.querySelector('img, table, .docs-script-wrap, .docs-table-shell');
        if (!isEmptyPara) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            editor.appendChild(p);
        }
    }

    placeCaretInTrail(editor) {
        if (!editor) return;
        this.ensureDocTrail(editor);
        const last = editor.lastElementChild;
        if (!last) return;
        const range = document.createRange();
        range.selectNodeContents(last);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        editor.focus();
    }

    enhanceDocScripts(root, options = {}) {
        if (!root) return;
        const editable = Boolean(options.editable);
        root.querySelectorAll('pre.docs-script, pre').forEach((pre) => {
            if (pre.closest('.docs-script-preview-wrap')) return;
            if (!pre.classList.contains('docs-script') && !pre.querySelector('code') && !pre.dataset.lang) return;
            pre.classList.add('docs-script', 'docs-script-dark');

            let code = pre.querySelector('code');
            if (!code) {
                code = document.createElement('code');
                code.className = 'docs-script-code';
                code.textContent = pre.textContent || '';
                pre.textContent = '';
                pre.appendChild(code);
            }
            code.classList.remove('code-highlight');
            code.classList.add('docs-script-code');

            let wrap = pre.closest('.docs-script-wrap');
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.className = 'docs-script-wrap';
                pre.parentNode.insertBefore(wrap, pre);
                wrap.appendChild(pre);
            }
            wrap.setAttribute('contenteditable', 'false');

            let card = pre.closest('.docs-script-card');
            if (!card) {
                card = document.createElement('div');
                card.className = 'docs-script-card';
                wrap.insertBefore(card, pre);
                card.appendChild(pre);
            }

            let head = card.querySelector('.docs-script-head');
            if (!head) {
                head = document.createElement('div');
                head.className = 'docs-script-head';
                card.insertBefore(head, card.firstChild);
            }

            // Keep a single language label inside the head.
            const strayLangs = [...wrap.querySelectorAll('.docs-script-lang')].filter((el) => !head.contains(el));
            strayLangs.forEach((el) => el.remove());
            let langEl = head.querySelector('.docs-script-lang');
            const lang = (pre.dataset.lang || langEl?.textContent || 'Script').trim() || 'Script';
            pre.dataset.lang = lang;
            if (!langEl) {
                langEl = document.createElement('span');
                langEl.className = 'docs-script-lang';
                head.insertBefore(langEl, head.firstChild);
            }
            [...head.querySelectorAll('.docs-script-lang')].forEach((el, index) => {
                if (index === 0) el.textContent = lang;
                else el.remove();
            });
            card.classList.toggle('is-json', String(lang).toLowerCase() === 'json');
            pre.classList.toggle('is-json', String(lang).toLowerCase() === 'json');

            if (!code.querySelector('.js-keyword, .js-string, .json-key, .json-string')) {
                code.innerHTML = this.highlightDocCode(code.textContent || '', lang);
            }

            let copyBtn = head.querySelector('.copy-script');
            [...wrap.querySelectorAll('.copy-script')].forEach((btn) => {
                if (!head.contains(btn)) btn.remove();
            });
            if (!copyBtn) {
                copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.className = 'copy-script';
                copyBtn.textContent = 'Copy';
                head.appendChild(copyBtn);
            }
            if (!copyBtn.dataset.bound) {
                copyBtn.dataset.bound = '1';
                copyBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        await navigator.clipboard.writeText(pre.innerText);
                        copyBtn.textContent = 'Copied';
                        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
                    } catch {
                        copyBtn.textContent = 'Copy failed';
                        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
                    }
                });
            }

            if (editable) {
                code.contentEditable = 'true';
                code.spellcheck = false;
                code.classList.add('is-editable');
                if (!code.dataset.editBound) {
                    code.dataset.editBound = '1';
                    code.addEventListener('blur', () => {
                        const currentLang = pre.dataset.lang || 'JavaScript';
                        const raw = code.textContent || '';
                        const formatted = this.formatDocScriptBody(raw, currentLang);
                        code.innerHTML = this.highlightDocCode(formatted, currentLang);
                    });
                    code.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            this.placeCaretInTrail(root);
                            return;
                        }
                        e.stopPropagation();
                    });
                }
            } else {
                code.contentEditable = 'false';
                code.classList.remove('is-editable');
            }

            pre.style.height = 'auto';
            pre.style.maxHeight = 'none';
        });
        this.ensureDocTrail(root);
    }

    enhanceDocTables(editor) {
        if (!editor) return;
        editor.querySelectorAll('table.docs-table').forEach((table) => {
            if (table.closest('.doc-preview')) return;
            let shell = table.closest('.docs-table-shell');
            if (!shell) {
                shell = document.createElement('div');
                shell.className = 'docs-table-shell';
                shell.setAttribute('contenteditable', 'false');
                table.parentNode.insertBefore(shell, table);
                shell.appendChild(table);
            }
            table.setAttribute('contenteditable', 'true');
            this.refreshDocTableUi(shell);
            if (!shell.dataset.bound) {
                shell.dataset.bound = '1';
                shell.addEventListener('click', (e) => {
                    const addRow = e.target.closest('[data-table-add-row]');
                    const addCol = e.target.closest('[data-table-add-col]');
                    const pickRow = e.target.closest('[data-table-pick-row]');
                    const pickCol = e.target.closest('[data-table-pick-col]');
                    const action = e.target.closest('[data-table-action]');
                    if (addRow) {
                        e.preventDefault();
                        this.docTableInsertRow(shell, Number(addRow.dataset.tableAddRow));
                        return;
                    }
                    if (addCol) {
                        e.preventDefault();
                        this.docTableInsertCol(shell, Number(addCol.dataset.tableAddCol));
                        return;
                    }
                    if (pickRow) {
                        e.preventDefault();
                        this.docTableSelect(shell, 'row', Number(pickRow.dataset.tablePickRow));
                        return;
                    }
                    if (pickCol) {
                        e.preventDefault();
                        this.docTableSelect(shell, 'col', Number(pickCol.dataset.tablePickCol));
                        return;
                    }
                    if (action) {
                        e.preventDefault();
                        this.docTableAction(shell, action.dataset.tableAction);
                    }
                });
            }
        });
        this.ensureDocTrail(editor);
    }

    refreshDocTableUi(shell) {
        const table = shell.querySelector('table.docs-table');
        if (!table) return;
        const rows = [...table.rows];
        const colCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
        shell.querySelectorAll('.docs-table-row-rail, .docs-table-col-rail, .docs-table-actions').forEach((el) => el.remove());

        const colRail = document.createElement('div');
        colRail.className = 'docs-table-col-rail';
        for (let c = 0; c <= colCount; c += 1) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'docs-table-plus';
            btn.dataset.tableAddCol = String(c);
            btn.title = c === 0 ? 'Add column at start' : (c === colCount ? 'Add column at end' : `Add column after ${c}`);
            btn.textContent = '+';
            colRail.appendChild(btn);
            if (c < colCount) {
                const pick = document.createElement('button');
                pick.type = 'button';
                pick.className = 'docs-table-pick';
                pick.dataset.tablePickCol = String(c);
                pick.title = `Select column ${c + 1}`;
                pick.textContent = String(c + 1);
                if (shell.dataset.selType === 'col' && Number(shell.dataset.selIndex) === c) pick.classList.add('is-active');
                colRail.appendChild(pick);
            }
        }
        shell.insertBefore(colRail, table);

        const rowRail = document.createElement('div');
        rowRail.className = 'docs-table-row-rail';
        for (let r = 0; r <= rows.length; r += 1) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'docs-table-plus';
            btn.dataset.tableAddRow = String(r);
            btn.title = r === 0 ? 'Add row at start' : (r === rows.length ? 'Add row at end' : `Add row after ${r}`);
            btn.textContent = '+';
            rowRail.appendChild(btn);
            if (r < rows.length) {
                const pick = document.createElement('button');
                pick.type = 'button';
                pick.className = 'docs-table-pick';
                pick.dataset.tablePickRow = String(r);
                pick.title = `Select row ${r + 1}`;
                pick.textContent = String(r + 1);
                if (shell.dataset.selType === 'row' && Number(shell.dataset.selIndex) === r) pick.classList.add('is-active');
                rowRail.appendChild(pick);
            }
        }
        shell.appendChild(rowRail);

        const actions = document.createElement('div');
        actions.className = 'docs-table-actions';
        actions.innerHTML = `
            <button type="button" class="ghost-btn small" data-table-action="clear" ${shell.dataset.selType ? '' : 'disabled'}>Clear values</button>
            <button type="button" class="danger-btn small" data-table-action="delete" ${shell.dataset.selType ? '' : 'disabled'}>Delete ${shell.dataset.selType === 'col' ? 'column' : (shell.dataset.selType === 'row' ? 'row' : 'selection')}</button>
        `;
        shell.appendChild(actions);
        this.docTablePaintSelection(shell);
    }

    docTableSelect(shell, type, index) {
        if (shell.dataset.selType === type && Number(shell.dataset.selIndex) === index) {
            delete shell.dataset.selType;
            delete shell.dataset.selIndex;
        } else {
            shell.dataset.selType = type;
            shell.dataset.selIndex = String(index);
        }
        this.refreshDocTableUi(shell);
    }

    docTablePaintSelection(shell) {
        const table = shell.querySelector('table.docs-table');
        if (!table) return;
        [...table.querySelectorAll('td, th')].forEach((cell) => cell.classList.remove('is-selected'));
        const type = shell.dataset.selType;
        const index = Number(shell.dataset.selIndex);
        if (type === 'row' && table.rows[index]) {
            [...table.rows[index].cells].forEach((cell) => cell.classList.add('is-selected'));
        }
        if (type === 'col') {
            [...table.rows].forEach((row) => {
                if (row.cells[index]) row.cells[index].classList.add('is-selected');
            });
        }
    }

    docTableInsertRow(shell, at) {
        const table = shell.querySelector('table.docs-table');
        if (!table) return;
        const cols = Math.max(1, ...[...table.rows].map((row) => row.cells.length));
        const row = table.insertRow(Math.max(0, Math.min(at, table.rows.length)));
        for (let c = 0; c < cols; c += 1) {
            const cell = row.insertCell();
            cell.innerHTML = '&nbsp;';
        }
        delete shell.dataset.selType;
        delete shell.dataset.selIndex;
        this.refreshDocTableUi(shell);
    }

    docTableInsertCol(shell, at) {
        const table = shell.querySelector('table.docs-table');
        if (!table) return;
        [...table.rows].forEach((row) => {
            const isHeader = [...row.cells].some((cell) => cell.tagName === 'TH');
            const cell = document.createElement(isHeader ? 'th' : 'td');
            cell.innerHTML = '&nbsp;';
            const ref = row.cells[at] || null;
            row.insertBefore(cell, ref);
        });
        delete shell.dataset.selType;
        delete shell.dataset.selIndex;
        this.refreshDocTableUi(shell);
    }

    docTableAction(shell, action) {
        const table = shell.querySelector('table.docs-table');
        if (!table || !shell.dataset.selType) return;
        const type = shell.dataset.selType;
        const index = Number(shell.dataset.selIndex);
        if (action === 'clear') {
            if (type === 'row' && table.rows[index]) {
                [...table.rows[index].cells].forEach((cell) => { cell.innerHTML = '&nbsp;'; });
            }
            if (type === 'col') {
                [...table.rows].forEach((row) => {
                    if (row.cells[index]) row.cells[index].innerHTML = '&nbsp;';
                });
            }
        }
        if (action === 'delete') {
            if (type === 'row' && table.rows.length > 1 && table.rows[index]) {
                table.deleteRow(index);
            }
            if (type === 'col') {
                const cols = Math.max(0, ...[...table.rows].map((row) => row.cells.length));
                if (cols > 1) {
                    [...table.rows].forEach((row) => {
                        if (row.cells[index]) row.deleteCell(index);
                    });
                }
            }
            delete shell.dataset.selType;
            delete shell.dataset.selIndex;
        }
        this.refreshDocTableUi(shell);
    }

    saveDocSelection(id) {
        const editor = document.getElementById(id);
        const sel = window.getSelection();
        if (!editor || !sel || !sel.rangeCount) {
            this._docSelection = this._docSelection || {};
            this._docSelection[id] = null;
            return;
        }
        const range = sel.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
            this._docSelection = this._docSelection || {};
            this._docSelection[id] = null;
            return;
        }
        this._docSelection = this._docSelection || {};
        this._docSelection[id] = range.cloneRange();
    }

    restoreDocSelection(id) {
        const editor = document.getElementById(id);
        const range = this._docSelection?.[id];
        if (!editor) return false;
        editor.focus();
        if (!range) return false;
        try {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            return true;
        } catch (e) {
            return false;
        }
    }

    toEditorHtml(value) {
        const text = String(value || '').trim();
        if (!text) return '<p></p>';
        if (/<[a-z][\s\S]*>/i.test(text)) return text;
        return `<p>${this.escape(text).replace(/\n/g, '<br>')}</p>`;
    }

    runDocCommand(id, cmd) {
        this.restoreDocSelection(id);
        const editor = document.getElementById(id);
        if (!editor) return;
        if (cmd === 'h2') document.execCommand('formatBlock', false, 'h2');
        else if (cmd === 'h3') document.execCommand('formatBlock', false, 'h3');
        else if (cmd === 'createLink') {
            const url = window.prompt('Link URL');
            if (url) document.execCommand('createLink', false, url);
        } else if (cmd === 'unlink') {
            document.execCommand('unlink', false, null);
        } else if (cmd === 'image') {
            document.getElementById(`${id}-table`)?.classList.add('hidden');
            document.getElementById(`${id}-script`)?.classList.add('hidden');
            document.getElementById(`${id}-image`)?.click();
        } else if (cmd === 'table') {
            document.getElementById(`${id}-script`)?.classList.add('hidden');
            document.getElementById(`${id}-table`)?.classList.toggle('hidden');
        } else if (cmd === 'script') {
            document.getElementById(`${id}-table`)?.classList.add('hidden');
            document.getElementById(`${id}-script`)?.classList.toggle('hidden');
            this.paintScriptPreview(id);
            this.fitScriptTextarea(id);
        } else if (cmd === 'callout') {
            document.execCommand('insertHTML', false, '<div class="docs-callout"><p>Add an important note here.</p></div><p><br></p>');
            this.ensureDocTrail(editor);
            this.placeCaretInTrail(editor);
        } else if (cmd === 'inlineCode') {
            const sel = window.getSelection();
            const text = sel && !sel.isCollapsed ? sel.toString() : 'code';
            document.execCommand('insertHTML', false, `<code class="docs-inline-code">${this.escape(text)}</code>&nbsp;`);
        } else if (cmd === 'insertUnorderedList' || cmd === 'insertOrderedList') {
            this.insertDocList(id, cmd === 'insertOrderedList');
        } else {
            document.execCommand(cmd, false, null);
        }
        this.saveDocSelection(id);
    }

    insertDocList(id, ordered) {
        const editor = document.getElementById(id);
        if (!editor) return;
        this.restoreDocSelection(id);
        const ok = document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList', false, null);
        if (ok) {
            this.saveDocSelection(id);
            return;
        }
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        let block = range.startContainer;
        if (block.nodeType === 3) block = block.parentNode;
        while (block && block !== editor && !/^(P|DIV|H1|H2|H3|H4|LI|BLOCKQUOTE)$/i.test(block.nodeName)) {
            block = block.parentNode;
        }
        if (!block || block === editor) {
            document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList', false, null);
            this.saveDocSelection(id);
            return;
        }
        const text = block.textContent || '';
        const list = document.createElement(ordered ? 'ol' : 'ul');
        const item = document.createElement('li');
        item.innerHTML = block.innerHTML || '<br>';
        list.appendChild(item);
        block.replaceWith(list);
        const next = document.createRange();
        next.selectNodeContents(item);
        next.collapse(false);
        sel.removeAllRanges();
        sel.addRange(next);
        this.saveDocSelection(id);
        if (!text.trim()) item.focus?.();
    }

    async insertDocImage(id, file) {
        try {
            this.showLoader();
            const result = await this.api('upload-doc-asset', { method: 'POST', file });
            document.getElementById(id)?.focus();
            document.execCommand('insertHTML', false, `<img src="${this.escape(result.url)}" alt="">`);
        } catch (e) {
            const err = document.getElementById('epError') || document.getElementById('productError');
            if (err) err.textContent = e.message;
        } finally {
            this.hideLoader();
        }
    }

    insertDocTable(id) {
        const rows = Math.min(20, Math.max(1, Number(document.getElementById(`${id}-table-rows`)?.value) || 3));
        const cols = Math.min(10, Math.max(1, Number(document.getElementById(`${id}-table-cols`)?.value) || 3));
        const withHeader = Boolean(document.getElementById(`${id}-table-header`)?.checked);
        let html = '<div class="docs-table-shell" contenteditable="false"><table class="docs-table" contenteditable="true"><tbody>';
        for (let r = 0; r < rows; r += 1) {
            html += '<tr>';
            for (let c = 0; c < cols; c += 1) {
                const label = withHeader && r === 0 ? `Header ${c + 1}` : '';
                const tag = withHeader && r === 0 ? 'th' : 'td';
                html += `<${tag}>${label || '&nbsp;'}</${tag}>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table></div><p><br></p>';
        this.restoreDocSelection(id);
        document.execCommand('insertHTML', false, html);
        document.getElementById(`${id}-table`)?.classList.add('hidden');
        const editor = document.getElementById(id);
        this.enhanceDocTables(editor);
        this.ensureDocTrail(editor);
        this.placeCaretInTrail(editor);
        this.saveDocSelection(id);
    }

    serializeDocHtml(editor) {
        if (!editor) return '';
        const clone = editor.cloneNode(true);
        clone.querySelectorAll('.docs-table-row-rail, .docs-table-col-rail, .docs-table-actions').forEach((el) => el.remove());
        clone.querySelectorAll('.docs-table-shell').forEach((shell) => {
            const table = shell.querySelector('table.docs-table');
            if (table) {
                table.removeAttribute('contenteditable');
                [...table.querySelectorAll('.is-selected')].forEach((cell) => cell.classList.remove('is-selected'));
                shell.replaceWith(table);
            }
        });
        clone.querySelectorAll('.docs-script-wrap .copy-script').forEach((btn) => btn.remove());
        clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
        return clone.innerHTML;
    }

    requestScriptSource(source) {
        this.syncEndpointEditor();
        const step = this.currentStep() || this.findNode(this.productTree(this.editingProduct()), this.selectedDocNodeId)?.node;
        const draft = step ? this.stepDraft(step) : null;
        if (!draft) return { text: '', lang: 'JavaScript' };
        if (source === 'prerequest') {
            return { text: this.scriptText(draft.scripts || [], 'prerequest'), lang: 'JavaScript' };
        }
        if (source === 'test') {
            return { text: this.scriptText(draft.scripts || [], 'test'), lang: 'JavaScript' };
        }
        if (source === 'body') {
            const mode = draft.bodyMode || 'raw';
            if (mode === 'form-data') {
                const rows = this.normalizeKv(draft.formData || []).filter((row) => row.key);
                return {
                    text: JSON.stringify(Object.fromEntries(rows.map((row) => [row.key, row.value || ''])), null, 2),
                    lang: 'JSON',
                };
            }
            if (mode === 'urlencoded') {
                const rows = this.normalizeKv(draft.urlencoded || []).filter((row) => row.key);
                return {
                    text: JSON.stringify(Object.fromEntries(rows.map((row) => [row.key, row.value || ''])), null, 2),
                    lang: 'JSON',
                };
            }
            const body = String(draft.body || '');
            const looksJson = /^\s*[\[{]/.test(body);
            return { text: body, lang: looksJson ? 'JSON' : 'JavaScript' };
        }
        return { text: '', lang: 'JavaScript' };
    }

    loadScriptFromRequest(id) {
        const source = document.getElementById(`${id}-script-source`)?.value || '';
        if (!source) return;
        const loaded = this.requestScriptSource(source);
        const area = document.getElementById(`${id}-script-body`);
        const lang = document.getElementById(`${id}-script-lang`);
        if (lang && loaded.lang) lang.value = loaded.lang;
        if (area) area.value = this.formatDocScriptBody(loaded.text || '', loaded.lang || lang?.value || 'JavaScript');
        this.paintScriptPreview(id);
        this.fitScriptTextarea(id);
    }

    formatDocScriptBody(text, lang) {
        const raw = String(text ?? '');
        if (String(lang || '').toLowerCase() !== 'json') return raw;
        try {
            return JSON.stringify(JSON.parse(raw), null, 2);
        } catch (e) {
            return raw;
        }
    }

    normalizeScriptPanelBody(id) {
        const area = document.getElementById(`${id}-script-body`);
        const lang = document.getElementById(`${id}-script-lang`)?.value || 'JavaScript';
        if (!area || !area.value.trim()) return;
        area.value = this.formatDocScriptBody(area.value, lang);
    }

    fitScriptTextarea(id) {
        const area = document.getElementById(`${id}-script-body`);
        if (!area) return;
        area.style.height = 'auto';
        area.style.height = `${Math.max(160, area.scrollHeight + 4)}px`;
    }

    highlightDocCode(source, lang) {
        const text = String(source ?? '');
        const kind = String(lang || '').toLowerCase();
        if (kind === 'json') return this.highlightJson(text);
        return this.highlightScript(text);
    }

    paintScriptPreview(id) {
        const lang = document.getElementById(`${id}-script-lang`)?.value || 'JavaScript';
        const body = document.getElementById(`${id}-script-body`)?.value || '';
        const preview = document.getElementById(`${id}-script-preview`);
        const langLabel = document.getElementById(`${id}-script-preview-lang`);
        const card = preview?.closest('.docs-script-card');
        const pre = preview?.closest('pre');
        if (langLabel) langLabel.textContent = lang;
        if (preview) preview.innerHTML = this.highlightDocCode(body, lang) || '&nbsp;';
        if (pre) {
            pre.classList.toggle('is-json', String(lang).toLowerCase() === 'json');
            pre.style.height = 'auto';
            pre.style.maxHeight = 'none';
        }
        if (card) card.classList.toggle('is-json', String(lang).toLowerCase() === 'json');
    }

    insertScript(id) {
        const lang = document.getElementById(`${id}-script-lang`)?.value || 'JavaScript';
        let body = document.getElementById(`${id}-script-body`)?.value || '';
        if (!body.trim()) return;
        body = this.formatDocScriptBody(body, lang);
        const highlighted = this.highlightDocCode(body, lang);
        const isJson = String(lang).toLowerCase() === 'json';
        const html = `
            <div class="docs-script-wrap" contenteditable="false">
                <div class="docs-script-card${isJson ? ' is-json' : ''}">
                    <div class="docs-script-head">
                        <span class="docs-script-lang">${this.escape(lang)}</span>
                        <button type="button" class="copy-script">Copy</button>
                    </div>
                    <pre class="docs-script docs-script-dark${isJson ? ' is-json' : ''}" data-lang="${this.escape(lang)}"><code class="docs-script-code is-editable" contenteditable="true" spellcheck="false">${highlighted}</code></pre>
                </div>
            </div>
            <p><br></p>
        `;
        this.restoreDocSelection(id);
        document.execCommand('insertHTML', false, html);
        document.getElementById(`${id}-script`)?.classList.add('hidden');
        const area = document.getElementById(`${id}-script-body`);
        if (area) {
            area.value = '';
            area.style.height = '';
        }
        this.paintScriptPreview(id);
        this.fitScriptTextarea(id);
        const editor = document.getElementById(id);
        this.enhanceDocScripts(editor, { editable: true });
        this.ensureDocTrail(editor);
        this.placeCaretInTrail(editor);
        this.saveDocSelection(id);
    }

    stashDocsDraft() {
        const editor = document.getElementById('apiDoc');
        if (!editor) return;
        const html = this.serializeDocHtml(editor);
        const selected = (this.summary?.endpoints || []).find((ep) => ep.id === this.selectedId);
        if (selected) selected.docsHtml = html;
        const step = this.currentStep() || this.findNode(this.productTree(this.editingProduct()), this.selectedDocNodeId)?.node;
        if (step) step.docsHtml = html;
    }

    async saveDocs() {
        const err = document.getElementById('epError');
        const ok = document.getElementById('epOk');
        const editor = document.getElementById('apiDoc');
        const html = this.serializeDocHtml(editor);
        const selected = (this.summary?.endpoints || []).find((ep) => ep.id === this.selectedId);
        const step = this.currentStep() || this.findNode(this.productTree(this.editingProduct()), this.selectedDocNodeId)?.node;
        if (step) step.docsHtml = html;
        if (!selected && !step) return;
        try {
            this.showLoader();
            if (selected?.docsKey) {
                const result = await this.api('save-docs', {
                    method: 'POST',
                    body: {
                        id: selected.id,
                        docsKey: selected.docsKey,
                        name: selected.name || step?.label || '',
                        method: selected.method || step?.method || 'GET',
                        html,
                    },
                });
                selected.docsHtml = result.html;
                selected.description = result.html;
            }
            await this.api('save-products', {
                method: 'POST',
                body: { products: this.productsData.products, maps: this.productsData.maps || {} },
            });
            this.notifyPlayground('docs');
            this.notifyPlayground('products');
            if (ok) ok.textContent = 'Documentation saved.';
        } catch (e) {
            if (err) err.textContent = e.message;
        } finally {
            this.hideLoader();
        }
    }

    bindApis() {
        document.querySelectorAll('[data-doc-product]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.stashDocsDraft();
                this.docPreview = false;
                this.selectedDocProductId = btn.dataset.docProduct;
                this.selectedDocNodeId = this.flatSteps(this.productById(btn.dataset.docProduct))[0]?.id || null;
                this.render();
            });
        });
        const product = this.productById(this.selectedDocProductId);
        const step = this.findNode(this.productTree(product), this.selectedDocNodeId)?.node;
        const linked = step ? this.matchEndpoint(step) : null;
        if (linked) this.selectedId = linked.id;
        this.bindDocEditor('apiDoc', linked?.docsHtml || linked?.description || step?.docsHtml || '');
        document.getElementById('previewDocsBtn')?.addEventListener('click', () => {
            this.stashDocsDraft();
            this.docPreview = !this.docPreview;
            this.render();
        });
        document.getElementById('saveDocsBtn')?.addEventListener('click', () => this.saveDocs());
    }

    notifyPlayground(kind) {
        const payload = JSON.stringify({ kind: kind || 'products', at: Date.now() });
        try {
            const channel = new BroadcastChannel('takaful-playground-sync');
            channel.postMessage(payload);
            channel.close();
        } catch (e) { /* older browsers still get storage + polling */ }
        try {
            localStorage.setItem('takaful-playground-sync', payload);
        } catch (e) { /* ignore quota */ }
    }

    productIconList() {
        return [
            { id: 'motor', label: 'Motor' },
            { id: 'travel', label: 'Travel' },
            { id: 'health', label: 'Health' },
            { id: 'life', label: 'Life' },
            { id: 'helper', label: 'Domestic helper' },
            { id: 'family', label: 'Family' },
            { id: 'group', label: 'Group' },
            { id: 'home', label: 'Home' },
            { id: 'marine', label: 'Marine' },
            { id: 'fire', label: 'Fire' },
            { id: 'credit', label: 'Credit' },
            { id: 'accident', label: 'Accident' },
            { id: 'workmen', label: 'Workmen' },
            { id: 'engineering', label: 'Engineering' },
            { id: 'liability', label: 'Liability' },
            { id: 'money', label: 'Money' },
            { id: 'umbrella', label: 'Takaful' },
            { id: 'shield', label: 'Protection' },
            { id: 'medical', label: 'Medical' },
            { id: 'document', label: 'Policy' },
            { id: 'folder', label: 'General' },
        ];
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

    escape(text) {
        return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[ch]));
    }
}

window.adminApp = new AdminApp();
