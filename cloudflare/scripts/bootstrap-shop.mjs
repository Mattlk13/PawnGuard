import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root=fileURLToPath(new URL("../../",import.meta.url));
const target=process.argv[2] ?? "staging";
if(!["staging","production"].includes(target)) throw new Error("Choose staging or production");

const shopId=(process.env.PAWNGUARD_BOOTSTRAP_SHOP_ID || "shop-primary").trim();
const shopName=(process.env.PAWNGUARD_BOOTSTRAP_SHOP_NAME || "PawnGuard Pilot Shop").trim();
const locationId=(process.env.PAWNGUARD_BOOTSTRAP_LOCATION_ID || "loc-primary").trim();
const locationName=(process.env.PAWNGUARD_BOOTSTRAP_LOCATION_NAME || "Primary Location").trim();
const locationAddress=(process.env.PAWNGUARD_BOOTSTRAP_LOCATION_ADDRESS || "{}").trim();
const issuer=process.env.PAWNGUARD_AUTH_ISSUER?.trim();
const subject=process.env.PAWNGUARD_BOOTSTRAP_SUBJECT?.trim();
const userId=(process.env.PAWNGUARD_BOOTSTRAP_USER_ID || "owner").trim();

if(!issuer) throw new Error("PAWNGUARD_AUTH_ISSUER is required");
if(!subject) throw new Error("PAWNGUARD_BOOTSTRAP_SUBJECT is required");
JSON.parse(locationAddress);

function sqlString(value){ return "'" + String(value).replaceAll("'","''") + "'"; }
const actor=JSON.stringify([locationId]);

const sql=[
  `INSERT OR IGNORE INTO shops(id,legal_name,display_name) VALUES(${sqlString(shopId)},${sqlString(shopName)},${sqlString(shopName)})`,
  `INSERT OR IGNORE INTO locations(id,shop_id,name,address_json,active) VALUES(${sqlString(locationId)},${sqlString(shopId)},${sqlString(locationName)},${sqlString(locationAddress)},1)`,
  `INSERT INTO actors(issuer,subject,user_id,shop_id,role,location_ids,disabled)
   VALUES(${sqlString(issuer)},${sqlString(subject)},${sqlString(userId)},${sqlString(shopId)},'admin',${sqlString(actor)},0)
   ON CONFLICT(issuer,subject) DO UPDATE SET user_id=excluded.user_id,shop_id=excluded.shop_id,role='admin',location_ids=excluded.location_ids,disabled=0`
].join(";");

const cfg=resolve(root,".wrangler",`pawnguard-${target}.json`);
const cli=resolve(root,"cloudflare/node_modules/wrangler/bin/wrangler.js");
const r=spawnSync(process.execPath,[cli,"d1","execute","PAWNGUARD_DB","--remote","--command",sql,"--config",cfg],{
  cwd:root,
  stdio:"inherit",
  env:process.env
});
if(r.status!==0) throw new Error("PawnGuard bootstrap failed");
console.log(JSON.stringify({shopId,locationId,userId,issuer,subjectConfigured:true},null,2));
