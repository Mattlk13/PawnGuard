# ForgeAI integration

PawnGuard can use ForgeAI for software assistance, normalization, research, and evidence summaries.

Adapter: `cloudflare/src/forgeai.ts`

Configure `FORGEAI_BASE_URL` and `FORGEAI_API_KEY` as protected server-side values.

ForgeAI must never determine or assert that an item is stolen. Stolen-property status must originate from an authorized authoritative source. AI may assist with matching explanations but cannot become the source of truth.
