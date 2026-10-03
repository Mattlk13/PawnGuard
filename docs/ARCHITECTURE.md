# PawnGuard architecture

## Product thesis

PawnGuard is not just a pawn POS. Its defining control is **continuous property screening**:

1. Screen an item during pawn/purchase intake.
2. Keep the item in a monitored inventory state.
3. Re-screen active inventory on a schedule and when new authorized stolen-property signals arrive.
4. Convert matches into a review queue or an authority-backed hold workflow.

## Cloudflare deployment

- Cloudflare Worker: protected API and static dashboard
- D1: shops, users, transactions, inventory, signals, screening runs, alerts, holds and audit
- Static Assets: dashboard
- Cron Trigger: daily re-screen
- Cloudflare Access: private authentication boundary
- R2: planned evidence/photo/document storage adapter
- Queues: planned provider-feed fanout for high-volume deployments

## Security patterns reused from the owner's repositories

The implementation intentionally reuses patterns rather than copying application-specific business logic:

- **PBN**: signed JWT / Cloudflare Access verification, exact issuer/audience validation, D1 migrations, generated deployment config, append-only audit, correlation IDs, fail-closed identity.
- **PackForge**: private Cloudflare Access release posture and guarded deployment.
- **CivicAccess-AI**: D1 migration / dry-run deployment gates.
- **FieldProof**: separation of deployment readiness from public routing.
- **BetForge-AI**: documented Cloudflare Access bearer/assertion pattern.

PBN is not modified by PawnGuard.

## Match model

Identifiers are normalized to uppercase alphanumeric values. Exact matches receive the greatest weight:

- serial number
- IMEI / MEID-compatible identifier
- VIN
- UPC (lower evidentiary strength than a unique serial)

Secondary signals can increase a review score:

- manufacturer
- model
- distinctive markings
- description token overlap

A fuzzy/descriptive score alone is never treated as a law-enforcement hold.

## Alert states

- clear
- review
- possible_match
- confirmed_hold

A confirmed hold requires both high match confidence and an input classified as `law_enforcement`. Production integrations must map provider semantics conservatively.

## Scale path

The MVP performs indexed candidate selection and bounded scans. Production scale should add:

- provider-specific ingestion queues
- per-identifier lookup tables
- incremental scans keyed to newly-arrived signals
- Durable Objects only where single-writer coordination is demonstrably needed
- R2 object manifests with immutable hashes
- retention policies per jurisdiction
- event export to a SIEM / durable audit store
