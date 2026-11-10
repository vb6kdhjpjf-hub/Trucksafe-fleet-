export async function readJsonBodyLimited(request, maxBytes = 16_000) {
  if (!request?.body || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    return { ok: false, status: 400, error: "empty_or_invalid_body" };
  }

  const declaredLength = request.headers?.get?.("content-length");
  if (declaredLength !== null && declaredLength !== undefined && declaredLength !== "") {
    if (!/^\\d+$/.test(declaredLength)) {
      return { ok: false, status: 400, error: "invalid_content_length" };
    }
    if (Number(declaredLength) > maxBytes) {
      return { ok: false, status: 413, error: "body_too_large" };
    }
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        await reader.cancel();
        return { ok: false, status: 400, error: "invalid_body_stream" };
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, error: "body_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "body_read_failed" };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}
