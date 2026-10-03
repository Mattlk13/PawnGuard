import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token=process.env.CLOUDFLARE_API_TOKEN?.trim();
if(!account) throw new Error("CLOUDFLARE_ACCOUNT_ID is required");
if(!token) throw new Error("CLOUDFLARE_API_TOKEN is required");

const sourceDomain=(process.env.PAWNGUARD_ACCESS_SOURCE_DOMAIN || "pbn-staging.hm2krebsmatthewl.workers.dev").trim();
const targetDomain=(process.env.PAWNGUARD_ACCESS_DOMAIN || "pawnguard-staging.hm2krebsmatthewl.workers.dev").trim();
const targetName=(process.env.PAWNGUARD_ACCESS_APP_NAME || "PawnGuard Staging").trim();

async function cf(path,options={}){
  const response=await fetch("https://api.cloudflare.com/client/v4"+path,{
    ...options,
    headers:{
      authorization:"Bearer "+token,
      "content-type":"application/json",
      ...(options.headers||{})
    }
  });
  const body=await response.json();
  if(!response.ok || body.success!==true){
    const e=new Error(`Cloudflare API failed ${response.status}`);
    e.details=body.errors||body;
    throw e;
  }
  return body.result;
}

const apps=await cf("/accounts/"+account+"/access/apps?per_page=100");
const source=apps.find(x=>x.domain===sourceDomain);
if(!source) throw new Error("PBN source Access application was not found; refusing to invent permissions.");

let target=apps.find(x=>x.domain===targetDomain);
if(!target){
  target=await cf("/accounts/"+account+"/access/apps",{
    method:"POST",
    body:JSON.stringify({
      type:"self_hosted",
      name:targetName,
      domain:targetDomain,
      session_duration:source.session_duration || "8h",
      auto_redirect_to_identity:Boolean(source.auto_redirect_to_identity)
    })
  });
}

const sourcePolicies=await cf("/accounts/"+account+"/access/apps/"+source.id+"/policies?per_page=100");
const targetPolicies=await cf("/accounts/"+account+"/access/apps/"+target.id+"/policies?per_page=100");

const cloneable=sourcePolicies.filter(p=>p.decision==="allow");
const cloned=[];
for(const p of cloneable){
  const name="PawnGuard - "+String(p.name||"Authorized Users").replace(/^PBN\s*[-:]?\s*/i,"");
  const payload={
    name,
    decision:"allow",
    include:p.include||[],
    exclude:p.exclude||[],
    require:p.require||[],
    session_duration:p.session_duration || target.session_duration || "8h"
  };
  if(p.mfa_config) payload.mfa_config=p.mfa_config;
  const existing=targetPolicies.find(x=>x.name===name);
  let result=existing;
  if(existing){
    result=await cf("/accounts/"+account+"/access/apps/"+target.id+"/policies/"+existing.id,{
      method:"PUT",
      body:JSON.stringify(payload)
    });
  }else{
    result=await cf("/accounts/"+account+"/access/apps/"+target.id+"/policies",{
      method:"POST",
      body:JSON.stringify(payload)
    });
  }
  cloned.push({id:result.id,name:result.name,decision:result.decision});
}

if(cloned.length===0) throw new Error("PBN has no cloneable allow policy; PawnGuard was not opened broadly.");

const teamDomain=(process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN || "buildbot-aoy-pages.cloudflareaccess.com").replace(/^https?:\/\//,"").replace(/\/$/,"");
const issuer="https://"+teamDomain;
const result={
  source:{id:source.id,name:source.name,domain:source.domain},
  target:{id:target.id,name:target.name,domain:target.domain,aud:target.aud,type:target.type},
  issuer,
  jwks:issuer+"/cdn-cgi/access/certs",
  allowedOrigin:"https://"+target.domain,
  clonedPolicies:cloned,
  bypassPoliciesCloned:false
};

await mkdir(resolve("build"),{recursive:true});
await writeFile(resolve("build/pawnguard-access-metadata.json"),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
