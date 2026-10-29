import test from "node:test";
import assert from "node:assert/strict";
import { customerSchema, itemSchema, transactionSchema, holdSchema, signalSchema } from "../src/schemas";

test("customer contact accepts arbitrary string keys and preserves values",()=>{
  const customer={fullName:"Sample Customer",contact:{email:"sample@example.test",phone:null,preferred:{channel:"email"}}};
  assert.deepEqual(customerSchema.parse(customer),customer);
  assert.equal(customerSchema.safeParse({...customer,fullName:""}).success,false);
});

test("intake accepts the photo boundary and rejects oversized or invalid manifests",()=>{
  const item={locationId:"loc",transactionId:"tx",category:"TOOLS",photoManifest:Array.from({length:20},(_,i)=>({key:`photo-${i}`}))};
  assert.equal(itemSchema.parse(item).photoManifest?.length,20);
  assert.equal(itemSchema.safeParse({...item,photoManifest:[...item.photoManifest,{key:"extra"}]}).success,false);
  assert.equal(itemSchema.safeParse({...item,photoManifest:[{key:42}]}).success,false);
  assert.equal(itemSchema.safeParse({...item,category:"x".repeat(121)}).success,false);
});

test("transaction amount, enum and timestamp constraints remain enforced",()=>{
  const tx={locationId:"loc",customerId:"cus",kind:"pawn",amountCents:0,occurredAt:"2026-10-28T12:00:00Z"};
  assert.equal(transactionSchema.safeParse(tx).success,true);
  for(const change of [{amountCents:-1},{amountCents:1.2},{kind:"sale"},{occurredAt:"yesterday"}])
    assert.equal(transactionSchema.safeParse({...tx,...change}).success,false);
});

test("hold and signal reject invalid authority or oversized document collections",()=>{
  assert.equal(holdSchema.safeParse({authorityType:"law_enforcement"}).success,true);
  assert.equal(holdSchema.safeParse({authorityType:"automated"}).success,false);
  assert.equal(holdSchema.safeParse({authorityType:"internal_review",documentManifest:Array.from({length:21},()=>({key:"doc"}))}).success,false);
  const signal={provider:"authorized-provider",providerRecordRef:"ref",authorityLevel:"informational",reportedAt:"2026-10-28T12:00:00Z"};
  assert.equal(signalSchema.safeParse(signal).success,true);
  assert.equal(signalSchema.safeParse({...signal,authorityLevel:"unverified_hold"}).success,false);
});
