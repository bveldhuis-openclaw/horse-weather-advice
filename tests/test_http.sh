#!/usr/bin/env bash
set -euo pipefail
# Simple HTTP smoke tests against localhost:8080
BASE_URL=${BASE_URL:-http://localhost:8080}
# wait for server up
for i in {1..20}; do
  if curl -sSf "$BASE_URL/" >/dev/null 2>&1; then
    break
  fi
  echo "waiting for server... ($i)"
  sleep 1
done
# fetch index
HTML=$(curl -sSf "$BASE_URL/")
# checks
echo "$HTML" | grep -q "Horse Weather Advice" || (echo "Missing title" && exit 2)
echo "$HTML" | grep -q "forecastChart" || (echo "Missing canvas id forecastChart" && exit 3)
echo "$HTML" | grep -q "manifest.json" || (echo "Missing manifest link" && exit 4)
# basic success
echo "HTTP smoke tests passed"
