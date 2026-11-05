"use client";

import { ChevronRight, Hash, Inbox, House, Plus, Search, Trash2, CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CountPill } from "@/components/ui/count-pill";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useLive } from "@/components/live/live-provider";
import { NameDialog } from "@/components/nav/name-dialog";
import { PageTree } from "@/components/nav/page-tree";
import { PersonDot, useWorkspace } from "@/components/nav/workspace-context";
import { openSearch } from "@/components/search/palette";
import { cn } from "@/lib/utils";
import { createChannelAction } from "@/modules/conversation/actions";
import { createPageAction } from "@/modules/pages/actions";
import { breadcrumbs } from "@/modules/pages/tree";
import { createProjectAction } from "@/modules/projects/actions";

const OPEN_KEY = "facade-open";

export function navItemClass(active: boolean): string {
  return cn(
    "flex items-center gap-2 rounded-[7px] px-2 h-8 text-sm transition-colors duration-[120ms] ease-out",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
      : "text-sidebar-foreground hover:bg-sidebar-hover",
  );
}

function Section({
  title,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  addLabel?: string;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4">
      <div className="flex h-7 items-center justify-between pr-1 pl-2">
        <h2 className="text-label text-xs font-medium">{title}</h2>
        {onAdd && (
          <button
            type="button"
            aria-label={addLabel}
            title={addLabel}
            onClick={onAdd}
            className="text-meta hover:text-foreground hover:bg-sidebar-hover flex size-6 items-center justify-center rounded"
          >
            <Plus aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * The rail: where to go, what waits, what the projects hold, who is here.
 * Rendered on the desktop and inside the mobile sheet, where `onNavigate`
 * lets the sheet close itself.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const { projects, tree, channels, people, inbox } = useWorkspace();
  const { online } = useLive();
  const [stored, setStored] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState<"project" | "channel" | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state, read after hydration
      setStored(new Set(saved));
    } catch {}
  }, []);

  // The way down to the open page is always unfolded.
  const open = useMemo(() => {
    const id = pathname.match(/^\/pages\/([^/]+)/)?.[1];
    const trail = id ? breadcrumbs(tree, id).slice(0, -1) : [];
    const projectId = id ? tree.find((n) => n.id === id)?.projectId : undefined;
    return new Set([...stored, ...trail.map((n) => n.id), ...(projectId ? [projectId] : [])]);
  }, [stored, pathname, tree]);

  const setOpen = useCallback((id: string, value: boolean) => {
    setStored((was) => {
      const next = new Set(was);
      if (value) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  async function addProject(name: string) {
    const made = await createProjectAction({ name });
    if (!made.ok) {
      toast.error(t("failed"));
      return;
    }
    setAsking(null);
    onNavigate?.();
    setOpen(made.data.id, true);
    router.push(`/projects/${made.data.id}`);
  }

  async function addPage(projectId: string) {
    const made = await createPageAction({ projectId });
    if (!made.ok) return toast.error(t("failed"));
    setOpen(projectId, true);
    onNavigate?.();
    router.push(`/pages/${made.data.id}`);
  }

  async function addChannel(name: string) {
    const made = await createChannelAction({ name });
    if (!made.ok) {
      toast.error(made.error === "conflict" ? t("channelTaken") : t("failed"));
      return;
    }
    setAsking(null);
    onNavigate?.();
    router.push(`/channels/${made.data.id}`);
  }

  const link = (href: string, icon: React.ReactNode, label: string, count = 0) => (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={pathname === href ? "page" : undefined}
      className={navItemClass(pathname === href)}
    >
      {icon}
      <span className="truncate">{label}</span>
      <CountPill count={count} />
    </Link>
  );

  return (
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 py-1">
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          openSearch();
        }}
        className={cn(navItemClass(false), "w-full")}
      >
        <Search aria-hidden className="text-meta size-4" />
        <span>{t("search")}</span>
        <kbd className="text-label ml-auto hidden font-sans text-xs lg:block">⌘K</kbd>
      </button>
      {link("/home", <House aria-hidden className="text-meta size-4" />, t("home"))}
      {link("/inbox", <Inbox aria-hidden className="text-meta size-4" />, t("inbox"), inbox)}

      <Section title={t("projects")} addLabel={t("addProject")} onAdd={() => setAsking("project")}>
        {projects.length === 0 && <p className="text-meta px-2 py-1 text-sm">{t("noProjects")}</p>}
        <ul>
          {projects.map((project) => {
            const expanded = open.has(project.id);
            const href = `/projects/${project.id}`;
            return (
              <li key={project.id}>
                <div
                  className={cn(
                    "group/project flex h-8 items-center gap-0.5 rounded-[7px] pr-1 pl-1 text-sm transition-colors",
                    pathname === href
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-hover",
                  )}
                >
                  <button
                    type="button"
                    aria-label={expanded ? t("collapse") : t("expand")}
                    aria-expanded={expanded}
                    onClick={() => setOpen(project.id, !expanded)}
                    className="text-meta hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded"
                  >
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        "size-3.5 transition-transform duration-[120ms]",
                        expanded && "rotate-90",
                      )}
                    />
                  </button>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1 font-medium"
                  >
                    {project.icon && <span aria-hidden>{project.icon}</span>}
                    <span className="truncate">{project.name}</span>
                  </Link>
                  <button
                    type="button"
                    aria-label={t("addPageTo", { project: project.name })}
                    title={t("addPage")}
                    onClick={() => void addPage(project.id)}
                    className="text-meta hover:text-foreground hover:bg-sidebar-accent flex size-6 shrink-0 items-center justify-center rounded opacity-100 lg:opacity-0 lg:group-focus-within/project:opacity-100 lg:group-hover/project:opacity-100"
                  >
                    <Plus aria-hidden className="size-3.5" />
                  </button>
                </div>
                {expanded && (
                  <PageTree
                    nodes={tree}
                    projectId={project.id}
                    open={open}
                    setOpen={setOpen}
                    onNavigate={onNavigate}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t("channels")} addLabel={t("addChannel")} onAdd={() => setAsking("channel")}>
        <ul>
          {channels.map((channel) => (
            <li key={channel.id}>
              <Link
                href={`/channels/${channel.id}`}
                onClick={onNavigate}
                aria-current={pathname === `/channels/${channel.id}` ? "page" : undefined}
                className={cn(
                  navItemClass(pathname === `/channels/${channel.id}`),
                  channel.unread > 0 && "text-foreground font-semibold",
                )}
              >
                <Hash aria-hidden className="text-meta size-3.5 shrink-0" />
                <span className="truncate">{channel.name}</span>
                <CountPill count={channel.unread} />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("people")}>
        <ul>
          {people.map((person) => (
            <li key={person.id} className="flex h-8 items-center gap-2 px-2 text-sm">
              <span className="relative">
                <PersonDot person={person} size={22} />
                <span
                  className={cn(
                    "border-sidebar absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2",
                    online.has(person.id) ? "bg-primary" : "bg-input",
                  )}
                />
              </span>
              <span className="text-sidebar-foreground truncate">{person.name}</span>
              <span className="sr-only">{online.has(person.id) ? t("online") : t("offline")}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mt-4">
        {link("/trash", <Trash2 aria-hidden className="text-meta size-4" />, t("trash"))}
        {link("/help", <CircleHelp aria-hidden className="text-meta size-4" />, t("help"))}
      </div>
      {asking === "project" && (
        <NameDialog
          title={t("addProject")}
          label={t("projectName")}
          action={t("create")}
          onClose={() => setAsking(null)}
          onSubmit={addProject}
        />
      )}
      {asking === "channel" && (
        <NameDialog
          title={t("addChannel")}
          label={t("channelName")}
          action={t("create")}
          onClose={() => setAsking(null)}
          onSubmit={addChannel}
        />
      )}
    </nav>
  );
}

/**
 * Settings sits apart at the foot of the sidebar, above the user card. The
 * count is the installation owner's: applications waiting for a decision.
 */
export function SidebarSettingsLink({
  onNavigate,
  attention = 0,
}: {
  onNavigate?: () => void;
  attention?: number;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = pathname.startsWith("/settings");
  return (
    <Link
      href={attention > 0 ? "/settings/access" : "/settings/workspace"}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={navItemClass(active)}
    >
      {t("settings")}
      <CountPill count={attention} />
    </Link>
  );
}
