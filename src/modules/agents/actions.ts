"use server";

import { z } from "zod";
import { runAction } from "@/core/action";
import { createAgent, NewAgent, revokeAgent } from "./service";

export async function createAgentAction(raw: unknown) {
  return runAction(raw, NewAgent, createAgent, ["/settings/agents"]);
}

export async function revokeAgentAction(raw: unknown) {
  const schema = z.object({ id: z.string().min(1).max(100) });
  return runAction(raw, schema, (ctx, i) => revokeAgent(ctx, i.id), ["/settings/agents"]);
}
