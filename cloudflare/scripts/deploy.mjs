import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root=fileURLToPath(new URL("../../",import.meta.url));
const target=process.argv[2] ?? "staging";
if(!["staging","production"].includes(target)) throw new Error("Choose staging or production");

const account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token=process.env.CLOUDFLARE_API_TOKEN?.trim();
if(!account||!token) throw new Error("Cloudflare account ID and scoped API token are required");

let metadata=null;
try{
  metadata=JSON.parse(await readFile(resolve(root,"cloudflare/build/pawnguard-access-metadata.json"),"utf8"));
}catch{}

const defaultDomain=target==="production"
  ? "pawnguard.hm2krebsmatthewl.workers.dev"
  : "pawnguard-staging.hm2krebsmatthewl.workers.dev";
const domain=(process.env.PAWNGUARD_ACCESS_DOMAIN || metadata?.target?.domain || defaultDomain).trim();
const issuer=(process.env.PAWNGUARD_AUTH_ISSUER || metadata?.issuer || "https://buildbot-aoy-pages.cloudflareaccess.com").trim();
const audience=(process.env.PAWNGUARD_AUTH_AUDIENCE || metadata?.target?.aud || "").trim();
const jwks=(process.env.PAWNGUARD_AUTH_JWKS_URL || metadata?.jwks || issuer+"/cdn-cgi/access/certs").trim();
if(!audience) throw new Error("PawnGuard Cloudflare Access audience is required. Run provision:access first.");
for(const [label,value] of [["issuer",issuer],["jwks",jwks]]){
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password) throw new Error(label+" must be a credential-free HTTPS URL");
}
const allowedOrigins=(process.env.PAWNGUARD_ALLOWED_ORIGINS || "https://"+domain)
  .split(",").map(x=>x.trim()).filter(Boolean);
for(const raw of allowedOrigins){
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.origin!==raw) throw new Error("Allowed origins must be exact HTTPS origins");
}

async function api(path,method="GET",body){
  const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account)+"/d1/database"+path,{
    method,
    headers:{authorization:"Bearer "+token,"content-type":"application/json"},
    body:body?JSON.stringify(body):undefined
  });
  const data=await response.json();
  if(!response.ok||!data.success) throw new Error("Cloudflare D1 request failed: "+response.status);
  return data.result;
}

const dbName=target==="production" ? "pawnguard" : "pawnguard-staging";
const existing=await api("?name="+encodeURIComponent(dbName));
let database=existing.find(x=>x.name===dbName);
if(!database) database=await api("","POST",{name:dbName});
if(!database?.uuid) throw new Error("Cloudflare did not return a D1 database identifier");

const config={
  name:target==="production" ? "pawnguard" : "pawnguard-staging",
  main:resolve(root,"cloudflare/src/index.ts"),
  compatibility_date:"2026-10-03",
  observability:{enabled:true},
  vars:{
    PAWNGUARD_ENV:target,
    PAWNGUARD_ALLOWED_ORIGINS:allowedOrigins.join(","),
    PAWNGUARD_AUTH_ISSUER:issuer,
    PAWNGUARD_AUTH_AUDIENCE:audience,
    PAWNGUARD_AUTH_JWKS_URL:jwks
  },
  assets:{
    directory:resolve(root,"public"),
    binding:"ASSETS",
    run_worker_first:true,
    not_found_handling:"single-page-application"
  },
  d1_databases:[{
    binding:"PAWNGUARD_DB",
    database_name:dbName,
    database_id:database.uuid,
    migrations_dir:resolve(root,"cloudflare/migrations")
  }],
  triggers:{crons:["17 3 * * *"]}
};

const dir=resolve(root,".wrangler");
await mkdir(dir,{recursive:true});
const path=resolve(dir,`pawnguard-${target}.json`);
await writeFile(path,JSON.stringify(config,null,2));

const cli=resolve(root,"cloudflare/node_modules/wrangler/bin/wrangler.js");
function run(args){
  const r=spawnSync(process.execPath,[cli,...args,"--config",path],{
    cwd:root,
    stdio:"inherit",
    env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token}
  });
  if(r.status!==0) throw new Error("Wrangler operation failed: "+args.join(" "));
}

run(["deploy","--dry-run"]);
run(["d1","migrations","apply","PAWNGUARD_DB","--remote"]);
run(["deploy"]);
console.log(JSON.stringify({worker:config.name,database:dbName,domain,audience,cron:"17 3 * * *"},null,2));
