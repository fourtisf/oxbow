# infra

Deployment config for the Hostinger VPS, added in M6:

- `nginx/oxbow.conf`: `example.com` → :3000, `api.example.com` → :4000, SSE settings for `/api/activity/stream`, and the visitor-country header for the region notice (`GEO_COUNTRY_HEADER`, set from GeoIP2 and never passed through from the client).
- `ecosystem.config.js`: PM2 apps `oxbow-web`, `oxbow-api`, `oxbow-worker`.
