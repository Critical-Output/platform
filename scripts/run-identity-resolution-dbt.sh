#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${DBT_PROJECT_DIR:-clickhouse/dbt_identity}"

# Batch identity resolution models (intended for a 15-minute scheduler).
dbt run \
  --project-dir "$PROJECT_DIR" \
  --select identity_alias_candidates identity_customer_profiles identity_resolved_events
