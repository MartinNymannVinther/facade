import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ProjectButton } from "@/components/nav/project-button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireOrgContext } from "@/core/auth/guard";
import { Link } from "@/i18n/navigation";
import { recentPages } from "@/modules/pages/service";
import { listProjects } from "@/modules/projects/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("home"))("title") };
}

export default async function HomePage() {
  const ctx = await requireOrgContext();
  if (!ctx) notFound();
  const t = await getTranslations("home");
  const tNav = await getTranslations("nav");
  const format = await getFormatter();
  const [recent, projects] = await Promise.all([recentPages(ctx), listProjects(ctx)]);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      {projects.length === 0 ? (
        <EmptyState title={t("emptyTitle")} hint={t("emptyHint")} action={<ProjectButton />} />
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-base font-semibold">{t("projects")}</h2>
            <ul className="flex flex-col">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="hover:bg-muted -mx-2 flex items-baseline gap-3 rounded-md px-2 py-1.5"
                  >
                    <span className="font-medium">
                      {project.icon && <span aria-hidden>{project.icon} </span>}
                      {project.name}
                    </span>
                    <span className="text-meta truncate text-sm">{project.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-base font-semibold">{t("recent")}</h2>
            {recent.length === 0 && <p className="text-meta text-sm">{t("noRecent")}</p>}
            <ul className="flex flex-col">
              {recent.map((page) => (
                <li key={page.id}>
                  <Link
                    href={`/pages/${page.id}`}
                    className="hover:bg-muted -mx-2 flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5"
                  >
                    <span className="min-w-0 truncate text-sm">
                      {page.icon && <span aria-hidden>{page.icon} </span>}
                      {page.title || tNav("untitled")}
                      <span className="text-meta ml-2">{page.project}</span>
                    </span>
                    <span className="text-meta shrink-0 text-xs">
                      {page.editedBy ? `${page.editedBy}, ` : ""}
                      {format.relativeTime(page.editedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
