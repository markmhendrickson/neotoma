#!/usr/bin/env bash
# One-time provisioning for the public sandbox deployment.
#
# Creates:
#   - neotoma-sandbox Fly app
#   - persistent_sandbox Fly volume (3 GB, single region)
#   - TLS cert for sandbox.neotoma.io
#   - Secrets expected by Phase 6 (abuse-report forwarding)
#
# Cloudflare DNS (CNAME sandbox -> neotoma-sandbox.fly.dev) must be configured
# separately via the Cloudflare dashboard or the existing scripts/cloudflare_* helpers.

set -euo pipefail

APP="${NEOTOMA_SANDBOX_FLY_APP:-neotoma-sandbox}"
REGION="${NEOTOMA_SANDBOX_REGION:-lhr}"
VOLUME_SIZE_GB="${NEOTOMA_SANDBOX_VOLUME_GB:-3}"
HOST="${NEOTOMA_SANDBOX_HOST:-sandbox.neotoma.io}"

echo "--- Creating Fly app ${APP} (region=${REGION}) ---"
if ! flyctl apps list | grep -q "^${APP}\b"; then
  flyctl apps create "${APP}"
else
  echo "App ${APP} already exists, skipping"
fi

echo "--- Creating Fly volume persistent_sandbox (${VOLUME_SIZE_GB} GB) ---"
if ! flyctl volumes list -a "${APP}" 2>/dev/null | grep -q "persistent_sandbox"; then
  flyctl volumes create persistent_sandbox \
    --region "${REGION}" \
    --size "${VOLUME_SIZE_GB}" \
    --yes \
    -a "${APP}"
else
  echo "Volume persistent_sandbox already exists, skipping"
fi

echo "--- Creating TLS cert for ${HOST} ---"
if ! flyctl certs list -a "${APP}" 2>/dev/null | grep -q "${HOST}"; then
  flyctl certs create "${HOST}" -a "${APP}"
else
  echo "Cert ${HOST} already exists"
fi

echo
echo "--- Next steps ---"
echo "1. Point Cloudflare DNS: CNAME ${HOST} -> ${APP}.fly.dev (DNS-only / gray cloud)"
echo "2. Populate abuse-report secrets (see docs/subsystems/sandbox_deployment.md):"
echo "     flyctl secrets set -a ${APP} \\"
echo "       NEOTOMA_SANDBOX_REPORT_FORWARD_URL=https://agent.neotoma.io/sandbox/report/submit \\"
echo "       NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER=<token>"
echo "3. Deploy: flyctl deploy -c fly.sandbox.toml"
echo "4. Weekly reset: add FLY_API_TOKEN repo secret and enable .github/workflows/sandbox-weekly-reset.yml (or run ./scripts/schedule_sandbox_reset.sh manually — uses fly ssh into the app machine; volumes cannot attach to a second Machine)."
echo "5. Verify: flyctl certs show ${HOST} -a ${APP}   # should be active+issued"
