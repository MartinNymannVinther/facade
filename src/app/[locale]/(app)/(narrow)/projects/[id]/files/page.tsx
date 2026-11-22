import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileRow } from "@/components/files/file-row";
import { UploadZone } from "@/components/files/upload-zone";
import { SegmentedFilter } from "@/components/ui/segmented";
import { requireOrgContext } from "@/core/auth/guard";
import { Link } from "@/i18n/navigation";
import { listChannels } from "@/modules/conversation/channels";
import { listProjectFiles, type FileKind } from "@/modules/files/shared";
import { getProject } from "@/modules/projects/service";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
};

const KINDS: FileKind[] = ["all", "images", "other"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ctx = await requireOrgContext();
  const project = ctx ? await getProject(ctx, (await params).id) : null;
  const t = await getTranslations("files");
  return { title: project ? t("titleIn", { name: project.name }) : "Facade" };
}

/** Everything shared in a project, wherever it was shared (docs/adr/0016). */
export default async function ProjectFilesPage({ params, searchParams }: Props) {
  const ctx = await requireOrgContext();
  if (!ctx) notFound();
  const project = await getProject(ctx, (await params).id);
  if (!project) notFound();
  const asked = (await searchParams).kind;
  const kind = KINDS.find((k) => k === asked) ?? "all";
  const t = await getTranslations("files");
  const [shared, channels] = await Promise.all([
    listProjectFiles(ctx, project.id, kind),
    listChannels(ctx),
  ]);
  const channel = channels.find((c) => c.projectId === project.id);
  const base = `/projects/${project.id}/files`;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link
          href={`/projects/${project.id}`}
          className="text-meta hover:text-foreground flex w-fit items-center gap-0.5 text-sm"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {project.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </div>
      {channel && <UploadZone channelId={channel.id} channel={channel.name} />}
      <SegmentedFilter
        className="w-fit"
        items={KINDS.map((k) => ({
          key: k,
          label: t(k),
          href: k === "all" ? base : `${base}?kind=${k}`,
          active: k === kind,
        }))}
      />
      {shared.length === 0 ? (
        <p className="text-meta text-sm">{kind === "all" ? t("empty") : t("emptyKind")}</p>
      ) : (
        <ul>
          {shared.map((file) => (
            <FileRow key={file.id} file={file} channel={channel?.name ?? ""} />
          ))}
        </ul>
      )}
    </div>
  );
}
