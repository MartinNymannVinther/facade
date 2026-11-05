import { Hash } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProjectHeader } from "@/components/nav/project-header";
import { requireOrgContext } from "@/core/auth/guard";
import { Link } from "@/i18n/navigation";
import { listChannels } from "@/modules/conversation/channels";
import { listTree } from "@/modules/pages/service";
import { getProject } from "@/modules/projects/service";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ctx = await requireOrgContext();
  const project = ctx ? await getProject(ctx, (await params).id) : null;
  return { title: project?.name ?? "Facade" };
}

export default async function ProjectPage({ params }: Props) {
  const ctx = await requireOrgContext();
  if (!ctx) notFound();
  const project = await getProject(ctx, (await params).id);
  if (!project) notFound();
  const t = await getTranslations("project");
  const tNav = await getTranslations("nav");
  const [tree, channels] = await Promise.all([listTree(ctx), listChannels(ctx)]);
  const top = tree
    .filter((n) => n.projectId === project.id && n.parentId === null)
    .sort((a, b) => a.sort - b.sort);
  const channel = channels.find((c) => c.projectId === project.id);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <ProjectHeader
        id={project.id}
        name={project.name}
        description={project.description}
        icon={project.icon}
        archived={project.archivedAt !== null}
      />
      {channel && (
        <Link
          href={`/channels/${channel.id}`}
          className="text-primary-hover flex w-fit items-center gap-1 text-sm font-medium hover:underline"
        >
          <Hash aria-hidden className="size-4" />
          {t("channel", { name: channel.name })}
        </Link>
      )}
      <section>
        <h2 className="mb-2 text-base font-semibold">{t("pages")}</h2>
        {top.length === 0 && <p className="text-meta text-sm">{t("noPages")}</p>}
        <ul>
          {top.map((page) => (
            <li key={page.id}>
              <Link
                href={`/pages/${page.id}`}
                className="hover:bg-muted -mx-2 block rounded-md px-2 py-1.5 text-sm"
              >
                {page.icon && <span aria-hidden>{page.icon} </span>}
                {page.title || tNav("untitled")}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
