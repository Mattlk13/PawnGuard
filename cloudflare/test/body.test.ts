import test from "node:test";
import assert from "node:assert/strict";
import { readJsonBody } from "../src/body";

function request(text: string, headers?: Record<string,string>) {
  return new Request("https://example.test/v1/customers", { method: "POST", body: text, headers });
}

test("valid JSON is accepted without Content-Length", async () => {
  assert.deepEqual(await readJsonBody(request('{"name":"Ada"}')), {name:"Ada"});
});

test("actual bytes enforce the limit even when Content-Length is missing or understated", async () => {
  for (const headers of [undefined, {"content-length":"2"}]) {
    await assert.rejects(readJsonBody(request(JSON.stringify("é".repeat(64_000)), headers)), {status:413,code:"PAYLOAD_TOO_LARGE"});
  }
});

test("exact byte boundary is accepted and the next byte is rejected", async () => {
  assert.equal((await readJsonBody(request(JSON.stringify("a".repeat(127_998)))) as string).length,127_998);
  await assert.rejects(readJsonBody(request(JSON.stringify("a".repeat(127_999)))), {status:413});
});

test("oversized streams are cancelled before subsequent chunks are consumed", async () => {
  let cancelled=false;
  const stream=new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(128_001)); },
    cancel() { cancelled=true; }
  });
  const req=new Request("https://example.test",{method:"POST",body:stream,duplex:"half"} as RequestInit);
  await assert.rejects(readJsonBody(req), {status:413});
  assert.equal(cancelled,true);
});

test("malformed and empty JSON return a client error", async () => {
  for (const text of ["{", ""]) await assert.rejects(readJsonBody(request(text)), {status:400,code:"INVALID_JSON"});
});
