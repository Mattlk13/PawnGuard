# PawnGuard MVP API

All `/v1/*` endpoints require a verified bearer JWT or Cloudflare Access assertion and an operator-provisioned actor.

## Identity
- `GET /v1/me`

## Customers and transactions
- `POST /v1/customers`
- `POST /v1/transactions`

## Inventory
- `POST /v1/inventory/intake` — creates item and immediately screens it
- `GET /v1/inventory`
- `POST /v1/inventory/:id/screen`
- `POST /v1/inventory/:id/holds`

## Alerts
- `GET /v1/alerts`
- `POST /v1/alerts/:id/acknowledge`

## Authorized stolen-property signals
- `POST /v1/signals` — compliance/admin only

Signal authority levels:
- `informational`
- `authorized_feed`
- `law_enforcement`

Only a high-confidence match to a signal explicitly classified as `law_enforcement` can yield `confirmed_hold` from the automatic matcher. Descriptive/fuzzy similarity alone cannot.

## Scheduled operation

The Cloudflare Cron Trigger re-screens active inventory daily. Signal ingestion also initiates a rescan immediately, making the daily run a safety net rather than the only detection path.
