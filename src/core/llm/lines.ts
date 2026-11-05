/**
 * A response body, one line at a time. Both providers stream as lines —
 * Mistral as server-sent events (`data: {...}`), Ollama as one JSON
 * object per line — and a chunk from the network ends wherever the
 * network felt like ending it, so the split has to be ours. A chunk
 * that ends mid-line waits for the next; a final line without a newline
 * is still a line.
 */
export async function* readLines(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<string, void, undefined> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        yield buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.length > 0) yield buffer.replace(/\r$/, "");
  } finally {
    reader.releaseLock();
  }
}

/** The JSON behind an SSE `data:` line, or null for anything else (comments, blanks, `[DONE]`). */
export function sseData(line: string): string | null {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  return data === "" || data === "[DONE]" ? null : data;
}
