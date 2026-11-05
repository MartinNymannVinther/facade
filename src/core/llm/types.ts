/**
 * LLM adapter boundary (CLAUDE.md): all model access goes through this
 * interface, providers prefer EU-hosted (Mistral) or local/self-hosted
 * (Ollama-compatible) endpoints, and nothing an AI writes leaves the
 * house without a person — enforced by the features that use this, not
 * here.
 *
 * Two doors. `complete` answers with one completion, optionally as a JSON
 * object, and is what the family's tools use for proposals. `stream`
 * answers with the tokens as they arrive, which is what a conversation
 * lives on (docs/adr/0011); it ends with the same usage and model the
 * completion would have carried, so a caller can record either the same
 * way. A health check validates configuration without burning tokens.
 */

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmCompletionOptions = {
  /** Upper bound on generated tokens; providers apply their own default. */
  maxTokens?: number;
  /** 0..1; defaults to a low, deterministic-ish value. */
  temperature?: number;
  /** Ask the model to emit a single JSON object. */
  responseFormat?: "text" | "json";
  timeoutMs?: number;
};

/**
 * Why the model stopped. `length` means it hit the token ceiling
 * mid-sentence, which a conversation shows and offers to continue from;
 * `unknown` is a provider that did not say.
 */
export type LlmFinish = "stop" | "length" | "unknown";

export type LlmUsage = { inputTokens: number; outputTokens: number } | null;

export type LlmCompletion = {
  content: string;
  model: string;
  usage: LlmUsage;
  finish: LlmFinish;
};

/** What a stream yields: text as it comes, then one closing event. */
export type LlmStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; model: string; usage: LlmUsage; finish: LlmFinish };

export type LlmHealth =
  | { ok: true; detail: string }
  | { ok: false; reason: "auth" | "unreachable" | "config"; detail: string };

export interface LlmProvider {
  /** Stable identifier, e.g. "mistral" or "ollama". */
  readonly id: string;
  /** Human-readable name for the settings UI. */
  readonly label: string;
  /** The model completions will use. */
  readonly model: string;
  complete(messages: LlmMessage[], options?: LlmCompletionOptions): Promise<LlmCompletion>;
  /**
   * The same call, token by token. Errors before the first token throw
   * the same `LlmError` as `complete`; a connection that breaks
   * mid-answer throws `unreachable` from the iterator, after whatever
   * text got through. JSON mode is not offered here: a partial object is
   * not a thing to show anyone.
   */
  stream(
    messages: LlmMessage[],
    options?: Omit<LlmCompletionOptions, "responseFormat">,
  ): AsyncGenerator<LlmStreamEvent, void, undefined>;
  /** Cheap configuration probe: auth/reachability, no token spend. */
  healthCheck(): Promise<LlmHealth>;
}

/** Thrown by providers on failed completions; carries no secrets. */
export class LlmError extends Error {
  constructor(
    readonly reason: "auth" | "rate_limit" | "unreachable" | "bad_response",
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
