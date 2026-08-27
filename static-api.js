/**
 * Static browser replacement for admin-api.php + collection-store.php + proxy.php.
 * Attach: window.StaticAPI
 * Depends: window.GitHubStore, bcrypt (dcodeIO.bcrypt or bcrypt)
 */
(function (global) {
  'use strict';

  var AUTH_OK = 'takaful_admin_ok';
  var AUTH_USER = 'takaful_admin_user';
  var AUTH_FAILS = 'takaful_login_fails';

  var PRODUCTS_FILE = 'products.json';
  var COLLECTION_FILE = 'collection.json';
  var ADMIN_CONFIG_FILE = 'admin-config.json';

  var STORE_ROOT = 'collection';
  var STORE_COLLECTIONS = STORE_ROOT + '/collections';
  var STORE_ENVIRONMENTS = STORE_ROOT + '/environments';
  var STORE_INDEX = STORE_ROOT + '/index.json';
  var STORE_ACTIVE = STORE_ROOT + '/active.json';
  var STORE_ENV_VALUES = STORE_ROOT + '/env-values.json';
  var STORE_DOCS = STORE_ROOT + '/docs';
  var STORE_DOC_PAGES = STORE_DOCS + '/pages.json';
  var STORE_DOC_MEDIA = STORE_DOCS + '/media';
  var STORE_PRODUCT_FILES = STORE_ROOT + '/product-files';
  var STORE_HOSTS = STORE_ROOT + '/hosts.json';
  var LEGACY_COLLECTION = COLLECTION_FILE;

  var memoryCache = Object.create(null);
  var missingPaths = Object.create(null);
  var storageReady = null;

  function apiError(message, status) {
    var err = new Error(message);
    err.status = status || 500;
    return err;
  }

  function getBcrypt() {
    if (typeof global.bcrypt !== 'undefined' && global.bcrypt) return global.bcrypt;
    if (global.dcodeIO && global.dcodeIO.bcrypt) return global.dcodeIO.bcrypt;
    throw apiError('bcrypt library is not loaded', 500);
  }

  function normalizeBcryptHash(hash) {
    return String(hash || '').replace(/^\$2y\$/, '$2a$');
  }

  function timingSafeEqual(a, b) {
    a = String(a);
    b = String(b);
    var len = Math.max(a.length, b.length);
    var out = a.length === b.length ? 0 : 1;
    for (var i = 0; i < len; i++) {
      out |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return out === 0;
  }

  function looksLikePat(password) {
    var p = String(password || '');
    return /^(ghp_|github_pat_|gho_|ghu_)/.test(p);
  }

  function sessionGet(key) {
    try {
      return global.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function sessionSet(key, value) {
    try {
      global.sessionStorage.setItem(key, value);
    } catch (e) { /* ignore */ }
  }

  function sessionRemove(key) {
    try {
      global.sessionStorage.removeItem(key);
    } catch (e) { /* ignore */ }
  }

  function requireAuth() {
    if (sessionGet(AUTH_OK) !== '1') {
      throw apiError('Authentication required', 401);
    }
  }

  function requirePost(method) {
    if (String(method || 'GET').toUpperCase() !== 'POST') {
      throw apiError('POST required', 405);
    }
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function newStoreId(prefix) {
    var d = new Date();
    var stamp =
      d.getFullYear() +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) +
      pad2(d.getHours()) +
      pad2(d.getMinutes()) +
      pad2(d.getSeconds());
    var hex = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, '0');
    return prefix + stamp + hex;
  }

  function uniqid(prefix) {
    return (
      String(prefix || '') +
      Date.now().toString(16) +
      Math.random().toString(16).slice(2, 6)
    );
  }

  function storeMkdir() {
    return true;
  }

  function cacheGet(path) {
    if (Object.prototype.hasOwnProperty.call(memoryCache, path)) {
      return memoryCache[path];
    }
    return undefined;
  }

  function cacheSet(path, data) {
    memoryCache[path] = data;
    delete missingPaths[path];
  }

  function cacheDelete(path) {
    delete memoryCache[path];
    missingPaths[path] = true;
  }

  async function readJsonFile(path) {
    if (Object.prototype.hasOwnProperty.call(missingPaths, path)) {
      return null;
    }
    var cached = cacheGet(path);
    if (cached !== undefined) {
      return cached;
    }
    var data = await global.GitHubStore.getJson(path);
    if (data == null) {
      missingPaths[path] = true;
      return null;
    }
    cacheSet(path, data);
    return data;
  }

  async function writeJsonFile(path, data, message) {
    cacheSet(path, data);
    await global.GitHubStore.putJson(path, data, message || ('Update ' + path));
    return true;
  }

  async function fileExists(path) {
    if (Object.prototype.hasOwnProperty.call(missingPaths, path)) return false;
    if (cacheGet(path) !== undefined) return true;
    var data = await readJsonFile(path);
    return data != null;
  }

  async function deletePath(path, message) {
    cacheDelete(path);
    try {
      await global.GitHubStore.deleteFile(path, message || ('Delete ' + path));
    } catch (e) {
      /* file may already be gone */
    }
    return true;
  }

  function defaultIndex() {
    return {
      activeCollectionId: null,
      activeEnvironmentId: null,
      items: [],
    };
  }

  async function loadIndex() {
    var data = await readJsonFile(STORE_INDEX);
    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
      return defaultIndex();
    }
    if (!Object.prototype.hasOwnProperty.call(data, 'activeCollectionId')) {
      data.activeCollectionId = null;
    }
    if (!Object.prototype.hasOwnProperty.call(data, 'activeEnvironmentId')) {
      data.activeEnvironmentId = null;
    }
    return data;
  }

  async function saveIndex(index) {
    return writeJsonFile(STORE_INDEX, index, 'Update collection index');
  }

  async function ensureStorage() {
    if (storageReady) return storageReady;
    storageReady = (async function () {
      storeMkdir();
      var index = await readJsonFile(STORE_INDEX);
      if (!index) {
        index = defaultIndex();
        cacheSet(STORE_INDEX, index);
        if (global.GitHubStore.getToken()) {
          await saveIndex(index);
        }
      }
      var pages = await readJsonFile(STORE_DOC_PAGES);
      if (!pages) {
        pages = { endpoints: {} };
        cacheSet(STORE_DOC_PAGES, pages);
        if (global.GitHubStore.getToken()) {
          await writeJsonFile(STORE_DOC_PAGES, pages, 'Create docs pages');
        }
      }
      var hosts = await readJsonFile(STORE_HOSTS);
      if (!hosts) {
        hosts = { hosts: defaultHosts() };
        cacheSet(STORE_HOSTS, hosts);
        if (global.GitHubStore.getToken()) {
          await writeJsonFile(STORE_HOSTS, hosts, 'Create hosts');
        }
      }
      index = await loadIndex();
      var hasCollection = false;
      for (var i = 0; i < index.items.length; i++) {
        if (index.items[i] && index.items[i].type === 'collection') {
          hasCollection = true;
          break;
        }
      }
      if (!hasCollection) {
        var legacy = await readJsonFile(LEGACY_COLLECTION);
        if (legacy && Array.isArray(legacy.item) && legacy.item.length && global.GitHubStore.getToken()) {
          await importPayload('collection', legacy, 'collection.json', false);
          index = await loadIndex();
        }
      }
      if (!index.activeEnvironmentId) {
        var env = latestEnvironmentItem(index);
        if (env) {
          index.activeEnvironmentId = env.id;
          if (global.GitHubStore.getToken()) {
            await saveIndex(index);
          } else {
            cacheSet(STORE_INDEX, index);
          }
        }
      }
    })();
    try {
      await storageReady;
    } catch (e) {
      storageReady = null;
      throw e;
    }
    return storageReady;
  }

  function detectUploadType(json) {
    if (!json || typeof json !== 'object') return null;
    var hasItems = Array.isArray(json.item) && json.item.length > 0;
    var hasValues = Array.isArray(json.values);
    var scope = json._postman_variable_scope || '';
    if (hasItems && !hasValues) return 'collection';
    if (hasValues && (scope === 'environment' || !hasItems)) return 'environment';
    if (hasItems) return 'collection';
    return null;
  }

  function countStoreEndpoints(items) {
    var count = 0;
    (items || []).forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      if (Array.isArray(item.item) && item.item.length) {
        count += countStoreEndpoints(item.item);
      } else if (item.request) {
        count++;
      }
    });
    return count;
  }

  function topFolderNames(collection) {
    var names = [];
    ((collection && collection.item) || []).forEach(function (item) {
      if (item && item.name) names.push(item.name);
    });
    return names;
  }

  function environmentKeys(json) {
    var keys = [];
    ((json && json.values) || []).forEach(function (row) {
      if (row && row.key) keys.push(row.key);
    });
    return keys;
  }

  function environmentValues(json) {
    var out = {};
    ((json && json.values) || []).forEach(function (row) {
      if (!row || !row.key) return;
      if (Object.prototype.hasOwnProperty.call(row, 'enabled') && !row.enabled) return;
      out[row.key] = row.value != null ? String(row.value) : '';
    });
    return out;
  }

  function storePathFor(item) {
    var dir = item.type === 'environment' ? STORE_ENVIRONMENTS : STORE_COLLECTIONS;
    return dir + '/' + item.filename;
  }

  function findStoreItem(index, id) {
    for (var i = 0; i < index.items.length; i++) {
      if (index.items[i] && index.items[i].id === id) return index.items[i];
    }
    return null;
  }

  function valuesMapToRows(values) {
    var rows = [];
    if (!values || typeof values !== 'object') return rows;
    var keys = Object.keys(values);
    var isList = Array.isArray(values);
    if (isList) {
      values.forEach(function (row) {
        if (!row || typeof row !== 'object' || !row.key) return;
        rows.push({
          key: String(row.key).trim(),
          value: row.value != null ? String(row.value) : '',
          type: 'default',
          enabled: true,
        });
      });
      return rows;
    }
    keys.forEach(function (key) {
      key = String(key).trim();
      if (!key) return;
      var value = values[key];
      rows.push({
        key: key,
        value: value && typeof value === 'object' ? '' : String(value == null ? '' : value),
        type: 'default',
        enabled: true,
      });
    });
    return rows;
  }

  async function updateEnvironmentValue(id, key, value) {
    var index = await loadIndex();
    var item = findStoreItem(index, id);
    if (!item || item.type !== 'environment' || key === '') return false;
    var path = storePathFor(item);
    var json = await readJsonFile(path);
    if (!json || typeof json !== 'object') {
      json = {
        id: id,
        name: item.name || key,
        values: [],
      };
    }
    if (!Array.isArray(json.values)) json.values = [];
    var found = false;
    for (var i = 0; i < json.values.length; i++) {
      var row = json.values[i];
      if (row && row.key === key) {
        json.values[i].value = value;
        json.values[i].enabled = true;
        found = true;
        break;
      }
    }
    if (!found) {
      json.values.push({
        key: key,
        value: value,
        type: 'default',
        enabled: true,
      });
    }
    await writeJsonFile(path, json, 'Update environment value');
    index.activeEnvironmentId = id;
    await saveIndex(index);
    await publishRuntime();
    return true;
  }

  async function saveEnvironmentValues(id, values, name) {
    var index = await loadIndex();
    var item = findStoreItem(index, id);
    if (!item || item.type !== 'environment') return false;
    var path = storePathFor(item);
    var json = await readJsonFile(path);
    if (!json || typeof json !== 'object') {
      json = {
        id: id,
        name: item.name,
        _postman_variable_scope: 'environment',
        values: [],
      };
    }
    name = String(name || '').trim();
    if (name) json.name = name;
    json.values = valuesMapToRows(values);
    if (!json._postman_variable_scope) json._postman_variable_scope = 'environment';
    await writeJsonFile(path, json, 'Save environment values');
    for (var i = 0; i < index.items.length; i++) {
      if (index.items[i] && index.items[i].id === id) {
        index.items[i].keys = environmentKeys(json);
        index.items[i].variableCount = index.items[i].keys.length;
        if (name) index.items[i].name = name;
        index.activeEnvironmentId = id;
        break;
      }
    }
    await saveIndex(index);
    await publishRuntime();
    return true;
  }

  async function importPayload(type, json, originalName, makeActive) {
    var index = await loadIndex();
    var id = newStoreId(type === 'environment' ? 'env' : 'col');
    var filename = id + '.json';
    var uploadedAt = isoNow();
    var item = {
      id: id,
      type: type,
      name:
        type === 'environment'
          ? json.name || 'Environment'
          : (json.info && json.info.name) || 'Collection',
      originalFilename: originalName,
      filename: filename,
      uploadedAt: uploadedAt,
    };
    var path;
    if (type === 'collection') {
      item.folders = topFolderNames(json);
      item.folderCount = item.folders.length;
      item.endpointCount = countStoreEndpoints(json.item || []);
      path = STORE_COLLECTIONS + '/' + filename;
    } else {
      item.keys = environmentKeys(json);
      item.variableCount = item.keys.length;
      path = STORE_ENVIRONMENTS + '/' + filename;
    }
    await writeJsonFile(path, json, 'Import ' + type + ' ' + id);
    index.items.push(item);
    if (type === 'collection' && (makeActive || !index.activeCollectionId)) {
      index.activeCollectionId = id;
    }
    if (type === 'environment') {
      index.activeEnvironmentId = id;
    }
    await saveIndex(index);
    await publishRuntime();
    return item;
  }

  function latestCollectionItem(index) {
    var latest = null;
    (index.items || []).forEach(function (item) {
      if (!item || item.type !== 'collection') return;
      if (!latest || String(item.uploadedAt) > String(latest.uploadedAt)) latest = item;
    });
    return latest;
  }

  function latestEnvironmentItem(index) {
    var latest = null;
    (index.items || []).forEach(function (item) {
      if (!item || item.type !== 'environment') return;
      if (!latest || String(item.uploadedAt) > String(latest.uploadedAt)) latest = item;
    });
    return latest;
  }

  async function environmentDownloadPayload(id) {
    var index = await loadIndex();
    id = String(id || '').trim();
    var item = id ? findStoreItem(index, id) : null;
    if (!item || item.type !== 'environment') {
      var activeId = index.activeEnvironmentId || null;
      item = activeId ? findStoreItem(index, activeId) : null;
    }
    if (!item || item.type !== 'environment') {
      item = latestEnvironmentItem(index);
    }
    if (!item || item.type !== 'environment') return null;
    var json = await readJsonFile(storePathFor(item));
    if (!json || typeof json !== 'object') return null;
    if (!json.name && item.name) json.name = item.name;
    if (!json._postman_variable_scope) json._postman_variable_scope = 'environment';
    if (!Array.isArray(json.values)) json.values = [];
    return { item: item, environment: json };
  }

  async function collectionDownloadPayload(id) {
    var index = await loadIndex();
    id = String(id || '').trim();
    var item = id ? findStoreItem(index, id) : null;
    if (!item || item.type !== 'collection') return null;
    var json = await readJsonFile(storePathFor(item));
    if (!json || typeof json !== 'object') return null;
    return { item: item, collection: json };
  }

  async function activeCollectionFile() {
    var index = await loadIndex();
    var id = index.activeCollectionId;
    var item = id ? findStoreItem(index, id) : latestCollectionItem(index);
    if (!item) return null;
    var path = storePathFor(item);
    if (await fileExists(path)) return path;
    return null;
  }

  async function loadActiveCollection() {
    var path = await activeCollectionFile();
    if (path) {
      var data = await readJsonFile(path);
      if (data && typeof data === 'object') return data;
    }
    return readJsonFile(COLLECTION_FILE);
  }

  async function publishRuntime() {
    var index = await loadIndex();
    var activeId = index.activeCollectionId;
    var active = activeId ? findStoreItem(index, activeId) : latestCollectionItem(index);
    if (active && active.type === 'collection') {
      var src = storePathFor(active);
      var collection = await readJsonFile(src);
      if (collection) {
        await writeJsonFile(STORE_ACTIVE, collection, 'Publish active collection');
        await writeJsonFile(LEGACY_COLLECTION, collection, 'Publish legacy collection.json');
        index.activeCollectionId = active.id;
        await saveIndex(index);
      }
    }
    var envs = {};
    for (var i = 0; i < index.items.length; i++) {
      var item = index.items[i];
      if (!item || item.type !== 'environment') continue;
      var json = await readJsonFile(storePathFor(item));
      envs[item.id] = {
        name: item.name,
        values: json ? environmentValues(json) : {},
      };
    }
    if (!Object.keys(envs).length) {
      await writeJsonFile(STORE_ENV_VALUES, {}, 'Clear env values');
    } else {
      await writeJsonFile(STORE_ENV_VALUES, envs, 'Publish env values');
    }
  }

  async function deleteStoreItem(id) {
    var index = await loadIndex();
    var kept = [];
    var removed = null;
    index.items.forEach(function (item) {
      if (item && item.id === id) {
        removed = item;
        return;
      }
      kept.push(item);
    });
    if (!removed) return false;
    await deletePath(storePathFor(removed), 'Delete store item ' + id);
    index.items = kept;
    if (index.activeCollectionId === id) {
      var next = latestCollectionItem(index);
      index.activeCollectionId = next ? next.id : null;
    }
    if (index.activeEnvironmentId === id) {
      var nextEnv = latestEnvironmentItem(index);
      index.activeEnvironmentId = nextEnv ? nextEnv.id : null;
    }
    await saveIndex(index);
    await publishRuntime();
    return true;
  }

  async function activateCollection(id) {
    var index = await loadIndex();
    var item = findStoreItem(index, id);
    if (!item || item.type !== 'collection') return false;
    index.activeCollectionId = id;
    await saveIndex(index);
    await publishRuntime();
    return true;
  }

  async function filesPayload() {
    var index = await loadIndex();
    var collections = [];
    var environments = [];
    index.items.forEach(function (item) {
      if (!item) return;
      var copy = Object.assign({}, item);
      if (item.type === 'environment') {
        copy.active = index.activeEnvironmentId === item.id;
        environments.push(copy);
      } else {
        copy.active = index.activeCollectionId === item.id;
        collections.push(copy);
      }
    });
    collections.sort(function (a, b) {
      return String(b.uploadedAt).localeCompare(String(a.uploadedAt));
    });
    environments.sort(function (a, b) {
      return String(b.uploadedAt).localeCompare(String(a.uploadedAt));
    });
    return {
      activeCollectionId: index.activeCollectionId,
      activeEnvironmentId: index.activeEnvironmentId || null,
      collections: collections,
      environments: environments,
    };
  }

  function defaultDocPages() {
    return { endpoints: {} };
  }

  async function loadDocPages() {
    var data = await readJsonFile(STORE_DOC_PAGES);
    if (!data || typeof data !== 'object' || !data.endpoints || typeof data.endpoints !== 'object') {
      return defaultDocPages();
    }
    return data;
  }

  async function saveDocPages(pages) {
    return writeJsonFile(STORE_DOC_PAGES, pages, 'Update documentation pages');
  }

  function defaultRelatedHosts() {
    return [
      { id: 'motor-claim', title: 'Motor claim', url: 'https://claimsonline.takafuloman.om/' },
      { id: 'inspection', title: 'Inspection', url: 'https://takafulomanpreinspectionlive.azurewebsites.net/' },
      { id: 'e-insurance', title: 'E-insurance', url: 'https://oman-insurance.com/' },
      { id: 'whatsapp', title: 'WhatsApp', url: 'https://takafulinsoman.mehery.com/' },
    ];
  }

  function defaultHosts() {
    return [
      { id: 'live', title: 'Live', url: 'https://sellonline.takafuloman.om/' },
      { id: 'uat', title: 'UAT', url: 'https://uatsellonline.takafuloman.om/' },
    ];
  }

  function normalizeHostEntries(hosts) {
    var clean = [];
    var used = {};
    if (!Array.isArray(hosts)) return clean;
    hosts.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var title = String(item.title || '').trim();
      var url = String(item.url || '').trim();
      if (!url || !/^https?:\/\//i.test(url)) return;
      var id = String(item.id || title)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      if (!id) id = 'host-' + (clean.length + 1);
      var base = id;
      var n = 2;
      while (used[id]) {
        id = base + '-' + n;
        n++;
      }
      used[id] = true;
      clean.push({
        id: id,
        title: title || id,
        url: url,
      });
    });
    return clean;
  }

  async function loadHosts() {
    var data = await readJsonFile(STORE_HOSTS);
    if (!data || !Array.isArray(data.hosts) || !data.hosts.length) {
      return defaultHosts();
    }
    var out = normalizeHostEntries(data.hosts);
    return out.length ? out : defaultHosts();
  }

  async function loadRelatedHosts() {
    var data = await readJsonFile(STORE_HOSTS);
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'relatedHosts')) {
      return defaultRelatedHosts();
    }
    return normalizeHostEntries(data.relatedHosts);
  }

  async function saveHosts(hosts, relatedHosts) {
    var clean = normalizeHostEntries(hosts);
    if (!clean.length) return false;
    var payload = { hosts: clean };
    if (relatedHosts != null) {
      payload.relatedHosts = normalizeHostEntries(relatedHosts);
    } else {
      payload.relatedHosts = await loadRelatedHosts();
    }
    return writeJsonFile(STORE_HOSTS, payload, 'Update hosts');
  }

  function requestDescription(request) {
    var desc = request && request.description != null ? request.description : '';
    if (desc && typeof desc === 'object') {
      return String(desc.content || '');
    }
    return typeof desc === 'string' ? desc : '';
  }

  function docsKey(method, path, crumbs) {
    path = String(path || '').trim();
    if (path && path !== '/') {
      return String(method || '').toUpperCase() + ' ' + path;
    }
    return String(method || '').toUpperCase() + ' ' + (Array.isArray(crumbs) ? crumbs.join('/') : '');
  }

  function looksLikeHtml(text) {
    return typeof text === 'string' && /<[a-z][\s\S]*>/i.test(text);
  }

  function sanitizeDocHtml(html) {
    html = String(html || '');
    html = html.replace(/<(script|iframe|object|embed|form|link|meta|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
    html = html.replace(/<\/?(script|iframe|object|embed|form|link|meta|style)[^>]*>/gi, '');
    var allowed = {
      p: 1, br: 1, h2: 1, h3: 1, h4: 1, strong: 1, b: 1, em: 1, i: 1, u: 1, s: 1,
      strike: 1, sub: 1, sup: 1, ul: 1, ol: 1, li: 1, a: 1, img: 1, pre: 1, code: 1,
      blockquote: 1, span: 1, div: 1, hr: 1, table: 1, thead: 1, tbody: 1, tr: 1,
      th: 1, td: 1, font: 1,
    };
    html = html.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, function (match, tag) {
      return allowed[String(tag).toLowerCase()] ? match : '';
    });
    html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    html = html.replace(/javascript\s*:/gi, '');
    html = html.replace(/data\s*:/gi, '');
    return html.trim();
  }

  function flattenKeys(value, prefix) {
    prefix = prefix || '';
    var keys = [];
    if (!value || typeof value !== 'object') {
      return prefix ? [prefix] : [];
    }
    if (Array.isArray(value)) {
      value.forEach(function (item, i) {
        keys = keys.concat(flattenKeys(item, prefix === '' ? '[' + i + ']' : prefix + '[' + i + ']'));
      });
      return keys;
    }
    Object.keys(value).forEach(function (key) {
      var path = prefix === '' ? String(key) : prefix + '.' + key;
      if (value[key] && typeof value[key] === 'object') {
        keys = keys.concat(flattenKeys(value[key], path));
      } else {
        keys.push(path);
      }
    });
    return keys;
  }

  function extractBodyFields(raw) {
    var cleaned = String(raw || '');
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
    cleaned = cleaned.replace(/^\s*\/\/.*$/gm, '');
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    cleaned = cleaned.replace(/:\s*(\{\{[^}]+\}\})/g, ': "$1"');
    var parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return [];
    }
    if (!parsed || typeof parsed !== 'object') return [];
    return flattenKeys(parsed);
  }

  function endpointScripts(item) {
    var out = [];
    ((item && item.event) || []).forEach(function (event) {
      if (!event || typeof event !== 'object') return;
      var listen = event.listen != null ? String(event.listen) : '';
      var exec = [];
      if (event.script && event.script.exec != null) {
        exec = Array.isArray(event.script.exec)
          ? event.script.exec
          : [String(event.script.exec)];
      }
      if (listen || exec.length) {
        out.push({ listen: listen, exec: exec });
      }
    });
    return out;
  }

  function summarizeEndpoint(item, path, crumbs) {
    var request = item.request;
    if (typeof request === 'string') {
      request = { method: 'GET', url: request };
    }
    var url = request.url || '';
    var pathParts = [];
    var query = [];
    var rawUrl;
    if (url && typeof url === 'object') {
      pathParts = url.path || [];
      (url.query || []).forEach(function (row) {
        if (row && row.key) {
          query.push({
            key: row.key,
            value: row.value != null ? String(row.value) : '',
            disabled: !!row.disabled,
          });
        }
      });
      rawUrl = url.raw || '/' + pathParts.join('/');
    } else {
      rawUrl = String(url);
    }
    var headers = [];
    (request.header || []).forEach(function (header) {
      if (header && header.key) {
        headers.push({
          key: header.key,
          value: header.value != null ? header.value : '',
          disabled: !!header.disabled,
        });
      }
    });
    var rawBody = '';
    var body = request.body || null;
    if (body && typeof body === 'object' && body.mode === 'raw') {
      rawBody = String(body.raw || '');
    }
    var method = String(request.method || 'GET').toUpperCase();
    var pathStr = '/' + pathParts.join('/');
    var fields = query
      .map(function (q) {
        return q.key;
      })
      .concat(extractBodyFields(rawBody));
    var unique = [];
    fields.forEach(function (f) {
      if (unique.indexOf(f) === -1) unique.push(f);
    });
    return {
      id: path.join('-'),
      name: item.name || 'Unnamed',
      folder: crumbs[0] || 'General',
      crumbs: crumbs,
      method: method,
      url: rawUrl,
      path: pathStr,
      description: requestDescription(request),
      docsKey: docsKey(method, pathStr, crumbs),
      query: query,
      headers: headers,
      body: rawBody,
      fields: unique,
      scripts: endpointScripts(item),
    };
  }

  function flattenItems(items, path, crumbs) {
    path = path || [];
    crumbs = crumbs || [];
    var out = [];
    (Array.isArray(items) ? items : []).forEach(function (item, index) {
      if (!item || typeof item !== 'object') return;
      var nextPath = path.concat([index]);
      var nextCrumbs = crumbs.concat([item.name || 'Unnamed']);
      if (Array.isArray(item.item) && item.item.length) {
        out = out.concat(flattenItems(item.item, nextPath, nextCrumbs));
      } else if (item.request) {
        out.push(summarizeEndpoint(item, nextPath, nextCrumbs));
      }
    });
    return out;
  }

  function topFolders(items) {
    var folders = [];
    (items || []).forEach(function (item) {
      if (!item || typeof item !== 'object' || !item.name) return;
      folders.push(item.name);
    });
    return folders;
  }

  function suggestProduct(folder, products) {
    var hay = String(folder || '').toLowerCase();
    var best = null;
    var bestLen = 0;
    (products || []).forEach(function (product) {
      var tests = (product.keywords || []).concat([product.name || '']);
      tests.forEach(function (test) {
        test = String(test || '')
          .trim()
          .toLowerCase();
        if (test && hay.indexOf(test) !== -1 && test.length > bestLen) {
          best = product.id;
          bestLen = test.length;
        }
      });
    });
    return best;
  }

  function parseKeywords(value) {
    var list = Array.isArray(value) ? value : String(value || '').split(',');
    var out = [];
    list.forEach(function (item) {
      item = String(item || '').trim();
      if (item) out.push(item);
    });
    return out;
  }

  function slugId(value, fallback) {
    var id = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return id || uniqid(fallback);
  }

  function mapsFromProducts(products) {
    var maps = {};
    (products || []).forEach(function (product) {
      if (product && product.folder) maps[product.folder] = product.id;
    });
    return maps;
  }

  function envMapsFromProducts(products) {
    var maps = {};
    (products || []).forEach(function (product) {
      if (product && product.folder && product.environmentId) {
        maps[product.folder] = product.environmentId;
      }
    });
    return maps;
  }

  function flattenCatalog(products) {
    var out = [];
    if (!Array.isArray(products)) return out;
    products.forEach(function (product) {
      if (!product || typeof product !== 'object') return;
      var children = Array.isArray(product.children) ? product.children : [];
      var copy = Object.assign({}, product);
      delete copy.children;
      if (!copy.kind) copy.kind = 'product';
      out.push(copy);
      children.forEach(function (child) {
        if (!child || typeof child !== 'object' || !child.name) return;
        var c = Object.assign({}, child);
        c.kind = 'service';
        if (product.id) c.productId = product.id;
        delete c.children;
        out.push(c);
      });
    });
    return out;
  }

  function cleanKind(value) {
    var kind = String(value || '')
      .trim()
      .toLowerCase();
    if (kind === 'service' || kind === 'utility') return kind;
    return 'product';
  }

  function productIsPublished(product) {
    if (!Object.prototype.hasOwnProperty.call(product, 'published')) return true;
    var value = product.published;
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    return true;
  }

  function cleanProductFiles(files) {
    var out = [];
    if (!Array.isArray(files)) return out;
    files.forEach(function (file) {
      if (!file || typeof file !== 'object') return;
      var id = String(file.id || '').replace(/[^a-zA-Z0-9._-]/g, '');
      var name = String(file.name || '').trim();
      var filename = String(file.filename || '').replace(/[^a-zA-Z0-9._-]/g, '');
      if (!id || !name || !filename) return;
      out.push({
        id: id,
        name: name,
        filename: filename,
        url: String(file.url || STORE_PRODUCT_FILES + '/' + filename).trim(),
        size: parseInt(file.size, 10) || 0,
        uploadedAt: String(file.uploadedAt || ''),
      });
    });
    return out;
  }

  function cleanStep(step) {
    if (!step || typeof step !== 'object') return null;
    var label = String(step.label || '').trim();
    var endpointId = String(step.endpointId || '').trim();
    var docsKeyVal = String(step.docsKey || '').trim();
    var name = String(step.name || '').trim();
    if (!label && !endpointId && !docsKeyVal && !name) return null;
    var item = {
      type: 'step',
      id: String(step.id || '').trim(),
      label: label || name || 'Request',
    };
    if (!item.id) item.id = uniqid('step-');
    if (endpointId) item.endpointId = endpointId;
    if (docsKeyVal) item.docsKey = docsKeyVal;
    if (name) item.name = name;
    var method = String(step.method || '')
      .trim()
      .toUpperCase();
    if (method) item.method = method;
    var path = String(step.path || '').trim();
    if (path) item.path = path;
    var folder = String(step.folder || '').trim();
    if (folder) item.folder = folder;
    if (Array.isArray(step.headers) && step.headers.length) item.headers = step.headers;
    if (Array.isArray(step.query) && step.query.length) item.query = step.query;
    if (step.body != null && step.body !== '') {
      item.body = typeof step.body === 'string' ? step.body : JSON.stringify(step.body);
    }
    var bodyMode = String(step.bodyMode || '').trim();
    if (bodyMode) item.bodyMode = bodyMode;
    if (Array.isArray(step.formData) && step.formData.length) item.formData = step.formData;
    if (Array.isArray(step.urlencoded) && step.urlencoded.length) item.urlencoded = step.urlencoded;
    if (step.auth && typeof step.auth === 'object') item.auth = step.auth;
    if (Array.isArray(step.scripts) && step.scripts.length) item.scripts = step.scripts;
    var url = String(step.url || '').trim();
    if (url) item.url = url;
    if (step.docsHtml != null && step.docsHtml !== '') item.docsHtml = step.docsHtml;
    var seq = parseInt(step.seq, 10) || 0;
    if (seq > 0) item.seq = seq;
    return item;
  }

  function cleanTree(nodes) {
    var out = [];
    if (!Array.isArray(nodes)) return out;
    nodes.forEach(function (node) {
      if (!node || typeof node !== 'object') return;
      var type = node.type || '';
      var isFolder =
        type === 'folder' ||
        (Array.isArray(node.children) && type !== 'step');
      if (isFolder) {
        var name = String(node.name || node.label || '').trim() || 'Folder';
        var folder = {
          type: 'folder',
          id: String(node.id || '').trim(),
          name: name,
          children: cleanTree(node.children || []),
        };
        var seq = parseInt(node.seq, 10) || 0;
        if (seq > 0) folder.seq = seq;
        if (!folder.id) folder.id = uniqid('folder-');
        out.push(folder);
        return;
      }
      var step = cleanStep(node);
      if (step) out.push(step);
    });
    return out;
  }

  function productTree(product) {
    if (!product || typeof product !== 'object') return [];
    if (Array.isArray(product.tree) && product.tree.length) {
      return cleanTree(product.tree);
    }
    return cleanTree(product.flow || []);
  }

  function cleanProductEntry(product, isChild) {
    if (!product || typeof product !== 'object' || !product.name) return null;
    var kind = isChild ? 'service' : cleanKind(product.kind || 'product');
    var entry = {
      id: slugId(product.id || product.name, kind === 'service' ? 'service-' : 'product-'),
      name: String(product.name).trim(),
      kind: kind,
      keywords: parseKeywords(product.keywords || ''),
      folder: String(product.folder || '').trim(),
      environmentId: String(product.environmentId || '').trim(),
      docs: sanitizeDocHtml(product.docs || ''),
      published: productIsPublished(product),
      files: cleanProductFiles(product.files || []),
      icon: String(product.icon || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, ''),
    };
    var tree = productTree(product);
    if (tree && tree.length) entry.tree = tree;
    var productId = String(product.productId || '').trim();
    if (kind === 'service' && productId) entry.productId = productId;
    if (!entry.folder) delete entry.folder;
    if (!entry.environmentId) delete entry.environmentId;
    if (!entry.docs) delete entry.docs;
    if (!entry.files || !entry.files.length) delete entry.files;
    if (!entry.icon) delete entry.icon;
    return entry;
  }

  async function collectionSummary(collection, productsData) {
    var items = (collection && collection.item) || [];
    var endpoints = flattenItems(items);
    var products = flattenCatalog((productsData && productsData.products) || []);
    var maps = (productsData && productsData.maps) || {};
    var folders = [];
    topFolders(items).forEach(function (name) {
      var assigned = maps[name] || suggestProduct(name, products);
      var count = 0;
      endpoints.forEach(function (ep) {
        if (ep.folder === name) count++;
      });
      folders.push({
        name: name,
        endpoints: count,
        suggestedProduct: assigned,
      });
    });
    var pages = await loadDocPages();
    endpoints = endpoints.map(function (ep) {
      var key = ep.docsKey || docsKey(ep.method, ep.path, ep.crumbs);
      ep.docsKey = key;
      if (pages.endpoints && pages.endpoints[key] && pages.endpoints[key].html) {
        ep.docsHtml = pages.endpoints[key].html;
      } else {
        ep.docsHtml = looksLikeHtml(ep.description) ? ep.description : '';
      }
      return ep;
    });
    var variables = ((collection && collection.variable) || [])
      .map(function (v) {
        return v && v.key ? v.key : '';
      })
      .filter(Boolean);
    var fieldCount = 0;
    endpoints.forEach(function (ep) {
      fieldCount += (ep.fields || []).length;
    });
    return {
      name: (collection.info && collection.info.name) || 'Untitled collection',
      description: (collection.info && collection.info.description) || '',
      folders: folders,
      endpoints: endpoints,
      variables: variables,
      endpointCount: endpoints.length,
      fieldCount: fieldCount,
    };
  }

  function findItemByPath(items, parts) {
    if (!parts.length) return null;
    var idx = parseInt(parts[0], 10);
    parts = parts.slice(1);
    if (!items[idx] || typeof items[idx] !== 'object') return null;
    if (!parts.length) return items[idx];
    if (!items[idx].item) return null;
    return findItemByPath(items[idx].item, parts);
  }

  function updateItemByPath(items, parts, patch) {
    if (!parts.length) return false;
    var idx = parseInt(parts[0], 10);
    parts = parts.slice(1);
    if (!items[idx] || typeof items[idx] !== 'object') return false;
    if (!parts.length) {
      if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
        items[idx].name = patch.name;
      }
      if (!items[idx].request || typeof items[idx].request !== 'object') {
        items[idx].request = {};
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
        items[idx].request.description = sanitizeDocHtml(String(patch.description));
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'method')) {
        items[idx].request.method = String(patch.method).toUpperCase();
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'body')) {
        items[idx].request.body = {
          mode: 'raw',
          raw: String(patch.body),
          options: { raw: { language: 'json' } },
        };
      }
      if (Array.isArray(patch.query)) {
        if (!items[idx].request.url || typeof items[idx].request.url !== 'object') {
          items[idx].request.url = { raw: '', path: [], query: [] };
        }
        items[idx].request.url.query = patch.query;
      }
      if (Array.isArray(patch.headers)) {
        items[idx].request.header = patch.headers;
      }
      return true;
    }
    if (!Array.isArray(items[idx].item)) return false;
    return updateItemByPath(items[idx].item, parts, patch);
  }

  /**
   * Resolve the host's public A record in the browser (for the Public IP field).
   * Latency itself is always measured by pinging the host directly from the visitor.
   */
  async function resolvePublicIp(hostname) {
    if (!hostname) return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return hostname;
    if (hostname.indexOf(':') >= 0) return null;

    function pickA(data) {
      var answers = data && Array.isArray(data.Answer) ? data.Answer : [];
      for (var i = 0; i < answers.length; i++) {
        if (answers[i] && Number(answers[i].type) === 1 && answers[i].data) {
          return String(answers[i].data).replace(/\.$/, '');
        }
      }
      return null;
    }

    var endpoints = [
      {
        url: 'https://dns.google/resolve?name=' + encodeURIComponent(hostname) + '&type=A',
        headers: {},
      },
      {
        url: 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(hostname) + '&type=A',
        headers: { Accept: 'application/dns-json' },
      },
    ];

    for (var e = 0; e < endpoints.length; e++) {
      try {
        var res = await fetch(endpoints[e].url, {
          method: 'GET',
          headers: endpoints[e].headers,
          cache: 'no-store',
          credentials: 'omit',
        });
        if (!res.ok) continue;
        var ip = pickA(await res.json());
        if (ip) return ip;
      } catch (err) {
        /* try next resolver */
      }
    }
    return null;
  }

  /**
   * Ping a host from the visitor's browser/network only.
   * - Latency: direct request to the Oman URL (never via GitHub or API proxy)
   * - Public IP: DNS A-record resolved in the browser (shown on the card)
   */
  async function probeHost(url, label, title) {
    var host = '';
    var origin = '';
    try {
      var parsed = new URL(url);
      host = parsed.hostname;
      origin = parsed.origin;
    } catch (e) {
      host = '';
      origin = String(url || '').trim();
    }

    var ipPromise = resolvePublicIp(host);
    var target = origin || url;
    var online = false;
    var error = '';
    var httpStatus = null;
    var latencyMs = null;
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 8000);

    async function pingOnce(method) {
      var bust = (target.indexOf('?') >= 0 ? '&' : '?') + '_ping=' + Date.now() + Math.random().toString(16).slice(2);
      var started = performance.now();
      await fetch(target + bust, {
        method: method,
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      // Opaque success still means the browser reached the host on the user's network.
      return Math.round(performance.now() - started);
    }

    try {
      try {
        latencyMs = await pingOnce('HEAD');
      } catch (headErr) {
        if (controller.signal.aborted) throw headErr;
        latencyMs = await pingOnce('GET');
      }
      online = true;
    } catch (e) {
      online = false;
      latencyMs = null;
      if (controller.signal.aborted) {
        error = 'Timed out';
      } else {
        error = (e && e.message) || 'Unreachable';
      }
    } finally {
      clearTimeout(timer);
    }

    var ip = null;
    try {
      ip = await ipPromise;
    } catch (e2) {
      ip = null;
    }

    return {
      id: label,
      title: title || '',
      url: url,
      host: host,
      ip: ip,
      online: online,
      httpStatus: httpStatus,
      latencyMs: online ? latencyMs : null,
      error: error,
      checkedAt: isoNow(),
      checkedFrom: 'browser',
    };
  }

  async function probeAllHosts() {
    var hosts = await loadHosts();
    var related = await loadRelatedHosts();
    // All pings run in the visitor's browser, in parallel, straight to each Oman URL.
    var results = await Promise.all([
      Promise.all(
        hosts.map(function (item) {
          return probeHost(item.url, item.id, item.title);
        })
      ),
      Promise.all(
        related.map(function (item) {
          return probeHost(item.url, item.id, item.title);
        })
      ),
    ]);
    return { ok: true, hosts: results[0], relatedHosts: results[1] };
  }

  async function loadHostsPublic() {
    return {
      ok: true,
      hosts: await loadHosts(),
      relatedHosts: await loadRelatedHosts(),
    };
  }

  async function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error('Could not read file'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async function readUploadJson(opts, expected) {
    var raw = '';
    var originalName = 'upload.json';
    if (opts.file && typeof File !== 'undefined' && opts.file instanceof File) {
      originalName = opts.file.name || originalName;
      var buf = await readFileAsArrayBuffer(opts.file);
      raw = new TextDecoder('utf-8').decode(buf);
    } else {
      var body = opts.body || {};
      if (body.filename) originalName = String(body.filename);
      if (body.collection != null || body.environment != null) {
        var payloadJson = body.collection != null ? body.collection : body.environment;
        raw = typeof payloadJson === 'string' ? payloadJson : JSON.stringify(payloadJson);
      }
    }
    raw = String(raw || '').replace(/^\uFEFF/, '');
    if (!raw || raw === 'null') {
      throw apiError('No file content was received.', 400);
    }
    var json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      throw apiError('That file is not valid JSON.', 400);
    }
    if (!json || typeof json !== 'object') {
      throw apiError('That file is not valid JSON.', 400);
    }
    var detected = detectUploadType(json);
    if (detected !== expected) {
      var hint =
        expected === 'collection'
          ? 'Upload a valid Postman Collection v2 JSON file (the API repository).'
          : 'Upload a valid Postman Environment JSON file.';
      throw apiError(hint, 400);
    }
    return { json: json, originalName: originalName };
  }

  async function handleLogin(body) {
    var fails = parseInt(sessionGet(AUTH_FAILS) || '0', 10) || 0;
    if (fails >= 8) {
      throw apiError('Too many attempts. Refresh later.', 429);
    }
    await global.GitHubStore.ensureConfig();
    var config = global.GitHubStore.getAdminConfig() || {};
    var user = String((body && body.username) || '').trim();
    var pass = String((body && body.password) || '');
    var validUser = timingSafeEqual(String(config.username || ''), user);
    var bcrypt = getBcrypt();
    var hash = normalizeBcryptHash(config.password_hash || '');
    var validPass = false;
    try {
      validPass = bcrypt.compareSync(pass, hash);
    } catch (e) {
      validPass = false;
    }
    if (!validUser || !validPass) {
      sessionSet(AUTH_FAILS, String(fails + 1));
      throw apiError('Invalid username or password', 401);
    }
    sessionSet(AUTH_FAILS, '0');
    sessionSet(AUTH_OK, '1');
    sessionSet(AUTH_USER, user);
    if (looksLikePat(pass)) {
      global.GitHubStore.setSessionToken(pass);
    }
    return { ok: true, user: user };
  }

  async function handleChangePassword(body) {
    await global.GitHubStore.ensureConfig();
    var config = Object.assign({}, global.GitHubStore.getAdminConfig() || {});
    var current = String((body && body.current) || '');
    var next = String((body && body.next) || '');
    var confirm = String((body && body.confirm) || '');
    var bcrypt = getBcrypt();
    var hash = normalizeBcryptHash(config.password_hash || '');
    var ok = false;
    try {
      ok = bcrypt.compareSync(current, hash);
    } catch (e) {
      ok = false;
    }
    if (!ok) throw apiError('Current password is incorrect.', 400);
    if (next.length < 8) throw apiError('New password must be at least 8 characters.', 400);
    if (next !== confirm) throw apiError('New password and confirmation do not match.', 400);
    config.password_hash = bcrypt.hashSync(next, 10);
    if (!Object.prototype.hasOwnProperty.call(config, 'githubToken')) {
      config.githubToken = '';
    }
    await writeJsonFile(ADMIN_CONFIG_FILE, config, 'Change admin password');
    global.GitHubStore.setAdminConfigCache(config);
    if (looksLikePat(next)) {
      global.GitHubStore.setSessionToken(next);
    }
    return { ok: true };
  }

  async function handle(action, options) {
    options = options || {};
    var method = String(options.method || 'GET').toUpperCase();
    var body = options.body || {};
    var file = options.file || null;

    await global.GitHubStore.ensureConfig();
    await ensureStorage();

    switch (action) {
      case 'session':
        return {
          ok: sessionGet(AUTH_OK) === '1',
          user: sessionGet(AUTH_USER) || null,
        };

      case 'login':
        requirePost(method);
        return handleLogin(body);

      case 'logout':
        sessionRemove(AUTH_OK);
        sessionRemove(AUTH_USER);
        sessionRemove(AUTH_FAILS);
        global.GitHubStore.clearSession();
        return { ok: true };

      case 'change-password':
        requireAuth();
        requirePost(method);
        return handleChangePassword(body);

      case 'host-status':
        return probeAllHosts();

      case 'hosts':
        return {
          ok: true,
          hosts: await loadHosts(),
          relatedHosts: await loadRelatedHosts(),
        };

      case 'save-hosts': {
        requireAuth();
        requirePost(method);
        var hostsIn = Array.isArray(body.hosts) ? body.hosts : [];
        var relatedIn = Object.prototype.hasOwnProperty.call(body, 'relatedHosts')
          ? body.relatedHosts
          : null;
        if (!(await saveHosts(hostsIn, relatedIn))) {
          throw apiError('Add at least one host with a valid http(s) URL.', 400);
        }
        return {
          ok: true,
          hosts: await loadHosts(),
          relatedHosts: await loadRelatedHosts(),
        };
      }

      case 'overview': {
        requireAuth();
        var collection = (await loadActiveCollection()) || { item: [] };
        var productsData = (await readJsonFile(PRODUCTS_FILE)) || { products: [], maps: {} };
        var summary = await collectionSummary(collection, productsData);
        var files = await filesPayload();
        var updatedAt = null;
        var index = await loadIndex();
        var activeItem = index.activeCollectionId
          ? findStoreItem(index, index.activeCollectionId)
          : latestCollectionItem(index);
        if (activeItem && activeItem.uploadedAt) updatedAt = activeItem.uploadedAt;
        return {
          user: sessionGet(AUTH_USER) || 'admin',
          collectionName: summary.name,
          endpointCount: summary.endpointCount,
          fieldCount: summary.fieldCount,
          folderCount: summary.folders.length,
          productCount: ((productsData.products) || []).length,
          collectionFileCount: files.collections.length,
          environmentFileCount: files.environments.length,
          updatedAt: updatedAt,
        };
      }

      case 'products': {
        requireAuth();
        var pd = (await readJsonFile(PRODUCTS_FILE)) || { products: [], maps: {} };
        pd.products = flattenCatalog(pd.products || []);
        return pd;
      }

      case 'save-products': {
        requireAuth();
        requirePost(method);
        if (!Array.isArray(body.products)) {
          throw apiError('products array is required', 400);
        }
        var maps = body.maps || {};
        var incoming = flattenCatalog(body.products);
        var clean = [];
        incoming.forEach(function (product) {
          var entry = cleanProductEntry(product, false);
          if (entry) clean.push(entry);
        });
        var cleanMaps = mapsFromProducts(clean);
        if (maps && typeof maps === 'object') {
          Object.keys(maps).forEach(function (folder) {
            folder = String(folder).trim();
            var productId = String(maps[folder] || '').trim();
            if (folder && productId && !cleanMaps[folder]) {
              cleanMaps[folder] = productId;
            }
          });
        }
        var folderEnvironments = envMapsFromProducts(clean);
        var payloadOut = {
          maps: cleanMaps,
          folderEnvironments: folderEnvironments,
          products: clean,
          updatedAt: isoNow(),
        };
        await writeJsonFile(PRODUCTS_FILE, payloadOut, 'Save products');
        return {
          ok: true,
          products: clean,
          maps: cleanMaps,
          folderEnvironments: folderEnvironments,
          updatedAt: payloadOut.updatedAt,
        };
      }

      case 'collection': {
        requireAuth();
        var col = await loadActiveCollection();
        var productsData2 = (await readJsonFile(PRODUCTS_FILE)) || { products: [], maps: {} };
        if (!col) {
          return {
            name: 'No collection yet',
            description: '',
            folders: [],
            endpoints: [],
            variables: [],
            endpointCount: 0,
            fieldCount: 0,
          };
        }
        return collectionSummary(col, productsData2);
      }

      case 'files':
        requireAuth();
        return filesPayload();

      case 'save-env-value': {
        requireAuth();
        requirePost(method);
        var envId = String(body.id || '').trim();
        var envKey = String(body.key || '').trim();
        var envVal = body.value != null ? String(body.value) : '';
        if (!envId || !envKey || !(await updateEnvironmentValue(envId, envKey, envVal))) {
          throw apiError(
            'Could not update the environment variable. Map a saved environment to this product first.',
            400
          );
        }
        return { ok: true, key: envKey, value: envVal };
      }

      case 'save-environment': {
        requireAuth();
        requirePost(method);
        var seId = String(body.id || '').trim();
        var seName = String(body.name || '').trim();
        var seValues = body.values && typeof body.values === 'object' ? body.values : {};
        if (!seId) {
          var envJson = {
            name: seName || 'Admin environment',
            _postman_variable_scope: 'environment',
            values: valuesMapToRows(seValues),
          };
          var created = await importPayload('environment', envJson, 'admin-environment.json', false);
          if (!created) throw apiError('Could not create the environment.', 500);
          return { ok: true, id: created.id, files: await filesPayload() };
        }
        if (!(await saveEnvironmentValues(seId, seValues, seName))) {
          throw apiError('Could not save the environment.', 400);
        }
        return { ok: true, id: seId, files: await filesPayload() };
      }

      case 'download-environment': {
        requireAuth();
        requirePost(method);
        var packEnv = await environmentDownloadPayload(String(body.id || '').trim());
        if (!packEnv) {
          throw apiError(
            'No saved environment to download. Upload or save an environment first.',
            404
          );
        }
        return {
          ok: true,
          id: packEnv.item.id,
          name: packEnv.environment.name || packEnv.item.name,
          originalFilename: packEnv.item.originalFilename || '',
          environment: packEnv.environment,
        };
      }

      case 'download-collection': {
        requireAuth();
        requirePost(method);
        var packCol = await collectionDownloadPayload(String(body.id || '').trim());
        if (!packCol) throw apiError('Collection not found.', 404);
        return {
          ok: true,
          id: packCol.item.id,
          name: packCol.item.name || '',
          originalFilename: packCol.item.originalFilename || '',
          collection: packCol.collection,
        };
      }

      case 'activate-collection': {
        requireAuth();
        requirePost(method);
        var actId = String(body.id || '').trim();
        if (!actId || !(await activateCollection(actId))) {
          throw apiError('Collection not found', 404);
        }
        return { ok: true, files: await filesPayload() };
      }

      case 'delete-file': {
        requireAuth();
        requirePost(method);
        var delId = String(body.id || '').trim();
        if (!delId || !(await deleteStoreItem(delId))) {
          throw apiError('File not found', 404);
        }
        return { ok: true, files: await filesPayload() };
      }

      case 'upload-collection':
      case 'upload-environment': {
        requireAuth();
        requirePost(method);
        var expected = action === 'upload-environment' ? 'environment' : 'collection';
        var uploaded = await readUploadJson({ body: body, file: file }, expected);
        var item = await importPayload(
          expected,
          uploaded.json,
          uploaded.originalName,
          expected === 'collection'
        );
        if (!item) throw apiError('Could not store the uploaded file', 500);
        var productsData3 = (await readJsonFile(PRODUCTS_FILE)) || { products: [], maps: {} };
        var summary3 = null;
        if (expected === 'collection') {
          summary3 = await collectionSummary(uploaded.json, productsData3);
          var newMaps = productsData3.maps || {};
          summary3.folders.forEach(function (folder) {
            if (!newMaps[folder.name] && folder.suggestedProduct) {
              newMaps[folder.name] = folder.suggestedProduct;
            }
          });
          productsData3.maps = newMaps;
          await writeJsonFile(PRODUCTS_FILE, productsData3, 'Update product maps after upload');
        } else {
          var active = await loadActiveCollection();
          summary3 = active ? await collectionSummary(active, productsData3) : null;
        }
        return {
          ok: true,
          item: item,
          files: await filesPayload(),
          summary: summary3,
          maps: productsData3.maps || {},
        };
      }

      case 'save-endpoint': {
        requireAuth();
        requirePost(method);
        var epId = String(body.id || '').trim();
        if (!epId || !/^[0-9]+(-[0-9]+)*$/.test(epId)) {
          throw apiError('Valid endpoint id is required', 400);
        }
        var path = await activeCollectionFile();
        var collectionEp = path ? await readJsonFile(path) : null;
        if (!collectionEp) throw apiError('Collection not found', 404);
        if (!Array.isArray(collectionEp.item)) collectionEp.item = [];
        var okEp = updateItemByPath(collectionEp.item, epId.split('-'), body);
        if (!okEp) throw apiError('Endpoint not found', 404);
        await writeJsonFile(path, collectionEp, 'Save endpoint ' + epId);
        await publishRuntime();
        return { ok: true };
      }

      case 'save-maps': {
        requireAuth();
        requirePost(method);
        var productsData4 = (await readJsonFile(PRODUCTS_FILE)) || { products: [], maps: {} };
        var mapsIn = body.maps;
        if (!mapsIn || typeof mapsIn !== 'object') {
          throw apiError('maps object is required', 400);
        }
        var cleanMaps2 = {};
        Object.keys(mapsIn).forEach(function (folder) {
          folder = String(folder).trim();
          var productId = String(mapsIn[folder] || '').trim();
          if (folder && productId) cleanMaps2[folder] = productId;
        });
        productsData4.maps = cleanMaps2;
        await writeJsonFile(PRODUCTS_FILE, productsData4, 'Save folder maps');
        return { ok: true, maps: cleanMaps2 };
      }

      case 'save-docs': {
        requireAuth();
        requirePost(method);
        var docsKeyVal = String(body.docsKey || '').trim();
        var docsId = String(body.id || '').trim();
        if (!docsKeyVal) throw apiError('Documentation key is required', 400);
        var html = sanitizeDocHtml(body.html || '');
        var pages = await loadDocPages();
        pages.updatedAt = isoNow();
        if (!pages.endpoints) pages.endpoints = {};
        pages.endpoints[docsKeyVal] = {
          html: html,
          name: String(body.name || '').trim(),
          method: String(body.method || '').toUpperCase(),
          updatedAt: isoNow(),
        };
        await saveDocPages(pages);
        if (docsId && /^[0-9]+(-[0-9]+)*$/.test(docsId)) {
          var pathDocs = await activeCollectionFile();
          var collectionDocs = pathDocs ? await readJsonFile(pathDocs) : null;
          if (collectionDocs) {
            if (!Array.isArray(collectionDocs.item)) collectionDocs.item = [];
            updateItemByPath(collectionDocs.item, docsId.split('-'), { description: html });
            await writeJsonFile(pathDocs, collectionDocs, 'Sync docs into collection');
            await publishRuntime();
          }
        }
        return {
          ok: true,
          html: html,
          updatedAt: pages.endpoints[docsKeyVal].updatedAt,
        };
      }

      case 'upload-doc-asset': {
        requireAuth();
        requirePost(method);
        if (!file || typeof File === 'undefined' || !(file instanceof File)) {
          throw apiError('Choose an image to upload', 400);
        }
        var original = file.name || 'image';
        var ext = String(original.split('.').pop() || '').toLowerCase();
        var allowedImg = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
        if (allowedImg.indexOf(ext) === -1) {
          throw apiError('Upload a PNG, JPG, GIF, or WebP image', 400);
        }
        if (file.size > 5 * 1024 * 1024) {
          throw apiError('Image must be 5 MB or smaller', 400);
        }
        var imgName =
          'img' +
          new Date()
            .toISOString()
            .replace(/[-:TZ.]/g, '')
            .slice(0, 14) +
          Math.floor(Math.random() * 0xffff)
            .toString(16)
            .padStart(4, '0')
            .slice(-4) +
          '.' +
          ext;
        var imgPath = STORE_DOC_MEDIA + '/' + imgName;
        var imgBuf = await readFileAsArrayBuffer(file);
        await global.GitHubStore.putBinary(
          imgPath,
          global.GitHubStore.arrayBufferToBase64(imgBuf),
          'Upload doc asset ' + imgName
        );
        return {
          ok: true,
          url: STORE_DOC_MEDIA + '/' + imgName,
          filename: imgName,
        };
      }

      case 'upload-product-file': {
        requireAuth();
        requirePost(method);
        var productId = String(
          (body && body.productId) || (options.productId != null ? options.productId : '') || ''
        ).trim();
        if (!productId) throw apiError('Product is required', 400);
        if (!file || typeof File === 'undefined' || !(file instanceof File)) {
          throw apiError('Choose a document to upload', 400);
        }
        var docOriginal = file.name || 'document';
        var docExt = String(docOriginal.split('.').pop() || '').toLowerCase();
        var allowedDoc = [
          'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg',
          'gif', 'webp', 'txt', 'zip',
        ];
        if (allowedDoc.indexOf(docExt) === -1) {
          throw apiError('Upload a PDF, Office document, image, text, or ZIP file', 400);
        }
        if (file.size > 15 * 1024 * 1024) {
          throw apiError('Document must be 15 MB or smaller', 400);
        }
        var productsData5 = (await readJsonFile(PRODUCTS_FILE)) || { products: [], maps: {} };
        productsData5.products = flattenCatalog(productsData5.products || []);
        var found = -1;
        for (var pi = 0; pi < productsData5.products.length; pi++) {
          if (productsData5.products[pi] && productsData5.products[pi].id === productId) {
            found = pi;
            break;
          }
        }
        if (found < 0) throw apiError('Product not found', 404);
        var fileId =
          'file' +
          new Date()
            .toISOString()
            .replace(/[-:TZ.]/g, '')
            .slice(0, 14) +
          Math.floor(Math.random() * 0xffff)
            .toString(16)
            .padStart(4, '0')
            .slice(-4);
        var filename = fileId + '.' + docExt;
        var destPath = STORE_PRODUCT_FILES + '/' + filename;
        var docBuf = await readFileAsArrayBuffer(file);
        await global.GitHubStore.putBinary(
          destPath,
          global.GitHubStore.arrayBufferToBase64(docBuf),
          'Upload product file ' + filename
        );
        var entry = {
          id: fileId,
          name: docOriginal,
          filename: filename,
          url: STORE_PRODUCT_FILES + '/' + filename,
          size: file.size || 0,
          uploadedAt: isoNow(),
        };
        if (!Array.isArray(productsData5.products[found].files)) {
          productsData5.products[found].files = [];
        }
        productsData5.products[found].files.push(entry);
        productsData5.updatedAt = isoNow();
        await writeJsonFile(PRODUCTS_FILE, productsData5, 'Attach product file');
        return {
          ok: true,
          file: entry,
          files: productsData5.products[found].files,
          products: productsData5.products,
        };
      }

      case 'delete-product-file': {
        requireAuth();
        requirePost(method);
        var delProductId = String(body.productId || '').trim();
        var delFileId = String(body.fileId || '').trim();
        if (!delProductId || !delFileId) {
          throw apiError('Product and file are required', 400);
        }
        var productsData6 = (await readJsonFile(PRODUCTS_FILE)) || { products: [], maps: {} };
        productsData6.products = flattenCatalog(productsData6.products || []);
        var found2 = -1;
        for (var qi = 0; qi < productsData6.products.length; qi++) {
          if (productsData6.products[qi] && productsData6.products[qi].id === delProductId) {
            found2 = qi;
            break;
          }
        }
        if (found2 < 0) throw apiError('Product not found', 404);
        var keptFiles = [];
        var removedFile = null;
        (productsData6.products[found2].files || []).forEach(function (f) {
          if (f && f.id === delFileId) {
            removedFile = f;
            return;
          }
          keptFiles.push(f);
        });
        if (!removedFile) throw apiError('Document not found', 404);
        if (removedFile.filename) {
          await deletePath(
            STORE_PRODUCT_FILES + '/' + removedFile.filename,
            'Delete product file ' + removedFile.filename
          );
        }
        productsData6.products[found2].files = keptFiles;
        productsData6.updatedAt = isoNow();
        await writeJsonFile(PRODUCTS_FILE, productsData6, 'Remove product file');
        return {
          ok: true,
          files: keptFiles,
          products: productsData6.products,
        };
      }

      default:
        throw apiError('Unknown action', 404);
    }
  }

  async function resolveProxyUrl() {
    try {
      await global.GitHubStore.ensureConfig();
      var cfg = global.GitHubStore.getSiteConfig() || {};
      if (cfg.proxyUrl) return String(cfg.proxyUrl).trim();
    } catch (e) { /* ignore */ }

    var local = 'http://127.0.0.1:8787/';
    // Prefer a running local proxy for any origin (localhost, LAN, file://, Live Server).
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () {
        ctrl.abort();
      }, 900);
      var health = await fetch(local + 'health', { method: 'GET', cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (health.ok) return local;
    } catch (e2) { /* proxy not running */ }

    try {
      var host = (global.location && global.location.hostname) || '';
      var protocol = (global.location && global.location.protocol) || '';
      if (protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/i.test(host)) {
        return local;
      }
    } catch (e3) { /* ignore */ }
    return '';
  }

  async function proxyRequest(payload) {
    payload = payload || {};
    var url = String(payload.url || '').trim();
    var method = String(payload.method || 'GET').toUpperCase();
    var headersIn = payload.headers || {};
    var body = payload.body;
    if (!url || !/^https?:\/\//i.test(url)) {
      throw apiError('A valid http(s) URL is required. Set the host variable in Environment.', 400);
    }
    var allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    if (allowedMethods.indexOf(method) === -1) {
      throw apiError('Unsupported method', 400);
    }

    var proxyUrl = await resolveProxyUrl();
    if (proxyUrl) {
      try {
        var proxied = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: url,
            method: method,
            headers: headersIn,
            body: body,
          }),
        });
        var data = await proxied.json().catch(function () {
          return { error: 'Proxy error ' + proxied.status };
        });
        if (!proxied.ok && data.error && data.body == null) {
          throw apiError(data.error, proxied.status || 502);
        }
        return data;
      } catch (err) {
        if (err && err.status) throw err;
        var hint =
          'Proxy unreachable at ' +
          proxyUrl +
          '. Start it with: node proxy-server.js';
        throw apiError((err && err.message ? err.message + ' — ' : '') + hint, 502);
      }
    }

    var headers = {};
    if (headersIn && typeof headersIn === 'object') {
      if (Array.isArray(headersIn)) {
        headersIn.forEach(function (row) {
          if (!row) return;
          var name = String(row.key || row.name || '').trim();
          var val = row.value != null ? String(row.value) : '';
          if (name && !/[\r\n]/.test(name + val)) headers[name] = val;
        });
      } else {
        Object.keys(headersIn).forEach(function (key) {
          var name = String(key).trim();
          var val = String(headersIn[key] == null ? '' : headersIn[key]);
          if (name && !/[\r\n]/.test(name + val)) headers[name] = val;
        });
      }
    }
    var started = performance.now();
    var init = { method: method, headers: headers };
    if (body != null && body !== '' && method !== 'GET' && method !== 'HEAD') {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    try {
      var res = await fetch(url, init);
      var responseBody = await res.text();
      var headerMap = {};
      if (res.headers && typeof res.headers.forEach === 'function') {
        res.headers.forEach(function (value, key) {
          headerMap[key] = value;
        });
      }
      return {
        status: res.status,
        headers: headerMap,
        body: responseBody,
        timeMs: Math.round(performance.now() - started),
        size: responseBody.length,
      };
    } catch (err) {
      throw apiError(
        'Browser blocked the request (CORS). GitHub Pages cannot proxy APIs. ' +
          'Set proxyUrl in site-config.json (see proxy-worker.js) or run: node proxy-server.js',
        502
      );
    }
  }

  global.StaticAPI = {
    handle: handle,
    proxyRequest: proxyRequest,
    probeHosts: probeAllHosts,
    loadHostsPublic: loadHostsPublic,
  };
})(typeof window !== 'undefined' ? window : this);
