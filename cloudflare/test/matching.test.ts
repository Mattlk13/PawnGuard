import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIdentifier, scoreMatch } from "../src/matching";

test("identifier normalization removes punctuation and case",()=>{
  assert.equal(normalizeIdentifier(" ab-12 34 "),"AB1234");
});

test("shared UPC plus descriptive matches cannot confirm an individual-item hold",()=>{
  const result=scoreMatch(
    {category:"TOOLS",upc:"012345678905",manufacturer:"Milwaukee",model:"2962",description:"red impact wrench",distinctiveMarks:"scratched battery"},
    {id:"shared-product",authority_level:"law_enforcement_hold",upc_normalized:"012345678905",manufacturer:"Milwaukee",model:"2962",description:"red impact wrench",distinctive_marks:"scratched battery"}
  );
  assert.equal(result.score,100);
  assert.equal(result.disposition,"possible_match");
});

test("exact IMEI and VIN retain hold classification only for a hold authority",()=>{
  for (const key of ["imei","vin"] as const) {
    for (const authority of ["informational","authorized_feed","law_enforcement_report","law_enforcement_hold"] as const) {
      const result=scoreMatch({category:"OTHER",[key]:"ABC-123"},{id:key,authority_level:authority,[`${key}_normalized`]:"ABC123"});
      assert.equal(result.disposition,authority==="law_enforcement_hold"?"confirmed_hold":"possible_match");
    }
  }
});

test("exact law-enforcement serial match becomes confirmed hold",()=>{
  const result=scoreMatch(
    {category:"TOOLS",manufacturer:"Milwaukee",model:"2962",serial:"abc-123"},
    {
      id:"sig1",
      authority_level:"law_enforcement_hold",
      serial_normalized:"ABC123",
      manufacturer:"MILWAUKEE",
      model:"2962"
    }
  );
  assert.equal(result.disposition,"confirmed_hold");
  assert.ok(result.score>=95);
});

test("descriptive similarity alone never becomes confirmed hold",()=>{
  const result=scoreMatch(
    {category:"TOOLS",manufacturer:"Milwaukee",model:"2962",description:"red impact wrench",distinctiveMarks:"MLK scratched on battery"},
    {
      id:"sig2",
      authority_level:"law_enforcement_report",
      manufacturer:"MILWAUKEE",
      model:"2962",
      description:"red cordless impact wrench",
      distinctive_marks:"MLK scratched near battery"
    }
  );
  assert.notEqual(result.disposition,"confirmed_hold");
});

test("informational exact serial never creates law-enforcement confirmed hold",()=>{
  const result=scoreMatch(
    {category:"ELECTRONICS",serial:"S-1"},
    {id:"sig3",authority_level:"informational",serial_normalized:"S1"}
  );
  assert.equal(result.disposition,"possible_match");
});
