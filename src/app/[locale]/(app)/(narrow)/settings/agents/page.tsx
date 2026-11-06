import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getOrgContext } from "@/core/auth/session";
import { env } from "@/core/env";
import { redirect } from "@/i18n/navigation";
import { listAgents } from "@/modules/agents/service";
import { isDemoWorkspace } from "@/modules/demo/service";
import { currentRole } from "@/modules/export/workspace";
import { AgentsAdmin } from "./agents-admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings.agents"))("title") };
}

export default async function AgentsPage() {
  const context = await getOrgContext();
  if (!context) {
    redirect({ href: "/login", locale: await getLocale() });
    return null;
  }
  const [agents, role, demo] = await Promise.all([
    listAgents(context),
    currentRole(context),
    isDemoWorkspace(context.orgId),
  ]);
  return (
    <AgentsAdmin
      agents={agents}
      canManage={!demo && (role === "owner" || role === "admin")}
      demo={demo}
      endpoint={`${env.BETTER_AUTH_URL.replace(/\/$/, "")}/api/mcp`}
    />
  );
}
