import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { LlmError, type LlmMessage, type LlmStreamEvent } from "@/core/llm";
import { reserveAiCall, type AiKind } from "./limits";
import { workspaceLlmProvider } from "./model-settings";
import { parseModelJson } from "./parse-json";
import type { AiFailure } from "./wire";

/** The word the interface shows for why the model did not answer. */
export type { AiFailure };

/**
 * One door to the model for every feature: the workspace's provider,
 * the call counted against the ceilings, the wait bounded, and the
 * answer parsed or streamed. There is no engine behind it — a chat with
 * no model is a chat that says so in the writing field, and everything
 * around it keeps working.
 */

export class NoModel extends Error {
  constructor() {
    super("no model");
    this.name = "NoModel";
  }
}

export type ModelAnswer = { data: unknown; engine: string };

/** True when a model is configured for this workspace, for the UI. */
export async function modelConfigured(ctx: OrgContext): Promise<boolean> {
  return (await workspaceLlmProvider(ctx)) !== null;
}

export async function askForJson(
  ctx: OrgContext,
  kind: AiKind,
  messages: LlmMessage[],
  options: { maxTokens?: number } = {},
): Promise<ModelAnswer> {
  const provider = await workspaceLlmProvider(ctx);
  if (!provider) throw new NoModel();
  const engine = `${provider.id}:${provider.model}`;
  await withOrgContext(ctx, (tx) => reserveAiCall(tx, ctx, kind, engine));
  // Local models load slowly the first time; a hosted one answers in seconds.
  const timeoutMs = provider.id === "ollama" ? 240_000 : 60_000;
  const completion = await provider.complete(messages, {
    responseFormat: "json",
    temperature: 0.3,
    maxTokens: options.maxTokens ?? 1200,
    timeoutMs,
  });
  const data = parseModelJson(completion.content);
  if (data === null) throw new LlmError("bad_response", "the model did not answer with JSON");
  return { data, engine };
}

/**
 * The conversation's door: the same provider, the same ceiling, the
 * same count, and the answer as it is written (docs/adr/0011). The call
 * is counted before the first token, so a refusal costs nothing; the
 * iterator is the provider's own, and the caller records the closing
 * event's usage and finish beside the text it collected.
 */
export async function streamAnswer(
  ctx: OrgContext,
  kind: AiKind,
  messages: LlmMessage[],
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<{ engine: string; events: AsyncGenerator<LlmStreamEvent, void, undefined> }> {
  const provider = await workspaceLlmProvider(ctx);
  if (!provider) throw new NoModel();
  const engine = `${provider.id}:${provider.model}`;
  await withOrgContext(ctx, (tx) => reserveAiCall(tx, ctx, kind, engine));
  // A whole answer, not a JSON object: room for a page, and the patience a
  // local model needs to load and then write it.
  const timeoutMs = provider.id === "ollama" ? 600_000 : 300_000;
  return {
    engine,
    events: provider.stream(messages, {
      temperature: options.temperature ?? 0.4,
      maxTokens: options.maxTokens ?? 4096,
      timeoutMs,
    }),
  };
}

export function classifyAiError(error: unknown): AiFailure {
  if (error instanceof NoModel) return "noModel";
  if (error instanceof Error && error.name === "RateLimited") return "rateLimited";
  if (error instanceof LlmError) {
    if (error.reason === "unreachable" || error.reason === "auth") return "unreachable";
    if (error.reason === "rate_limit") return "rateLimited";
    return "badAnswer";
  }
  console.error("ai: call failed", error);
  return "generic";
}
