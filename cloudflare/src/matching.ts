import type { MatchDisposition, NormalizedItem } from "./types";

export function normalizeIdentifier(value?: string | null): string | undefined {
  const normalized = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g,"").trim();
  return normalized || undefined;
}

export function normalizeText(value?: string | null): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();
}

export function normalizeItem(item: NormalizedItem): NormalizedItem {
  return {
    ...item,
    category: normalizeText(item.category),
    manufacturer: normalizeText(item.manufacturer),
    model: normalizeText(item.model),
    serial: normalizeIdentifier(item.serial),
    imei: normalizeIdentifier(item.imei),
    vin: normalizeIdentifier(item.vin),
    upc: normalizeIdentifier(item.upc),
    description: normalizeText(item.description),
    distinctiveMarks: normalizeText(item.distinctiveMarks)
  };
}

export interface SignalLike {
  id: string;
  authority_level: "informational" | "authorized_feed" | "law_enforcement_report" | "law_enforcement_hold";
  category?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_normalized?: string | null;
  imei_normalized?: string | null;
  vin_normalized?: string | null;
  upc_normalized?: string | null;
  description?: string | null;
  distinctive_marks?: string | null;
}

export interface MatchResult {
  signalId: string;
  score: number;
  disposition: MatchDisposition;
  reasons: string[];
}

function tokenSet(value?: string | null) {
  return new Set(normalizeText(value).split(" ").filter(x=>x.length >= 3));
}
function overlap(a?: string | null,b?: string | null) {
  const aa = tokenSet(a), bb = tokenSet(b);
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  for (const x of aa) if (bb.has(x)) common++;
  return common / Math.max(aa.size,bb.size);
}

export function scoreMatch(item: NormalizedItem, signal: SignalLike): MatchResult {
  const n = normalizeItem(item);
  const reasons:string[] = [];
  let score = 0;

  const exact = [
    ["serial",n.serial,signal.serial_normalized],
    ["IMEI",n.imei,signal.imei_normalized],
    ["VIN",n.vin,signal.vin_normalized],
    ["UPC",n.upc,signal.upc_normalized]
  ] as const;

  for (const [label,a,b] of exact) {
    if (a && b && a === normalizeIdentifier(b)) {
      score = Math.max(score, label === "UPC" ? 72 : 98);
      reasons.push(`exact ${label} match`);
    }
  }

  if (n.manufacturer && signal.manufacturer && n.manufacturer === normalizeText(signal.manufacturer)) {
    score += 8; reasons.push("manufacturer match");
  }
  if (n.model && signal.model && n.model === normalizeText(signal.model)) {
    score += 12; reasons.push("model match");
  }
  const marks = overlap(n.distinctiveMarks,signal.distinctive_marks);
  if (marks >= .5) { score += Math.round(marks*20); reasons.push("distinctive-mark similarity"); }
  const description = overlap(n.description,signal.description);
  if (description >= .6) { score += Math.round(description*12); reasons.push("description similarity"); }

  score = Math.min(100,score);
  let disposition:MatchDisposition = "clear";
  if (score >= 95 && signal.authority_level === "law_enforcement_hold") disposition = "confirmed_hold";
  else if (score >= 80) disposition = "possible_match";
  else if (score >= 55) disposition = "review";

  return {signalId:signal.id,score,disposition,reasons};
}
