# Deployment

PawnGuard uses the same guarded Cloudflare pattern proven in PBN, with a separate Worker, D1 database and Access application.

## GitHub environments

Create `staging` and later `production` environments in the PawnGuard repository.

Required secret:
- `CLOUDFLARE_API_TOKEN` — scoped for Worker deploy, D1 and Cloudflare Access application/policy management.

Required variable:
- `CLOUDFLARE_ACCOUNT_ID`

Recommended variables:
- `PAWNGUARD_ACCESS_SOURCE_DOMAIN=pbn-staging.hm2krebsmatthewl.workers.dev`
- `PAWNGUARD_ACCESS_DOMAIN=pawnguard-staging.hm2krebsmatthewl.workers.dev`
- `CLOUDFLARE_ACCESS_TEAM_DOMAIN=buildbot-aoy-pages.cloudflareaccess.com`

The deployment workflow first reads the PBN Access application and clones its **allow** policy rules onto a new PawnGuard Access application. It deliberately does not clone bypass policies.

## What is and is not copied

Copied:
- policy include/exclude/require selectors
- session duration
- MFA configuration when present
- private Access posture

Not copied:
- API tokens
- GitHub secrets
- PBN D1 database
- PBN application data
- PBN Worker
- bypass policies

PBN itself is never mutated.

## Deployment sequence

1. CI typecheck/tests/dry run.
2. Verify Cloudflare token/account variable.
3. Create or resolve PawnGuard Access application.
4. Clone PBN allow policies to PawnGuard.
5. Read PawnGuard's newly generated Access AUD.
6. Create/resolve PawnGuard D1 database.
7. Apply D1 migrations.
8. Deploy Worker and static assets.
9. Cron runs daily at 03:17 UTC.
10. Bootstrap the first shop and Access identity using the operator-only script.

## First identity

Cloudflare Access authentication proves a JWT subject, but PawnGuard roles are never accepted from JWT claims. The verified issuer+subject must be explicitly mapped to an `actors` row.

Use `cloudflare/scripts/bootstrap-shop.mjs` with:
- `PAWNGUARD_AUTH_ISSUER`
- `PAWNGUARD_BOOTSTRAP_SUBJECT`
- shop/location variables as needed

Do not expose an unauthenticated "make me admin" route.

## Production gate

Do not call the service production-ready until:
- a real pawnshop pilot validates the intake workflow;
- an authorized stolen-property/reporting provider integration is contracted and tested;
- jurisdiction-specific legal review is complete;
- retention and incident-response controls are approved;
- backup/recovery tests pass;
- false-positive thresholds are validated on representative data.
