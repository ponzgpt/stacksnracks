# stacksnracks
Local AI hardware tiers with tok/s per dollar, community rigs with llama-bench runs, and The Rack Report signup. Live: https://stacksnracks.technoir.cloud

## Commands
- Check (before every commit and deploy): `npm run check`
- Dev: `npm run dev` (rigs come from live GitHub issues; set `RIGS_URL` to a local JSON file for fixtures)
- Deploy: `./scripts/deploy.sh`; GitHub creds: `./scripts/set-github-key.sh oauth|token`

## Non-negotiables
1. Every speed shown without a measured run is labelled an estimate; never present estimates as benchmarks. Trust is the product.
2. Every price carries a source link and a checked date (`data/tiers.json`); bump `updated` when you re-check prices.
3. Signups live only in the `stacksnracks-data` volume (`/data/subscribers.jsonl`), never in the repo. Export: `ssh hoid 'docker exec $(docker ps -qf name=stacksnracks) cat /data/subscribers.jsonl'`.
4. `/subscribe` stays rate-limited per IP (`lib/subscribe.js`).
5. A rig is public only once its issue has both `rig` and `approved` labels: labelling is the moderation step. The site re-reads issues every 10 min (unauthenticated API, 60 calls/h per IP) and serves `/data/rigs.json` if GitHub is down.
6. Sign-in uses no OAuth scopes and keeps only `{login, id}` in a signed cookie; never store GitHub tokens or emails. `/data/session.key` signs sessions: deleting it signs everyone out.
7. `GITHUB_TOKEN` is a fine-grained token for this repo only (Issues: read & write). Site submissions are filed as the owner, so `lib/rigs.js` trusts "Submitted by" only on owner-filed issues.
8. OAuth App callback URL must be `https://stacksnracks.technoir.cloud/auth/callback` (`SITE_URL` + `/auth/callback`).
