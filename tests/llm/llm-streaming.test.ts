import { describe, expect, it } from "vitest";
import { readLines, sseData } from "@/core/llm/lines";
import { MistralProvider } from "@/core/llm/mistral";
import { OllamaProvider } from "@/core/llm/ollama";
import { LlmError, type LlmStreamEvent } from "@/core/llm/types";

/**
 * The streaming door of the adapter (docs/adr/0011), proven against a
 * fake network that hands the body over in pieces cut wherever it
 * likes — mid-line, mid-token — because that is what a real one does.
 */

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function fetchStreaming(chunks: string[], status = 200) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(streamOf(chunks), { status });
  };
  return { fetchFn, calls };
}

async function drain(events: AsyncIterable<LlmStreamEvent>) {
  let text = "";
  let done: Extract<LlmStreamEvent, { type: "done" }> | null = null;
  for await (const event of events) {
    if (event.type === "delta") text += event.text;
    else done = event;
  }
  return { text, done };
}

const failingFetch: typeof fetch = async () => {
  throw new Error("down");
};

describe("readLines", () => {
  it("joins pieces into lines and keeps a last line without a newline", async () => {
    const lines: string[] = [];
    for await (const line of readLines(streamOf(["ab", "c\nde\r\n", "f"]))) lines.push(line);
    expect(lines).toEqual(["abc", "de", "f"]);
  });

  it("reads the data of an SSE line and nothing else", () => {
    expect(sseData('data: {"a":1}')).toBe('{"a":1}');
    expect(sseData("data: [DONE]")).toBeNull();
    expect(sseData(": keep-alive")).toBeNull();
    expect(sseData("")).toBeNull();
  });
});

describe("MistralProvider.stream", () => {
  const events = [
    'data: {"model":"mistral-small-latest","choices":[{"delta":{"content":"Hej "},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Mar'.slice(0, 40),
    'data: {"choices":[{"delta":{"content":"Martin"},"finish_reason":null}]}\n\n'.slice(40),
    ": a comment the parser must skip\n\n",
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":3}}\n\n',
    "data: [DONE]\n\n",
  ];

  it("yields the text as it comes and closes with model, usage and finish", async () => {
    const { fetchFn, calls } = fetchStreaming(events);
    const provider = new MistralProvider("secret-key", "mistral-small-latest", fetchFn);
    const { text, done } = await drain(provider.stream([{ role: "user", content: "Sig hej" }]));
    expect(text).toBe("Hej Martin");
    expect(done).toEqual({
      type: "done",
      model: "mistral-small-latest",
      usage: { inputTokens: 12, outputTokens: 3 },
      finish: "stop",
    });
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.stream).toBe(true);
    expect(body.response_format).toBeUndefined();
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
  });

  it("says when the model stopped for length, so the person can ask it to go on", async () => {
    const { fetchFn } = fetchStreaming([
      'data: {"choices":[{"delta":{"content":"Halvvejs"},"finish_reason":"length"}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const { done } = await drain(
      new MistralProvider("k", "m", fetchFn).stream([{ role: "user", content: "x" }]),
    );
    expect(done?.finish).toBe("length");
    expect(done?.usage).toBeNull();
  });

  it("throws the same typed errors as complete before the first token", async () => {
    const auth = new MistralProvider("bad", "m", fetchStreaming([], 401).fetchFn);
    await expect(drain(auth.stream([{ role: "user", content: "x" }]))).rejects.toMatchObject({
      reason: "auth",
    });
    const down = new MistralProvider("k", "m", failingFetch);
    await expect(drain(down.stream([{ role: "user", content: "x" }]))).rejects.toBeInstanceOf(
      LlmError,
    );
  });

  it("names a stream that is not events at all", async () => {
    const { fetchFn } = fetchStreaming(["data: not json\n\n"]);
    await expect(
      drain(new MistralProvider("k", "m", fetchFn).stream([{ role: "user", content: "x" }])),
    ).rejects.toMatchObject({ reason: "bad_response" });
  });

  it("closes with unknown when the stream ends without saying why", async () => {
    const { fetchFn } = fetchStreaming([
      'data: {"choices":[{"delta":{"content":"Hej"},"finish_reason":null}]}\n\n',
    ]);
    const { text, done } = await drain(
      new MistralProvider("k", "m", fetchFn).stream([{ role: "user", content: "x" }]),
    );
    expect(text).toBe("Hej");
    expect(done?.finish).toBe("unknown");
  });
});

describe("OllamaProvider.stream", () => {
  const lines = [
    '{"model":"llama3.2","message":{"role":"assistant","content":"Hej"},"done":false}\n',
    '{"model":"llama3.2","message":{"role":"assistant","content":" Mar',
    'tin"},"done":false}\n',
    '{"model":"llama3.2","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","prompt_eval_count":8,"eval_count":2}\n',
  ];

  it("yields each line's text and closes with the counts from the last", async () => {
    const { fetchFn, calls } = fetchStreaming(lines);
    const provider = new OllamaProvider("http://localhost:11434", "llama3.2", fetchFn);
    const { text, done } = await drain(provider.stream([{ role: "user", content: "Sig hej" }]));
    expect(text).toBe("Hej Martin");
    expect(done).toEqual({
      type: "done",
      model: "llama3.2",
      usage: { inputTokens: 8, outputTokens: 2 },
      finish: "stop",
    });
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.stream).toBe(true);
    expect(body.think).toBe(false);
    expect(body.format).toBeUndefined();
  });

  it("retries without the thinking flag when the model has none", async () => {
    let n = 0;
    const fetchFn: typeof fetch = async () => {
      n += 1;
      return n === 1
        ? new Response('{"error":"model does not support thinking"}', { status: 400 })
        : new Response(streamOf(lines), { status: 200 });
    };
    const provider = new OllamaProvider("http://localhost:11434", "phi4", fetchFn);
    const { text } = await drain(provider.stream([{ role: "user", content: "x" }]));
    expect(text).toBe("Hej Martin");
    expect(n).toBe(2);
  });

  it("names an answer the model reasoned away", async () => {
    const { fetchFn } = fetchStreaming([
      '{"message":{"content":""},"done":true,"done_reason":"length","prompt_eval_count":10,"eval_count":600}\n',
    ]);
    const provider = new OllamaProvider("http://localhost:11434", "gemma4:12b", fetchFn);
    await expect(drain(provider.stream([{ role: "user", content: "x" }]))).rejects.toThrow(
      /without answering/,
    );
  });

  it("throws unreachable when nothing answers", async () => {
    const provider = new OllamaProvider("http://localhost:11434", "llama3.2", failingFetch);
    await expect(drain(provider.stream([{ role: "user", content: "x" }]))).rejects.toMatchObject({
      reason: "unreachable",
    });
  });
});
