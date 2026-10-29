import { z } from "zod";

export const itemSchema=z.object({
  locationId:z.string().min(1),
  transactionId:z.string().min(1),
  category:z.string().min(1).max(120),
  manufacturer:z.string().max(120).optional(),
  model:z.string().max(120).optional(),
  serial:z.string().max(160).optional(),
  imei:z.string().max(32).optional(),
  vin:z.string().max(32).optional(),
  upc:z.string().max(32).optional(),
  description:z.string().max(2000).optional(),
  distinctiveMarks:z.string().max(2000).optional(),
  photoManifest:z.array(z.object({key:z.string(),sha256:z.string().optional()})).max(20).optional()
});

export const customerSchema=z.object({
  fullName:z.string().min(1).max(200),
  idType:z.string().max(80).optional(),
  idLast4:z.string().max(8).optional(),
  dateOfBirth:z.string().max(32).optional(),
  contact:z.record(z.string(),z.unknown()).optional()
});

export const transactionSchema=z.object({
  locationId:z.string().min(1),
  customerId:z.string().min(1),
  kind:z.enum(["pawn","purchase"]),
  amountCents:z.number().int().nonnegative().optional(),
  occurredAt:z.string().datetime().optional()
});

export const holdSchema=z.object({
  alertId:z.string().optional(),
  authorityType:z.enum(["internal_review","law_enforcement"]),
  agencyName:z.string().max(200).optional(),
  officerName:z.string().max(200).optional(),
  officerIdentifier:z.string().max(100).optional(),
  caseNumber:z.string().max(160).optional(),
  issuedAt:z.string().datetime().optional(),
  expiresAt:z.string().datetime().optional(),
  documentManifest:z.array(z.object({key:z.string(),sha256:z.string().optional()})).max(20).optional()
});

export const signalSchema=z.object({
  provider:z.string().min(1).max(120),
  providerRecordRef:z.string().min(1).max(200),
  authorityLevel:z.enum(["informational","authorized_feed","law_enforcement_report","law_enforcement_hold"]),
  caseNumber:z.string().max(160).optional(),
  category:z.string().max(120).optional(),
  manufacturer:z.string().max(120).optional(),
  model:z.string().max(120).optional(),
  serial:z.string().max(160).optional(),
  imei:z.string().max(32).optional(),
  vin:z.string().max(32).optional(),
  upc:z.string().max(32).optional(),
  description:z.string().max(4000).optional(),
  distinctiveMarks:z.string().max(4000).optional(),
  reportedAt:z.string().datetime()
});

