import { ApiError } from "./auth";
import { normalizeIdentifier, normalizeItem, scoreMatch, type SignalLike } from "./matching";
import type { Actor, MatchDisposition, NormalizedItem } from "./types";

export function id(prefix:string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function audit(
  db:D1Database,
  actor: Pick<Actor,"userId"|"shopId"> | null,
  eventType:string,
  entityType:string,
  entityId:string | null,
  correlationId:string,
  payload:unknown
) {
  await db.prepare(
    "INSERT INTO audit_events(shop_id,actor_user_id,event_type,entity_type,entity_id,occurred_at,correlation_id,payload) VALUES(?,?,?,?,?,?,?,?)"
  ).bind(
    actor?.shopId ?? null,
    actor?.userId ?? "system",
    eventType,
    entityType,
    entityId,
    new Date().toISOString(),
    correlationId,
    JSON.stringify(payload)
  ).run();
}

function resultRank(value:MatchDisposition) {
  return ({clear:0,review:1,possible_match:2,confirmed_hold:3})[value];
}

export async function screenItem(
  db:D1Database,
  shopId:string,
  itemId:string,
  mode:"intake"|"scheduled"|"feed_event"|"manual",
  correlationId:string
) {
  const item = await db.prepare(
    "SELECT * FROM inventory_items WHERE id=? AND shop_id=?"
  ).bind(itemId,shopId).first<Record<string,unknown>>();
  if (!item) throw new ApiError(404,"ITEM_NOT_FOUND","Inventory item not found.");

  const normalized:NormalizedItem = normalizeItem({
    category:String(item.category ?? ""),
    manufacturer:item.manufacturer ? String(item.manufacturer) : undefined,
    model:item.model ? String(item.model) : undefined,
    serial:item.serial_normalized ? String(item.serial_normalized) : undefined,
    imei:item.imei_normalized ? String(item.imei_normalized) : undefined,
    vin:item.vin_normalized ? String(item.vin_normalized) : undefined,
    upc:item.upc_normalized ? String(item.upc_normalized) : undefined,
    description:item.description ? String(item.description) : undefined,
    distinctiveMarks:item.distinctive_marks ? String(item.distinctive_marks) : undefined
  });

  const candidates = await db.prepare(
    `SELECT * FROM stolen_signals
     WHERE active=1 AND (
       (serial_normalized IS NOT NULL AND serial_normalized=?) OR
       (imei_normalized IS NOT NULL AND imei_normalized=?) OR
       (vin_normalized IS NOT NULL AND vin_normalized=?) OR
       (upc_normalized IS NOT NULL AND upc_normalized=?) OR
       (manufacturer IS NOT NULL AND model IS NOT NULL AND manufacturer=? AND model=?)
     )
     LIMIT 250`
  ).bind(
    normalized.serial ?? "",
    normalized.imei ?? "",
    normalized.vin ?? "",
    normalized.upc ?? "",
    normalized.manufacturer ?? "",
    normalized.model ?? ""
  ).all<SignalLike>();

  const runId=id("scr");
  const started=new Date().toISOString();
  await db.prepare(
    "INSERT INTO screening_runs(id,shop_id,item_id,mode,started_at) VALUES(?,?,?,?,?)"
  ).bind(runId,shopId,itemId,mode,started).run();

  const matches = candidates.results
    .map(signal=>({signal,...scoreMatch(normalized,signal)}))
    .filter(x=>x.disposition!=="clear")
    .sort((a,b)=>b.score-a.score);

  let overall:MatchDisposition="clear";
  for (const match of matches) {
    if (resultRank(match.disposition)>resultRank(overall)) overall=match.disposition;
    const severity=match.disposition==="confirmed_hold" ? "confirmed_hold" : match.disposition;
    const existing = await db.prepare("SELECT id FROM alerts WHERE item_id=? AND signal_id=?")
      .bind(itemId,match.signal.id).first<{id:string}>();
    if (!existing) {
      const alertId=id("alt");
      const createdAt=new Date().toISOString();
      await db.prepare(
        "INSERT INTO alerts(id,shop_id,item_id,signal_id,screening_run_id,severity,score,reason_json,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        alertId,shopId,itemId,match.signal.id,runId,severity,match.score,
        JSON.stringify(match.reasons),"open",createdAt
      ).run();
      await db.prepare(
        "INSERT INTO notifications(id,shop_id,alert_id,item_id,channel,subject,body,state,created_at) VALUES(?,?,?,?,?,?,?,?,?)"
      ).bind(
        id("ntf"),shopId,alertId,itemId,"in_app",
        severity==="confirmed_hold" ? "Property hold required" : "Property match requires review",
        JSON.stringify({severity,score:match.score,reasons:match.reasons,signalId:match.signal.id}),
        "delivered",createdAt
      ).run();
    }
  }

  if (overall==="confirmed_hold") {
    await db.prepare("UPDATE inventory_items SET status='hold',last_screened_at=? WHERE id=?")
      .bind(new Date().toISOString(),itemId).run();
  } else {
    await db.prepare("UPDATE inventory_items SET last_screened_at=? WHERE id=?")
      .bind(new Date().toISOString(),itemId).run();
  }

  await db.prepare(
    "UPDATE screening_runs SET completed_at=?,result=?,match_count=?,provider_summary=? WHERE id=?"
  ).bind(
    new Date().toISOString(),
    overall,
    matches.length,
    JSON.stringify([...new Set(matches.map(x=>String((x.signal as any).provider ?? "unknown")))]),
    runId
  ).run();

  await audit(db,{userId:"system",shopId},"screen.completed","inventory_item",itemId,correlationId,{
    mode,result:overall,matchCount:matches.length
  });

  return {runId,result:overall,matches:matches.map(x=>({
    signalId:x.signal.id,score:x.score,disposition:x.disposition,reasons:x.reasons
  }))};
}

export async function screenActiveInventory(db:D1Database,correlationId:string) {
  const items=await db.prepare(
    "SELECT id,shop_id FROM inventory_items WHERE status IN ('intake','active') ORDER BY COALESCE(last_screened_at,'') ASC LIMIT 1000"
  ).all<{id:string;shop_id:string}>();
  let scanned=0,alerts=0;
  for (const item of items.results) {
    const result=await screenItem(db,item.shop_id,item.id,"scheduled",correlationId);
    scanned++;
    alerts+=result.matches.length;
  }
  return {scanned,alerts};
}

export async function hashJson(value:unknown) {
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

export function identifiers(input:any) {
  return {
    serial: normalizeIdentifier(input.serial),
    imei: normalizeIdentifier(input.imei),
    vin: normalizeIdentifier(input.vin),
    upc: normalizeIdentifier(input.upc)
  };
}
