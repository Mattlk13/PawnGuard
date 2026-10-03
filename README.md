# PawnGuard

PawnGuard is a Cloudflare-native pawn and secondhand inventory platform designed around two controls:

1. **Point-of-intake screening** against authorized stolen-property data sources.
2. **Continuous post-intake monitoring** so active inventory is rechecked when new stolen-property reports arrive.

> Status: active MVP build. PawnGuard is not an NCIC client and does not claim direct access to restricted law-enforcement systems. Production matching requires authorized provider or agency integrations.

## Core capabilities

- Pawn/purchase intake with serial, IMEI, VIN, model, UPC and distinctive-mark capture
- Item photos and immutable evidence metadata
- Risk result states: CLEAR, REVIEW, POSSIBLE_MATCH, CONFIRMED_HOLD
- Daily rescan of active inventory
- Immediate rescans when authorized stolen-property feeds are ingested
- Sale/release lock when an unresolved alert exists
- Law-enforcement hold workflow
- Append-only audit trail
- Multi-shop / multi-location RBAC
- Cloudflare Access authentication
- Cloudflare D1 persistence
- Cloudflare Workers scheduled scanning
- R2-ready evidence storage adapter
- Provider adapter boundary for LeadsOnline or other authorized systems

## Security model

PawnGuard copies the proven **permission/bootstrap pattern** from the owner's PBN project without modifying PBN:

- signed JWT / Cloudflare Access verification
- exact issuer and audience validation
- operator-provisioned user roles
- D1-backed authorization
- fail-closed protected APIs
- strict origin checks
- security headers
- append-only audit events
- deployment-time D1 provisioning
- private Cloudflare Access application bootstrap

## Important legal boundary

PawnGuard must never infer that a person committed theft. Matching is property-centric. A fuzzy or AI-assisted similarity score creates a **review alert**, not a criminal determination. A legal hold is represented separately and requires an authorized source or law-enforcement action.

See `docs/ARCHITECTURE.md`, `docs/INTEGRATIONS.md`, and `docs/LEGAL_COMPLIANCE.md`.
