# Takaful Oman Insurance — API Collection Viewer

Static API playground and admin for Postman collections. Hosted on **GitHub Pages** (no PHP).

## Deploy on GitHub Pages

1. Push this repo to GitHub (`TakafulOmanIns/collection`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` publishes on every push to `main`.
4. Confirm `site-config.json` matches your repo:

```json
{
  "github": {
    "owner": "TakafulOmanIns",
    "repo": "collection",
    "branch": "main"
  }
}
```

Public site: `index.html`  
Admin: `admin.html`

## Admin saves (GitHub as the database)

Admin reads JSON from the site and **writes by committing** to the repo through the GitHub Contents API.

You need a [fine-grained personal access token](https://github.com/settings/tokens?type=beta) with **Contents: Read and write** on this repository only.

**Recommended (no token stored in the repo):**

1. Set the admin password to that PAT (or keep your password and use option 2).
2. Sign in on `admin.html` with username `admin` and the PAT as the password once you have updated `password_hash` to match — **or** keep your existing password and put the PAT in `admin-config.json` as `githubToken` (only do this if the Pages site is not public).

If you log in with a password that starts with `ghp_` / `github_pat_` / `gho_` / `ghu_`, it is kept in `sessionStorage` for that browser session and used for commits.

Existing login credentials from the PHP era still work (same bcrypt hash in `admin-config.json`).

## Local preview

Serve the folder over HTTP (browsers block `fetch` of local JSON from `file://`):

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/` and `http://localhost:8080/admin.html`.

Admin **saves** from localhost still commit to GitHub (same token rules). They do not write to your disk.

## Try-it / API calls

Takaful APIs do not send `Access-Control-Allow-Origin`, so the browser cannot call them directly from GitHub Pages. A small proxy is required (same role as the old `proxy.php`).

### Local

```bash
node proxy-server.js
```

Then open the site on `http://127.0.0.1:8080` (or any local static server). On localhost the app uses `http://127.0.0.1:8787/` automatically.

### GitHub Pages

1. Deploy the Cloudflare Worker once:

```bash
npx wrangler deploy proxy-worker.js --name collection-api-proxy --compatibility-date 2024-01-01
```

2. Put the worker URL in `site-config.json`:

```json
{
  "proxyUrl": "https://collection-api-proxy.<your-subdomain>.workers.dev"
}
```

3. Commit and push so Pages picks up the config.

## Host status cards

Hosts and related hosts are pinged **from the visitor’s browser** straight to the Oman endpoints (not via GitHub or the API proxy). Public IP is resolved in the browser via DNS-over-HTTPS; latency is measured from the customer’s network.

## Main files

| File | Role |
|------|------|
| `index.html` / `app.js` | Public playground |
| `admin.html` / `admin.js` | Admin UI |
| `static-api.js` | Replaces former PHP API |
| `github-store.js` | GitHub Contents API helper |
| `admin-config.json` | Admin username + password hash |
| `site-config.json` | GitHub owner / repo / branch |
| `products.json` | Product catalog |
| `collection/` | Active collection, envs, docs, hosts |

## License

© Takaful Oman Insurance SAOG. All rights reserved.
