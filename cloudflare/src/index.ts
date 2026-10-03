import { z } from "zod";
import { ApiError, authenticate, requireRole } from "./auth";
import { normalizeText } from "./matching";
import { audit, hashJson, id, identifiers, screenActiveInventory, screenItem } from "./store";
import type { Env } from "./types";

const itemSchema=z.object({
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

const customerSchema=z.object({
  fullName:z.string().min(1).max(200),
  idType:z.string().max(80).optional(),
  idLast4:z.string().max(8).optional(),
  dateOfBirth:z.string().max(32).optional(),
  contact:z.record(z.unknown()).optional()
});

const transactionSchema=z.object({
  locationId:z.string().min(1),
  customerId:z.string().min(1),
  kind:z.enum(["pawn","purchase"]),
  amountCents:z.number().int().nonnegative().optional(),
  occurredAt:z.string().datetime().optional()
});

const holdSchema=z.object({
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

const signalSchema=z.object({
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

function cid(req?:Request) {
  return req?.headers.get("x-correlation-id") || crypto.randomUUID();
}
function json(body:unknown,status=200,correlationId?:string) {
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      ...(correlationId?{"x-correlation-id":correlationId}:{})
    }
  });
}
function errorResponse(error:unknown,correlationId:string) {
  if (error instanceof ApiError) return json({error:{code:error.code,message:error.message},correlationId},error.status,correlationId);
  if (error instanceof z.ZodError) return json({error:{code:"INVALID_INPUT",message:"Request validation failed.",issues:error.issues},correlationId},400,correlationId);
  console.error(error);
  return json({error:{code:"INTERNAL_ERROR",message:"Unexpected server error."},correlationId},500,correlationId);
}
async function body(req:Request) {
  const len=Number(req.headers.get("content-length") || 0);
  if (len>128_000) throw new ApiError(413,"PAYLOAD_TOO_LARGE","Request exceeds 128KB.");
  return req.json();
}

async function api(req:Request,env:Env) {
  const correlationId=cid(req);
  const actor=await authenticate(req,env);
  const url=new URL(req.url);
  const key=`${req.method} ${url.pathname}`;

  if (key==="GET /v1/me") return json({data:actor,correlationId},200,correlationId);

  if (key==="POST /v1/customers") {
    requireRole(actor,["clerk","manager","compliance","admin"]);
    const input=customerSchema.parse(await body(req));
    const customerId=id("cus");
    await env.PAWNGUARD_DB.prepare(
      "INSERT INTO customers(id,shop_id,full_name,id_type,id_last4,date_of_birth,contact_json) VALUES(?,?,?,?,?,?,?)"
    ).bind(
      customerId,actor.shopId,input.fullName,input.idType??null,input.idLast4??null,
      input.dateOfBirth??null,input.contact?JSON.stringify(input.contact):null
    ).run();
    await audit(env.PAWNGUARD_DB,actor,"customer.created","customer",customerId,correlationId,{});
    return json({data:{customerId},correlationId},201,correlationId);
  }

  if (key==="POST /v1/transactions") {
    requireRole(actor,["clerk","manager","compliance","admin"]);
    const input=transactionSchema.parse(await body(req));
    if (!actor.locationIds.includes(input.locationId) && actor.role!=="admin")
      throw new ApiError(403,"LOCATION_DENIED","You are not assigned to this location.");
    const customer=await env.PAWNGUARD_DB.prepare(
      "SELECT id FROM customers WHERE id=? AND shop_id=?"
    ).bind(input.customerId,actor.shopId).first();
    if (!customer) throw new ApiError(404,"CUSTOMER_NOT_FOUND","Customer not found.");
    const txId=id("txn");
    await env.PAWNGUARD_DB.prepare(
      "INSERT INTO transactions(id,shop_id,location_id,customer_id,kind,status,amount_cents,occurred_at,created_by) VALUES(?,?,?,?,?,'draft',?,?,?)"
    ).bind(
      txId,actor.shopId,input.locationId,input.customerId,input.kind,input.amountCents??null,
      input.occurredAt??new Date().toISOString(),actor.userId
    ).run();
    await audit(env.PAWNGUARD_DB,actor,"transaction.created","transaction",txId,correlationId,{kind:input.kind});
    return json({data:{transactionId:txId,status:"draft"},correlationId},201,correlationId);
  }

  if (key==="POST /v1/inventory/intake") {
    requireRole(actor,["clerk","manager","compliance","admin"]);
    const input=itemSchema.parse(await body(req));
    if (!actor.locationIds.includes(input.locationId) && actor.role!=="admin")
      throw new ApiError(403,"LOCATION_DENIED","You are not assigned to this location.");
    const tx=await env.PAWNGUARD_DB.prepare(
      "SELECT id FROM transactions WHERE id=? AND shop_id=? AND location_id=?"
    ).bind(input.transactionId,actor.shopId,input.locationId).first();
    if (!tx) throw new ApiError(404,"TRANSACTION_NOT_FOUND","Transaction not found for this shop/location.");
    const ids=identifiers(input);
    const itemId=id("itm");
    await env.PAWNGUARD_DB.prepare(
      `INSERT INTO inventory_items(
        id,shop_id,location_id,transaction_id,status,category,manufacturer,model,
        serial_normalized,imei_normalized,vin_normalized,upc_normalized,
        description,distinctive_marks,photo_manifest,intake_at,created_by
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      itemId,actor.shopId,input.locationId,input.transactionId,"intake",
      normalizeText(input.category),input.manufacturer?normalizeText(input.manufacturer):null,input.model?normalizeText(input.model):null,
      ids.serial??null,ids.imei??null,ids.vin??null,ids.upc??null,
      input.description?normalizeText(input.description):null,input.distinctiveMarks?normalizeText(input.distinctiveMarks):null,
      input.photoManifest?JSON.stringify(input.photoManifest):null,new Date().toISOString(),actor.userId
    ).run();
    await audit(env.PAWNGUARD_DB,actor,"inventory.intake","inventory_item",itemId,correlationId,{transactionId:input.transactionId});
    const screening=await screenItem(env.PAWNGUARD_DB,actor.shopId,itemId,"intake",correlationId);
    if (screening.result!=="confirmed_hold")
      await env.PAWNGUARD_DB.prepare("UPDATE inventory_items SET status='active' WHERE id=?").bind(itemId).run();
    return json({data:{itemId,screening},correlationId},201,correlationId);
  }

  if (key==="GET /v1/inventory") {
    const status=url.searchParams.get("status");
    const q=status
      ? "SELECT * FROM inventory_items WHERE shop_id=? AND status=? ORDER BY intake_at DESC LIMIT 250"
      : "SELECT * FROM inventory_items WHERE shop_id=? ORDER BY intake_at DESC LIMIT 250";
    const result=status
      ? await env.PAWNGUARD_DB.prepare(q).bind(actor.shopId,status).all()
      : await env.PAWNGUARD_DB.prepare(q).bind(actor.shopId).all();
    return json({data:result.results,correlationId},200,correlationId);
  }

  if (key==="GET /v1/notifications") {
    const result=await env.PAWNGUARD_DB.prepare(
      "SELECT * FROM notifications WHERE shop_id=? ORDER BY created_at DESC LIMIT 250"
    ).bind(actor.shopId).all();
    return json({data:result.results,correlationId},200,correlationId);
  }

  if (key==="GET /v1/alerts") {
    const result=await env.PAWNGUARD_DB.prepare(
      `SELECT a.*,i.category,i.manufacturer,i.model,i.serial_normalized,i.imei_normalized,i.vin_normalized,
              s.provider,s.provider_record_ref,s.case_number,s.authority_level
       FROM alerts a
       JOIN inventory_items i ON i.id=a.item_id
       JOIN stolen_signals s ON s.id=a.signal_id
       WHERE a.shop_id=? AND a.state IN ('open','acknowledged','escalated')
       ORDER BY a.created_at DESC LIMIT 250`
    ).bind(actor.shopId).all();
    return json({data:result.results,correlationId},200,correlationId);
  }

  const rescreen=/^\/v1\/inventory\/([^/]+)\/screen$/.exec(url.pathname);
  if (req.method==="POST" && rescreen) {
    requireRole(actor,["manager","compliance","admin"]);
    const result=await screenItem(env.PAWNGUARD_DB,actor.shopId,decodeURIComponent(rescreen[1]),"manual",correlationId);
    return json({data:result,correlationId},200,correlationId);
  }

  if (key==="POST /v1/signals") {
    requireRole(actor,["compliance","admin"]);
    const input=signalSchema.parse(await body(req));
    const ids=identifiers(input);
    const proposedSignalId=id("sig");
    const payloadHash=await hashJson(input);
    await env.PAWNGUARD_DB.prepare(
      `INSERT INTO stolen_signals(
        id,provider,provider_record_ref,authority_level,case_number,category,manufacturer,model,
        serial_normalized,imei_normalized,vin_normalized,upc_normalized,description,distinctive_marks,
        reported_at,source_received_at,source_payload_hash,active
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
      ON CONFLICT(provider,provider_record_ref) DO UPDATE SET
        authority_level=excluded.authority_level,case_number=excluded.case_number,category=excluded.category,
        manufacturer=excluded.manufacturer,model=excluded.model,serial_normalized=excluded.serial_normalized,
        imei_normalized=excluded.imei_normalized,vin_normalized=excluded.vin_normalized,
        upc_normalized=excluded.upc_normalized,description=excluded.description,
        distinctive_marks=excluded.distinctive_marks,reported_at=excluded.reported_at,
        source_received_at=excluded.source_received_at,source_payload_hash=excluded.source_payload_hash,active=1`
    ).bind(
      proposedSignalId,input.provider,input.providerRecordRef,input.authorityLevel,input.caseNumber??null,
      input.category?normalizeText(input.category):null,input.manufacturer?normalizeText(input.manufacturer):null,input.model?normalizeText(input.model):null,
      ids.serial??null,ids.imei??null,ids.vin??null,ids.upc??null,
      input.description?normalizeText(input.description):null,input.distinctiveMarks?normalizeText(input.distinctiveMarks):null,
      input.reportedAt,new Date().toISOString(),payloadHash
    ).run();
    const actualSignal=await env.PAWNGUARD_DB.prepare(
      "SELECT id FROM stolen_signals WHERE provider=? AND provider_record_ref=?"
    ).bind(input.provider,input.providerRecordRef).first<{id:string}>();
    const signalId=actualSignal?.id ?? proposedSignalId;
    await audit(env.PAWNGUARD_DB,actor,"signal.ingested","stolen_signal",signalId,correlationId,{
      provider:input.provider,providerRecordRef:input.providerRecordRef,authorityLevel:input.authorityLevel
    });
    const scan=await screenActiveInventory(env.PAWNGUARD_DB,correlationId);
    return json({data:{signalId,inventoryScan:scan},correlationId},201,correlationId);
  }

  const disposition=/^\/v1\/inventory\/([^/]+)\/disposition$/.exec(url.pathname);
  if (req.method==="POST" && disposition) {
    requireRole(actor,["manager","compliance","admin"]);
    const itemId=decodeURIComponent(disposition[1]);
    const input=z.object({
      status:z.enum(["redeemed","sold","released","evidence"]),
      reason:z.string().max(1000).optional()
    }).parse(await body(req));
    const item=await env.PAWNGUARD_DB.prepare(
      "SELECT status FROM inventory_items WHERE id=? AND shop_id=?"
    ).bind(itemId,actor.shopId).first<{status:string}>();
    if(!item) throw new ApiError(404,"ITEM_NOT_FOUND","Inventory item not found.");
    const blockingAlerts=await env.PAWNGUARD_DB.prepare(
      "SELECT count(*) AS n FROM alerts WHERE item_id=? AND shop_id=? AND state IN ('open','acknowledged','escalated')"
    ).bind(itemId,actor.shopId).first<{n:number}>();
    const activeHold=await env.PAWNGUARD_DB.prepare(
      "SELECT count(*) AS n FROM holds WHERE item_id=? AND shop_id=? AND state='active'"
    ).bind(itemId,actor.shopId).first<{n:number}>();
    if(Number(blockingAlerts?.n||0)>0 || Number(activeHold?.n||0)>0)
      throw new ApiError(409,"PROPERTY_LOCKED","Unresolved property alert or active hold blocks release, redemption, or sale.");
    const occurredAt=new Date().toISOString();
    await env.PAWNGUARD_DB.prepare("UPDATE inventory_items SET status=? WHERE id=? AND shop_id=?")
      .bind(input.status,itemId,actor.shopId).run();
    await env.PAWNGUARD_DB.prepare(
      "INSERT INTO disposition_events(id,shop_id,item_id,from_status,to_status,reason,actor_user_id,occurred_at) VALUES(?,?,?,?,?,?,?,?)"
    ).bind(id("dsp"),actor.shopId,itemId,item.status,input.status,input.reason??null,actor.userId,occurredAt).run();
    await audit(env.PAWNGUARD_DB,actor,"inventory.disposition","inventory_item",itemId,correlationId,{
      from:item.status,to:input.status,reason:input.reason??null
    });
    return json({data:{itemId,status:input.status},correlationId},200,correlationId);
  }

  const notificationRead=/^\/v1\/notifications\/([^/]+)\/read$/.exec(url.pathname);
  if (req.method==="POST" && notificationRead) {
    const notificationId=decodeURIComponent(notificationRead[1]);
    const result=await env.PAWNGUARD_DB.prepare(
      "UPDATE notifications SET state='read',read_at=? WHERE id=? AND shop_id=?"
    ).bind(new Date().toISOString(),notificationId,actor.shopId).run();
    if(!result.meta.changes) throw new ApiError(404,"NOTIFICATION_NOT_FOUND","Notification not found.");
    return json({data:{notificationId,state:"read"},correlationId},200,correlationId);
  }

  const hold=/^\/v1\/inventory\/([^/]+)\/holds$/.exec(url.pathname);
  if (req.method==="POST" && hold) {
    requireRole(actor,["manager","compliance","admin"]);
    const itemId=decodeURIComponent(hold[1]);
    const input=holdSchema.parse(await body(req));
    const item=await env.PAWNGUARD_DB.prepare("SELECT id FROM inventory_items WHERE id=? AND shop_id=?")
      .bind(itemId,actor.shopId).first();
    if(!item) throw new ApiError(404,"ITEM_NOT_FOUND","Inventory item not found.");
    if(input.authorityType==="law_enforcement" && (!input.agencyName || !input.caseNumber))
      throw new ApiError(400,"HOLD_DETAILS_REQUIRED","Law-enforcement holds require agency and case number.");
    const holdId=id("hld");
    await env.PAWNGUARD_DB.prepare(
      "INSERT INTO holds(id,shop_id,item_id,alert_id,authority_type,agency_name,officer_name,officer_identifier,case_number,issued_at,expires_at,document_manifest,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'active')"
    ).bind(
      holdId,actor.shopId,itemId,input.alertId??null,input.authorityType,input.agencyName??null,
      input.officerName??null,input.officerIdentifier??null,input.caseNumber??null,
      input.issuedAt??new Date().toISOString(),input.expiresAt??null,
      input.documentManifest?JSON.stringify(input.documentManifest):null
    ).run();
    await env.PAWNGUARD_DB.prepare("UPDATE inventory_items SET status='hold' WHERE id=?").bind(itemId).run();
    await audit(env.PAWNGUARD_DB,actor,"hold.created","hold",holdId,correlationId,{
      itemId,authorityType:input.authorityType,caseNumber:input.caseNumber??null
    });
    return json({data:{holdId,state:"active"},correlationId},201,correlationId);
  }

  const ack=/^\/v1\/alerts\/([^/]+)\/acknowledge$/.exec(url.pathname);
  if (req.method==="POST" && ack) {
    requireRole(actor,["manager","compliance","admin"]);
    const alertId=decodeURIComponent(ack[1]);
    const result=await env.PAWNGUARD_DB.prepare(
      "UPDATE alerts SET state='acknowledged',acknowledged_at=? WHERE id=? AND shop_id=? AND state='open'"
    ).bind(new Date().toISOString(),alertId,actor.shopId).run();
    if (!result.meta.changes) throw new ApiError(404,"ALERT_NOT_FOUND","Open alert not found.");
    await audit(env.PAWNGUARD_DB,actor,"alert.acknowledged","alert",alertId,correlationId,{});
    return json({data:{alertId,state:"acknowledged"},correlationId},200,correlationId);
  }

  throw new ApiError(404,"NOT_FOUND","API route not found.");
}

function security(response:Response,origin:string|null,allowed:string[]) {
  const h=new Headers(response.headers);
  h.set("cache-control","no-store");
  h.set("x-content-type-options","nosniff");
  h.set("x-frame-options","DENY");
  h.set("referrer-policy","no-referrer");
  h.set("strict-transport-security","max-age=31536000; includeSubDomains");
  h.set("permissions-policy","camera=(self), microphone=(), geolocation=()");
  h.set("cross-origin-opener-policy","same-origin");
  h.set("content-security-policy","default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'");
  if (origin && allowed.includes(origin)) {
    h.set("access-control-allow-origin",origin);
    h.set("access-control-allow-methods","GET,POST,OPTIONS");
    h.set("access-control-allow-headers","Authorization,Content-Type,X-Correlation-ID,Cf-Access-Jwt-Assertion");
    h.set("vary","Origin");
  }
  return new Response(response.body,{status:response.status,headers:h});
}

export default {
  async fetch(req:Request,env:Env):Promise<Response> {
    const correlationId=cid(req);
    const url=new URL(req.url);
    const origin=req.headers.get("origin");
    const allowed=(env.PAWNGUARD_ALLOWED_ORIGINS??"").split(",").map(x=>x.trim()).filter(Boolean);
    try {
      if (origin && !allowed.includes(origin)) throw new ApiError(403,"ORIGIN_DENIED","Origin is not allowed.");
      if (req.method==="OPTIONS") return security(new Response(null,{status:204}),origin,allowed);
      let response:Response;
      if (url.pathname==="/health") {
        response=json({status:env.PAWNGUARD_DB?"configured":"storage_missing",environment:env.PAWNGUARD_ENV},env.PAWNGUARD_DB?200:503,correlationId);
      } else if (url.pathname.startsWith("/v1/")) {
        response=await api(req,env);
      } else {
        response=env.ASSETS ? await env.ASSETS.fetch(req) : json({project:"PawnGuard",health:"/health"},200,correlationId);
      }
      return security(response,origin,allowed);
    } catch(error) {
      return security(errorResponse(error,correlationId),origin,allowed);
    }
  },

  async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext) {
    const correlationId=`cron-${crypto.randomUUID()}`;
    ctx.waitUntil(screenActiveInventory(env.PAWNGUARD_DB,correlationId));
  }
};
