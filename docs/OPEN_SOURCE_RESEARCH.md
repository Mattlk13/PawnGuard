# Open-source and repository research

Research date: 2026-10-03.

## Owner repository patterns selected

### Mattlk13/PBN
Selected:
- Cloudflare Access JWT/JWKS verification
- operator-provisioned roles
- exact-origin CORS
- D1 deployment-time provisioning
- migration-before-deploy
- append-only audit concepts
- fail-closed authentication

### Mattlk13/PackForge
Selected:
- private release posture
- Cloudflare Access protection for all API paths
- generated Wrangler deployment configuration

### Mattlk13/CivicAccess-AI
Selected:
- migration/typecheck/dry-run deployment gates
- architecture decision documentation style

### Mattlk13/Fieldproof-JobMargin
Selected:
- explicit distinction between staging readiness and public routing

### Mattlk13/BetForge-AI
Selected:
- Access assertion / bearer verification concept

## Public open-source projects reviewed

### Open Source Point of Sale
Repository: https://github.com/opensourcepos/opensourcepos

Useful ideas:
- stock management
- transaction logging
- customers/suppliers
- barcode workflows
- multi-user permissions
- reporting

Decision: **reference workflows, do not import code in this MVP.** Its license includes attribution/footer conditions that should be reviewed before any direct reuse.

### Posnic POS
Repository: https://github.com/Posnic/POS

Useful ideas:
- offline-first retail operation
- barcode hardware
- multi-branch stock
- staff permissions

Decision: no code import. Posnic is AGPL-3.0-only and direct reuse could impose obligations incompatible with the current product plan.

### Snipe-IT
Repository: https://github.com/grokability/snipe-it

Useful ideas:
- asset custody
- serial/asset identifiers
- status history
- role-based workflows

Decision: architecture/reference only for now.

### ZXing / zxing-js
Repositories:
- https://github.com/zxing/zxing
- https://github.com/zxing-js/library

Useful capability:
- barcode / QR / UPC decoding.

Decision: candidate for a future intake-camera module after current maintenance status and Apache-2.0 obligations are reviewed.

## What is intentionally not reused

- No restricted stolen-property database scraper.
- No law-enforcement credential proxy.
- No copied NCIC interface.
- No third-party code copied into PawnGuard without license review.
- No AI model is allowed to turn descriptive similarity alone into a criminal accusation or legal hold.

## Next open-source lanes

- OCR: serial/model text extraction from intake photos
- image embeddings: distinctive-mark similarity
- receipt/label printing
- offline intake queue for internet outages
- PWA camera barcode capture
- evidence bundle generation
