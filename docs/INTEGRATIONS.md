# Integrations and data-source strategy

## Critical boundary

PawnGuard does **not** claim direct NCIC access and must not scrape or bypass law-enforcement-only systems.

Production stolen-property checking must use authorized contracts, feeds, APIs, or agency workflows.

## Priority integrations

### LeadsOnline

LeadsOnline is a primary commercial/agency integration target because it supports electronic reporting by pawn and secondhand businesses and law-enforcement workflows around secondhand transaction data.

References:
- https://www.leadsonline.com/leads/reg/add-your-business/terms-and-conditions/index.html
- https://www.leadsonline.com/main/registration/terms-and-conditions-non-lea.php

Implementation posture:
- build a provider adapter only after obtaining approved technical documentation and credentials;
- keep transaction reporting and stolen-property response semantics separate;
- never assume a business reporting account grants law-enforcement search rights.

### Local / state law enforcement

PawnGuard should support agency-approved inbound signals and hold orders with:
- agency name
- officer identity/identifier
- case number
- item description
- model/serial identifiers
- issued and expiration times
- attached hold document hash/object reference

### Merchant reporting/export

Add jurisdiction-specific exports without representing them as universal compliance.

## Provider adapter contract

Each provider connector should normalize into `stolen_signals` with:
- provider
- provider record reference
- authority level
- case number when authorized
- identifiers
- descriptive fields
- reported timestamp
- source receipt timestamp
- source payload SHA-256
- active/revoked state

## Event-driven monitoring

When a newly received stolen-property signal is ingested, PawnGuard immediately re-screens active inventory. The scheduled job remains as a backstop for missed or delayed events.
