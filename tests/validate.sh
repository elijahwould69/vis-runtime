#!/bin/sh
set -eu

FILE="src/index.js"

echo "VIS V1.6 validation starting"

test -f "$FILE"
test -f "wrangler.jsonc"
test -f "package.json"

grep -q 'version: "1.6.0"' "$FILE"
grep -q 'paidSpendingEnabled: false' "$FILE"
grep -q 'autonomousSpendLimitUSD: 0' "$FILE"
grep -q 'SLACK_BOT_TOKEN' "$FILE"
grep -q 'VIS_ADMIN_KEY' "$FILE"
grep -q 'X-VIS-Admin-Key' "$FILE"
grep -q 'async function ensureSchema' "$FILE"
grep -q 'async function runSensors' "$FILE"
grep -q 'async function scoutSignals' "$FILE"
grep -q 'const ATLAS_SYSTEM' "$FILE"
grep -q 'const VECTOR_SYSTEM' "$FILE"
grep -q 'async function runVIS' "$FILE"
grep -q '/admin/status' "$FILE"
grep -q '/admin/test-ai' "$FILE"
grep -q '/admin/repair-schema' "$FILE"
grep -q '/admin/run' "$FILE"
grep -q 'async scheduled' "$FILE"

if grep -q 'paidSpendingEnabled: true' "$FILE"; then
  echo "FAIL: paid spending enabled"
  exit 1
fi

echo "PASS: V1.6 structural safeguards present"
