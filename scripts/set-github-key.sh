#!/usr/bin/env bash
# Set GitHub credentials on the production service without them touching disk, shell history or chat.
# Usage: ./scripts/set-github-key.sh oauth   → OAuth App client id + secret (enables "Sign in with GitHub")
#        ./scripts/set-github-key.sh token   → fine-grained token, this repo only, Issues: read & write (enables on-site submit)
set -euo pipefail
HOST=${HOST:-hoid}
APP=stacksnracks
case "${1:-}" in
  oauth) VARS=(GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET) ;;
  token) VARS=(GITHUB_TOKEN) ;;
  *) echo "usage: $0 oauth|token" >&2; exit 1 ;;
esac
VALUES=()
for VAR in "${VARS[@]}"; do
  read -rs -p "$VAR: " V; echo
  [ -n "$V" ] || { echo "empty $VAR" >&2; exit 1; }
  VALUES+=("$V")
done
# Values travel over ssh stdin, one per line, not argv, so they never show up in `ps` on either machine.
printf '%s\n' "${VALUES[@]}" | ssh "$HOST" "args=(); for VAR in ${VARS[*]}; do read -r V; args+=(--env-add \"\$VAR=\$V\"); done; docker service update --quiet \"\${args[@]}\" $APP"
echo "✓ ${VARS[*]} set on $APP (the service restarts)"
