import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIdentifier, scoreMatch } from "../src/matching";

test("identifier normalization removes punctuation and case",()=>{
  assert.equal(normalizeIdentifier(" ab-12 34 "),"AB1234");
});

test("exact law-enforcement serial match becomes confirmed hold",()=>{
  const result=scoreMatch(
    {category:"TOOLS",manufacturer:"Milwaukee",model:"2962",serial:"abc-123"},
    {
      id:"sig1",
      authority_level:"law_enforcement",
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
      authority_level:"law_enforcement",
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
