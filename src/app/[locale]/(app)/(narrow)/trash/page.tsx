import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { TrashRow, ArchivedRow } from "@/components/nav/trash-row";
import { requireOrgContext } from "@/core/auth/guard";
import { listTrash } from "@/modules/pages/service";
import { listArchivedProjects } from "@/modules/projects/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("trash"))("title") };
}

export default async function TrashPage() {
  const ctx = await requireOrgContext();
  if (!ctx) notFound();
  const t = await getTranslations("trash");
  const tNav = await getTranslations("nav");
  const format = await getFormatter();
  const [trash, archived] = await Promise.all([listTrash(ctx), listArchivedProjects(ctx)]);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <section>
        {trash.length === 0 && <p className="text-meta text-sm">{t("empty")}</p>}
        <ul>
          {trash.map((page) => (
            <TrashRow
              key={page.id}
              id={page.id}
              title={page.title || tNav("untitled")}
              meta={`${page.project}, ${format.relativeTime(page.deletedAt)}`}
            />
          ))}
        </ul>
      </section>
      {archived.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">{t("archived")}</h2>
          <ul>
            {archived.map((project) => (
              <ArchivedRow key={project.id} id={project.id} name={project.name} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
