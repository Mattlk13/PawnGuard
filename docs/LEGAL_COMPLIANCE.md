# Legal and compliance design notes

This file is an engineering requirements register, not legal advice.

## Missouri baseline researched for the MVP

Missouri RSMo 367.031 provides for electronic transmission of reportable pawn/purchase data to a qualifying third-party database and requires licensed pawnbrokers to transmit reportable data for a business day by the end of the following business day.

Missouri RSMo 367.055 describes law-enforcement hold orders and requires identifying details including the pawnbroker, shop, issuing officer/agency, case information, complete property description including model/serial numbers, and hold expiration.

Missouri RSMo 367.044 contains additional rules around property claimed as misappropriated.

Primary references:
- https://www.revisor.mo.gov/main/OneSection.aspx?section=367.031
- https://revisor.mo.gov/main/OneSection.aspx?section=367.055
- https://www.revisor.mo.gov/main/OneSection.aspx?section=367.044

## Product rules derived from that research

1. Never label a customer a thief from a software match.
2. Keep internal review alerts distinct from law-enforcement holds.
3. Preserve the source and authority level of every stolen-property signal.
4. Record hold issuance and expiration explicitly.
5. Keep a tamper-resistant audit history of alert acknowledgement and disposition.
6. Allow jurisdiction-specific retention/reporting modules instead of hard-coding Missouri rules nationally.
7. Store only data necessary for the transaction, matching, compliance and evidence workflow.
8. Encrypt sensitive data at rest/in transit using platform-supported controls and restrict access by role/location.
9. Do not expose cross-shop customer identity data merely because a similar item appears elsewhere.

## Before production launch

Obtain counsel/compliance review for every target jurisdiction and provider agreement. Verify pawn/secondhand reporting fields, hold periods, privacy rules, permitted searches, retention, breach requirements and customer-access obligations.
