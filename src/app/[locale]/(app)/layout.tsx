import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { ownerAccessSummary } from "@/core/access/summary";
import { getOrgContext, getSession } from "@/core/auth/session";
import { organizations } from "@/core/db/schema";
import { withOrgContext } from "@/core/db/tenant";
import { redirect } from "@/i18n/navigation";
import { DemoBanner } from "@/components/demo-banner";
import { LiveProvider } from "@/components/live/live-provider";
import { WorkspaceProvider } from "@/components/nav/workspace-context";
import { SearchPalette } from "@/components/search/palette";
import { modelConfigured } from "@/modules/ai/service";
import { ensureGeneralChannel, listChannels } from "@/modules/conversation/channels";
import { unreadInbox } from "@/modules/conversation/inbox";
import { isDemoWorkspace } from "@/modules/demo/service";
import { listMembers } from "@/modules/export/workspace";
import { listTree } from "@/modules/pages/service";
import { listProjects } from "@/modules/projects/service";
import { AppSidebar } from "./app-sidebar";
import { MobileHeader } from "./mobile-header";
import { SidebarShell, SidebarToggle } from "./sidebar-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const locale = await getLocale();
  if (!session) {
    redirect({ href: "/login", locale });
    return null;
  }
  if (!session.session.activeOrganizationId) {
    redirect({ href: "/onboarding", locale });
    return null;
  }

  // Named in the sidebar lockup, so the tenant is visible on every screen.
  const context = await getOrgContext();
  const [organization] = context
    ? await withOrgContext(context, (tx) =>
        tx
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, context.orgId))
          .limit(1),
      )
    : [];

  // The owner sees how many people are waiting at the door; nobody else
  // is told there is a door.
  const attention = (await ownerAccessSummary())?.pending ?? 0;
  const t = await getTranslations("app.nav");
  const tNav = await getTranslations("nav");
  if (!context) {
    redirect({ href: "/onboarding", locale });
    return null;
  }
  await ensureGeneralChannel(context, tNav("generalChannel"));
  const [projects, tree, channels, members, inbox, aiReady] = await Promise.all([
    listProjects(context),
    listTree(context),
    listChannels(context),
    listMembers(context),
    unreadInbox(context),
    modelConfigured(context),
  ]);
  const shownProjects = projects.map(({ id, name, icon }) => ({ id, name, icon }));
  const openProjects = new Set(projects.map((p) => p.id));
  const demo = await isDemoWorkspace(context.orgId);

  // Read on the server so the first paint is already the layout this
  // person left behind, rather than a rail that appears and vanishes.
  const sidebarHidden = (await cookies()).get("facade-sidebar")?.value === "hidden";

  return (
    <WorkspaceProvider
      value={{
        me: { id: session.user.id, name: session.user.name },
        people: members
          .filter((m) => m.role !== "former_agent")
          .map((m) => ({ id: m.userId, name: m.name, agent: m.role === "agent" })),
        projects: shownProjects,
        tree: tree.filter((n) => openProjects.has(n.projectId)),
        channels,
        inbox,
        aiReady,
      }}
    >
      <LiveProvider>
        <div className="flex h-svh min-h-0 overflow-hidden">
          {/* Tabbing into a page should not mean tabbing through the whole
          sidebar first, every time. */}
          <a
            href="#main"
            className="bg-card text-foreground focus:ring-ring sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:ring-2"
          >
            {t("skipToContent")}
          </a>
          <SidebarShell
            defaultHidden={sidebarHidden}
            sidebar={
              <AppSidebar
                userName={session.user.name}
                userEmail={session.user.email}
                organization={organization?.name ?? ""}
                attention={attention}
                toggle={<SidebarToggle placement="sidebar" />}
              />
            }
          >
            {demo && <DemoBanner />}
            <MobileHeader
              userName={session.user.name}
              userEmail={session.user.email}
              organization={organization?.name ?? ""}
              attention={attention}
            />
            <SearchPalette />
            {children}
          </SidebarShell>
        </div>
      </LiveProvider>
    </WorkspaceProvider>
  );
}
