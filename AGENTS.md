# stacksnracks
Local AI hardware tiers with tok/s per dollar, plus The Rack Report newsletter signup. Live: https://stacksnracks.technoir.cloud

## Commands
- Check (before every commit and deploy): `npm run check`
- Dev: `npm run dev`
- Deploy: `./scripts/deploy.sh`

## Non-negotiables
1. Every speed shown without a measured run is labelled an estimate; never present estimates as benchmarks. Trust is the product.
2. Every price carries a source link and a checked date (`data/tiers.json`); bump `updated` when you re-check prices.
3. Signups live only in the `stacksnracks-data` volume (`/data/subscribers.jsonl`), never in the repo. Export: `ssh hoid 'docker exec $(docker ps -qf name=stacksnracks) cat /data/subscribers.jsonl'`.
4. `/subscribe` stays rate-limited per IP (`lib/subscribe.js`).
