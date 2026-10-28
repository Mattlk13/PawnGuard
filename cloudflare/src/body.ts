import { ApiError } from "./auth";

export async function readJsonBody(req: Request): Promise<unknown> {
  const limit = 128_000;
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request exceeds 128KB.");

  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request exceeds 128KB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}
