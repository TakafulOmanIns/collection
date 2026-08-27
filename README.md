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

There is no server-side CORS proxy anymore. The playground calls APIs **directly from the browser**. Target APIs must allow CORS from your Pages origin (or be same-site). If a call fails with a network/CORS error, enable CORS on that API or use a private proxy you control.

## Host status cards

Status checks run in the browser (`no-cors` probes). You get online/offline and latency; public IP and HTTP status codes are not available without a server.

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
