import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { Refused } from "@/core/action";
import { authDb } from "@/core/db/client";
import { agentTokens, memberships, users } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { isDemoWorkspace } from "@/modules/demo/service";
import { currentRole } from "@/modules/export/workspace";
import { publish } from "@/modules/live/hub";

/**
 * An agent is a member who cannot log in (docs/adr/0015): a users row with no
 * account, in one workspace, with the role `agent`. So its name stands on
 * what it writes, a colleague can @-name it, and RLS needs no special case.
 * Revoking keeps the row with the role `former_agent`, or its words would
 * lose their author.
 */

export const AGENT_ROLE = "agent";
export const FORMER_AGENT_ROLE = "former_agent";
const EMAIL_DOMAIN = "agents.facade.invalid";

export const AgentAccess = z.enum(["read", "write"]);
export type AgentAccess = z.infer<typeof AgentAccess>;

export const NewAgent = z.object({
  name: z.string().trim().min(1).max(60),
  access: AgentAccess,
});

export type AgentContext = OrgContext & { tokenId: string; access: AgentAccess; name: string };

export type AgentView = {
  id: string;
  name: string;
  access: string;
  lastUsedAt: Date | null;
  createdAt: Date;
};

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

async function requireManager(ctx: OrgContext) {
  const role = await currentRole(ctx);
  if (role !== "owner" && role !== "admin") throw new Refused("forbidden");
}

export async function createAgent(
  ctx: OrgContext,
  input: z.infer<typeof NewAgent>,
): Promise<{ id: string; token: string }> {
  await requireManager(ctx);
  // A key reaches past the browser, and a demo is anybody's.
  if (await isDemoWorkspace(ctx.orgId)) throw new Refused("forbidden");
  const userId = randomUUID();
  await authDb.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ id: userId, name: input.name, email: `${userId}@${EMAIL_DOMAIN}` });
    await tx.insert(memberships).values({
      id: randomUUID(),
      organizationId: ctx.orgId,
      userId,
      role: AGENT_ROLE,
    });
  });
  const token = `fa_${randomBytes(32).toString("base64url")}`;
  const id = await withOrgContext(ctx, async (tx) => {
    const [row] = await tx
      .insert(agentTokens)
      .values({
        orgId: ctx.orgId,
        userId,
        tokenHash: hashOf(token),
        access: input.access,
        createdBy: ctx.userId,
      })
      .returning({ id: agentTokens.id });
    return row!.id;
  });
  publish(ctx.orgId, { type: "tree" });
  return { id, token };
}

export async function listAgents(ctx: OrgContext): Promise<AgentView[]> {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: agentTokens.id,
        name: users.name,
        access: agentTokens.access,
        lastUsedAt: agentTokens.lastUsedAt,
        createdAt: agentTokens.createdAt,
      })
      .from(agentTokens)
      .innerJoin(users, eq(users.id, agentTokens.userId))
      .where(isNull(agentTokens.revokedAt))
      .orderBy(desc(agentTokens.createdAt)),
  );
}

export async function revokeAgent(ctx: OrgContext, id: string): Promise<void> {
  await requireManager(ctx);
  const row = await withOrgContext(ctx, async (tx) => {
    const [revoked] = await tx
      .update(agentTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(agentTokens.id, id), isNull(agentTokens.revokedAt)))
      .returning({ userId: agentTokens.userId });
    return revoked;
  });
  if (!row) throw new Refused("notFound");
  await authDb
    .update(memberships)
    .set({ role: FORMER_AGENT_ROLE })
    .where(and(eq(memberships.userId, row.userId), eq(memberships.organizationId, ctx.orgId)));
  publish(ctx.orgId, { type: "tree" });
}

/** A key to the agent it opens, or null. Removing the member shuts it too. */
export async function authenticateAgent(token: string): Promise<AgentContext | null> {
  if (!token.startsWith("fa_") || token.length > 100) return null;
  const [row] = await authDb
    .select({
      tokenId: agentTokens.id,
      orgId: agentTokens.orgId,
      userId: agentTokens.userId,
      access: agentTokens.access,
      name: users.name,
      lastUsedAt: agentTokens.lastUsedAt,
    })
    .from(agentTokens)
    .innerJoin(users, eq(users.id, agentTokens.userId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, agentTokens.userId),
        eq(memberships.organizationId, agentTokens.orgId),
        eq(memberships.role, AGENT_ROLE),
      ),
    )
    .where(and(eq(agentTokens.tokenHash, hashOf(token)), isNull(agentTokens.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
    await authDb
      .update(agentTokens)
      .set({ lastUsedAt: sql`now()` })
      .where(eq(agentTokens.id, row.tokenId));
  const { lastUsedAt: _used, ...agent } = row;
  return { ...agent, access: AgentAccess.parse(row.access) };
}
