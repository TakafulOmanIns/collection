# Takaful Oman Insurance — API Collection Viewer

Interactive API documentation and playground for Takaful Oman Insurance SAOG Postman collections.

## Hosting modes

### GitHub Pages (static — public playground)

GitHub Pages cannot run PHP. The public site (`index.html`) is adapted for static hosting:

| Feature | On GitHub Pages |
|---|---|
| Browse products / endpoints / docs | Works |
| Environment drawer (`localStorage`) | Works |
| Host Online/Offline status | Works via browser reachability + DNS IP |
| Admin (`admin.html`) | Not available (needs PHP) |
| Send Request (API tester) | Works only if the target API allows CORS from your Pages origin |
| Collection / product editing | Keep using XAMPP or PHP hosting, then commit published JSON |

**Enable Pages:** Repo → Settings → Pages → Source: Deploy from branch → `main` / root (or `/docs` if you prefer). The repo includes `.nojekyll` so GitHub does not process the site with Jekyll.

Public URL is typically:

`https://<org-or-user>.github.io/collection/`

### XAMPP / PHP hosting (full features)

Place the project under `htdocs` (e.g. `C:\xampp\htdocs\api_collection\`) and open:

`http://localhost/api_collection/`

This enables:

- `admin-api.php` — login, uploads, products, docs, host settings
- Server-side host probing (cURL)
- `proxy.php` — Send Request without browser CORS limits

See `COLLECTION_SETUP.md` for Postman export steps.

## How host status works

1. **With PHP:** `admin-api.php?action=host-status` probes each URL with cURL and resolves IP via `gethostbyname`.
2. **Without PHP (GitHub Pages):** `static-runtime.js` loads `collection/hosts.json`, resolves A records via Cloudflare DNS-over-HTTPS, and checks reachability from the browser (`fetch`, including `no-cors` when CORS is blocked).

Host list source: `collection/hosts.json` (editable in Admin → Host Settings when on PHP).

## Send Request on GitHub Pages

Without `proxy.php`, the browser calls APIs directly. If you see a CORS error, either:

- Allow your GitHub Pages origin on the API, or
- Run the playground on XAMPP/PHP so `proxy.php` can forward the request.

## Security note

`collection/env-values.json` and environment files may contain credentials. Do not publish a **public** Pages site or public repo with live secrets. Prefer empty/placeholder values in git and fill them locally via the Environment drawer, or keep the repo private.

## Main files

```
├── index.html              # Public playground
├── app.js
├── static-runtime.js       # GitHub Pages / no-PHP helpers
├── admin.html / admin.js   # Admin CMS (PHP required)
├── admin-api.php           # Admin + host-status API
├── proxy.php               # CORS bypass for Send
├── products.json
├── collection/
│   ├── active.json         # Published collection for the playground
│   ├── hosts.json          # Monitored hosts
│   ├── env-values.json
│   └── docs/pages.json
└── .nojekyll               # Required for GitHub Pages
```

## License

© Takaful Oman Insurance SAOG. All rights reserved.
