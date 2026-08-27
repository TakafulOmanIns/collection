/**
 * Browser GitHub Contents API helper for static hosting.
 * Attach: window.GitHubStore
 */
(function (global) {
  'use strict';

  var SESSION_TOKEN_KEY = 'takaful_gh_token';
  var siteConfig = null;
  var adminConfig = null;
  var configPromise = null;
  var writeChain = Promise.resolve();

  function toBase64(str) {
    var bytes = new TextEncoder().encode(String(str));
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function withWriteLock(fn) {
    var run = writeChain.then(function () {
      return fn();
    });
    writeChain = run.then(
      function () {},
      function () {}
    );
    return run;
  }

  function apiBase() {
    var gh = (siteConfig && siteConfig.github) || {};
    var owner = gh.owner || 'TakafulOmanIns';
    var repo = gh.repo || 'collection';
    return 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/';
  }

  function branchName() {
    return ((siteConfig && siteConfig.github) || {}).branch || 'main';
  }

  function getToken() {
    try {
      var session = global.sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (session) return session;
    } catch (e) { /* ignore */ }
    if (adminConfig && adminConfig.githubToken) {
      return String(adminConfig.githubToken);
    }
    return '';
  }

  function setSessionToken(token) {
    try {
      if (token) {
        global.sessionStorage.setItem(SESSION_TOKEN_KEY, String(token));
      } else {
        global.sessionStorage.removeItem(SESSION_TOKEN_KEY);
      }
    } catch (e) { /* ignore */ }
  }

  function clearSession() {
    try {
      global.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  async function ensureConfig() {
    if (siteConfig && adminConfig) {
      return { siteConfig: siteConfig, adminConfig: adminConfig };
    }
    if (configPromise) return configPromise;
    configPromise = (async function () {
      var siteRes = await fetch('site-config.json', { cache: 'no-store' });
      if (!siteRes.ok) {
        throw new Error('Could not load site-config.json');
      }
      siteConfig = await siteRes.json();
      var adminRes = await fetch('admin-config.json', { cache: 'no-store' });
      if (!adminRes.ok) {
        throw new Error('Could not load admin-config.json');
      }
      adminConfig = await adminRes.json();
      return { siteConfig: siteConfig, adminConfig: adminConfig };
    })();
    try {
      return await configPromise;
    } catch (err) {
      configPromise = null;
      throw err;
    }
  }

  function setAdminConfigCache(cfg) {
    adminConfig = cfg;
  }

  async function getJson(path) {
    var res = await fetch(String(path).replace(/^\//, ''), { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error('Failed to read ' + path + ' (' + res.status + ')');
    }
    var text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  async function getRemoteSha(path) {
    var token = getToken();
    if (!token) return null;
    await ensureConfig();
    var url = apiBase() + String(path).replace(/^\//, '') + '?ref=' + encodeURIComponent(branchName());
    var res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      var errBody = await res.text();
      throw new Error('GitHub GET failed for ' + path + ': ' + (errBody || res.status));
    }
    var data = await res.json();
    return data && data.sha ? data.sha : null;
  }

  async function putJson(path, data, message) {
    var json = JSON.stringify(data, null, 2);
    return putBinary(path, toBase64(json), message || ('Update ' + path));
  }

  async function putBinary(path, base64Content, message) {
    return withWriteLock(async function () {
      await ensureConfig();
      var token = getToken();
      if (!token) {
        throw new Error('GitHub token required to save changes. Log in with a PAT or set githubToken in admin-config.json.');
      }
      var cleanPath = String(path).replace(/^\//, '');
      var sha = await getRemoteSha(cleanPath);
      var body = {
        message: message || ('Update ' + cleanPath),
        content: base64Content,
        branch: branchName(),
      };
      if (sha) body.sha = sha;
      var res = await fetch(apiBase() + cleanPath, {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        var errText = await res.text();
        var err;
        try {
          err = JSON.parse(errText);
        } catch (e) {
          err = null;
        }
        throw new Error((err && err.message) || errText || ('GitHub PUT failed for ' + cleanPath + ' (' + res.status + ')'));
      }
      return res.json();
    });
  }

  async function deleteFile(path, message) {
    return withWriteLock(async function () {
      await ensureConfig();
      var token = getToken();
      if (!token) {
        throw new Error('GitHub token required to delete files.');
      }
      var cleanPath = String(path).replace(/^\//, '');
      var sha = await getRemoteSha(cleanPath);
      if (!sha) return false;
      var res = await fetch(apiBase() + cleanPath, {
        method: 'DELETE',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message || ('Delete ' + cleanPath),
          sha: sha,
          branch: branchName(),
        }),
      });
      if (!res.ok) {
        var errText = await res.text();
        throw new Error(errText || ('GitHub DELETE failed for ' + cleanPath));
      }
      return true;
    });
  }

  async function putFiles(files, message) {
    var results = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.base64Content != null) {
        results.push(await putBinary(f.path, f.base64Content, message || f.message));
      } else {
        results.push(await putJson(f.path, f.data, message || f.message));
      }
    }
    return results;
  }

  global.GitHubStore = {
    ensureConfig: ensureConfig,
    getJson: getJson,
    putJson: putJson,
    putBinary: putBinary,
    putFiles: putFiles,
    deleteFile: deleteFile,
    getToken: getToken,
    setSessionToken: setSessionToken,
    clearSession: clearSession,
    setAdminConfigCache: setAdminConfigCache,
    toBase64: toBase64,
    arrayBufferToBase64: arrayBufferToBase64,
    getAdminConfig: function () {
      return adminConfig;
    },
    getSiteConfig: function () {
      return siteConfig;
    },
  };
})(typeof window !== 'undefined' ? window : this);
