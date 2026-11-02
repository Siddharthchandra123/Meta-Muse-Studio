/** Parse completed SSE frames from a growing response buffer. Retain partial frames. */
export type SSEFrame = { event: string; data: Record<string, unknown> };
export type SSEBatch = { events: SSEFrame[]; pending: string };

export function parseSseFrames(buffer: string): SSEBatch {
  // CRLF can be split across network chunks; normalization occurs after concatenation.
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const pending = blocks.pop() ?? "";
  const events: SSEFrame[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const type = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const payload = lines.filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    if (!type || !payload || payload === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new Error("The server returned an invalid streaming event.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("The server returned an unexpected streaming event.");
    }
    events.push({ event: type, data: parsed as Record<string, unknown> });
  }
  return { events, pending };
}
