# StacksNRacks

Local AI hardware, priced this week: budget tiers for running LLMs at home, estimated tok/s per dollar, and a weekly newsletter.

Live: https://stacksnracks.technoir.cloud

- Zero dependencies, Node 24: `npm run dev`, then open http://localhost:3000
- Tier data and price sources: `data/tiers.json`
- Estimate model: `lib/estimate.js` (decode tok/s ≈ bandwidth × 0.6 ÷ model size)
- Submit a rig: open an issue with the **Submit a rig** template.

## Roadmap
v1 rigs explorer from submitted runs · v2 GitHub login + submit form · v3 `snr bench` CLI with verified runs · v4 automated used-price tracking.
