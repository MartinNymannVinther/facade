import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrgContext } from "@/core/auth/guard";
import { PageView } from "@/components/page/page-view";
import { getPage } from "@/modules/pages/service";
import { getProject } from "@/modules/projects/service";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ talk?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ctx = await requireOrgContext();
  const page = ctx ? await getPage(ctx, (await params).id) : null;
  return { title: page?.title || "Facade" };
}

export default async function Page({ params, searchParams }: Props) {
  const ctx = await requireOrgContext();
  if (!ctx) notFound();
  const page = await getPage(ctx, (await params).id);
  if (!page) notFound();
  const project = await getProject(ctx, page.projectId);
  return (
    <PageView
      key={page.id}
      openTalk={(await searchParams).talk === "1"}
      page={{
        id: page.id,
        projectId: page.projectId,
        projectName: project?.name ?? "",
        title: page.title,
        icon: page.icon,
        editedAt: page.editedAt?.toISOString() ?? null,
        editedBy: page.editedBy,
      }}
    />
  );
}
