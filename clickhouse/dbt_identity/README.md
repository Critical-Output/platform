# Identity Resolution dbt Project

Implements WO-2026-008 identity stitching in ClickHouse.

## Models

- `identity_alias_candidates`: deterministic + probabilistic anonymous -> canonical user mapping.
- `identity_customer_profiles`: admin-friendly profile of all identifiers linked to each canonical user.
- `identity_resolved_events`: event-level canonical user backfill for anonymous events.

## Deterministic vs probabilistic

- Deterministic methods use confidence `1.0` (`deterministic_login`, `deterministic_email`, `deterministic_phone`).
- Probabilistic device-fingerprint matching uses confidence `0.8` (`probabilistic_device_fingerprint`).

To disable probabilistic matching (WO stop condition for >5% false merges):

```bash
dbt run --project-dir clickhouse/dbt_identity --vars '{"enable_probabilistic_matching": false}'
```

## Run

```bash
dbt run --project-dir clickhouse/dbt_identity --select identity_alias_candidates identity_customer_profiles identity_resolved_events
```

## 15-minute schedule

Example cron entry:

```cron
*/15 * * * * cd /path/to/repo && dbt run --project-dir clickhouse/dbt_identity --select identity_alias_candidates identity_customer_profiles identity_resolved_events >> /var/log/pcc-identity-dbt.log 2>&1
```
