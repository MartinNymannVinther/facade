import { readLines } from "./lines";
import {
  LlmError,
  type LlmCompletion,
  type LlmCompletionOptions,
  type LlmFinish,
  type LlmHealth,
  type LlmMessage,
  type LlmProvider,
  type LlmStreamEvent,
  type LlmUsage,
} from "./types";

type FetchLike = typeof fetch;

/** One answer, or one line of a streamed one; the last line carries `done`. */
type ChatResponse = {
  model?: string;
  message?: { content?: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

const SILENT =
  "ollama: the model used its tokens without answering; raise the token ceiling or choose a model that does not think";

function finishOf(reason: string | undefined): LlmFinish {
  if (reason === "stop") return "stop";
  if (reason === "length") return "length";
  return "unknown";
}

function usageOf(payload: ChatResponse): LlmUsage {
  return payload.prompt_eval_count != null
    ? { inputTokens: payload.prompt_eval_count ?? 0, outputTokens: payload.eval_count ?? 0 }
    : null;
}

/**
 * Local/self-hosted provider speaking the Ollama API. Data never leaves
 * the machine (or the VPS) it runs on — the digital-sovereignty option.
 */
export class OllamaProvider implements LlmProvider {
  readonly id = "ollama";
  readonly label = "Ollama (lokal)";

  constructor(
    private readonly baseUrl: string,
    readonly model: string = "llama3.2",
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  private body(
    messages: LlmMessage[],
    options: LlmCompletionOptions,
    think: boolean,
    stream: boolean,
  ) {
    return JSON.stringify({
      model: this.model,
      messages,
      stream,
      // Keep the model loaded between calls: a local model that has to be
      // read from disk for every request is a model nobody waits for.
      keep_alive: "30m",
      ...(options.responseFormat === "json" ? { format: "json" } : {}),
      // Thinking models (gemma4 and friends) spend their tokens on hidden
      // reasoning before they answer, and with a ceiling on tokens they can
      // spend all of them there and answer nothing. Every call here wants
      // the answer, so thinking is off; a model without the feature rejects
      // the flag, and we retry without it.
      ...(think ? {} : { think: false }),
      options: {
        temperature: options.temperature ?? 0.2,
        num_predict: options.maxTokens ?? 1024,
      },
    });
  }

  /**
   * The request, with the one retry Ollama needs: a model that has no
   * thinking to switch off answers 400 to `think: false`, and is asked
   * again without it. What comes back is a response that is `ok`.
   */
  private async post(
    messages: LlmMessage[],
    options: LlmCompletionOptions,
    stream: boolean,
  ): Promise<Response> {
    // Local models can be slow to first load; be patient.
    const signal = AbortSignal.timeout(options.timeoutMs ?? 120_000);
    const send = (think: boolean) =>
      this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: this.body(messages, options, think, stream),
        signal,
      });
    let response: Response;
    try {
      response = await send(false);
      if (response.status === 400) {
        const text = await response.text();
        if (/think/i.test(text)) response = await send(true);
        else throw new LlmError("bad_response", "ollama: HTTP 400");
      }
    } catch (error) {
      if (error instanceof LlmError) throw error;
      throw new LlmError("unreachable", "ollama: endpoint did not answer");
    }
    if (!response.ok) {
      throw new LlmError("bad_response", `ollama: HTTP ${response.status}`);
    }
    return response;
  }

  async complete(
    messages: LlmMessage[],
    options: LlmCompletionOptions = {},
  ): Promise<LlmCompletion> {
    const response = await this.post(messages, options, false);
    let payload: ChatResponse;
    try {
      payload = (await response.json()) as ChatResponse;
    } catch {
      throw new LlmError("bad_response", "ollama: malformed response body");
    }
    const content = payload.message?.content;
    if (typeof content !== "string") {
      throw new LlmError("bad_response", "ollama: response carried no content");
    }
    // Tokens spent, nothing said: the model reasoned its budget away. An
    // empty answer would be shown as an empty result; this names it.
    if (content.trim() === "" && (payload.eval_count ?? 0) > 0) {
      throw new LlmError("bad_response", SILENT);
    }
    return {
      content,
      model: payload.model ?? this.model,
      usage: usageOf(payload),
      finish: finishOf(payload.done_reason),
    };
  }

  /**
   * The same call, one JSON object per line. Every line but the last
   * carries a piece of the answer; the last carries `done`, why, and
   * the token counts.
   */
  async *stream(
    messages: LlmMessage[],
    options: Omit<LlmCompletionOptions, "responseFormat"> = {},
  ): AsyncGenerator<LlmStreamEvent, void, undefined> {
    const response = await this.post(messages, options, true);
    let model = this.model;
    let usage: LlmUsage = null;
    let finish: LlmFinish = "unknown";
    let said = 0;
    let spent = 0;
    try {
      for await (const line of readLines(response.body)) {
        if (line.trim() === "") continue;
        let chunk: ChatResponse;
        try {
          chunk = JSON.parse(line) as ChatResponse;
        } catch {
          throw new LlmError("bad_response", "ollama: malformed stream line");
        }
        if (chunk.model) model = chunk.model;
        const text = chunk.message?.content;
        if (typeof text === "string" && text.length > 0) {
          said += text.trim().length;
          yield { type: "delta", text };
        }
        if (chunk.done) {
          usage = usageOf(chunk);
          spent = chunk.eval_count ?? 0;
          finish = finishOf(chunk.done_reason);
        }
      }
    } catch (error) {
      if (error instanceof LlmError) throw error;
      throw new LlmError("unreachable", "ollama: the stream broke off");
    }
    if (said === 0 && spent > 0) throw new LlmError("bad_response", SILENT);
    yield { type: "done", model, usage, finish };
  }

  async healthCheck(): Promise<LlmHealth> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      return {
        ok: false,
        reason: "unreachable",
        detail: `no Ollama endpoint at ${this.baseUrl}`,
      };
    }
    if (!response.ok) {
      return { ok: false, reason: "unreachable", detail: `HTTP ${response.status}` };
    }
    try {
      const payload = (await response.json()) as { models?: Array<{ name?: string }> };
      const names = (payload.models ?? []).map((m) => m.name ?? "");
      const present = names.some(
        (name) => name === this.model || name.startsWith(`${this.model}:`),
      );
      if (!present) {
        // Name what is actually there. "Model not found" sends a person
        // to the documentation; a list of what they have pulled sends
        // them to the one line in .env that needs changing.
        const available = names.filter(Boolean).slice(0, 8).join(", ");
        return {
          ok: false,
          reason: "config",
          detail: available
            ? `model ${this.model} is not pulled. Ollama has: ${available}. Set LLM_MODEL to one of those, or run: ollama pull ${this.model}`
            : `model ${this.model} is not pulled, and Ollama has no models at all. Run: ollama pull ${this.model}`,
        };
      }
    } catch {
      return { ok: false, reason: "unreachable", detail: "malformed response from Ollama" };
    }
    return { ok: true, detail: `reachable, model ${this.model}` };
  }
}
