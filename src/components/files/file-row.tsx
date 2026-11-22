import { FileText } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { mayShowInline } from "@/modules/files/service";
import type { SharedFile } from "@/modules/files/shared";
import { formatSize, placeHref } from "@/modules/files/view";

/**
 * One shared file: a picture shows itself, anything else is a download, and
 * beside it who shared it, when, and where to see it in its place.
 */
export async function FileRow({ file, channel }: { file: SharedFile; channel: string }) {
  const t = await getTranslations("files");
  const tNav = await getTranslations("nav");
  const format = await getFormatter();
  const locale = await getLocale();
  const src = `/api/files/${file.id}`;
  const image = mayShowInline(file.mime);
  const href = placeHref({
    pageId: file.page?.id ?? null,
    messageId: file.message?.id ?? null,
    channelId: file.message?.channelId ?? null,
    parentId: file.message?.parentId ?? null,
  });
  const title = file.page?.title || tNav("untitled");
  const where = file.message
    ? file.page
      ? t("inTalk", { title })
      : t("inChannel", { channel })
    : t("onPage", { title });

  return (
    <li className="border-border flex items-center gap-3 border-b py-2.5 last:border-b-0">
      <a
        href={src}
        {...(image ? { target: "_blank", rel: "noopener" } : { download: file.name })}
        className="bg-secondary flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md"
        aria-label={t("open", { name: file.name })}
      >
        {image ? (
          // Served from the workspace's own files; next/image would need a loader for a cookie-guarded route.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <FileText aria-hidden className="text-meta size-5" />
        )}
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <a
          href={src}
          {...(image ? { target: "_blank", rel: "noopener" } : { download: file.name })}
          className="truncate text-sm font-medium hover:underline"
        >
          {file.name}
        </a>
        <span className="text-meta truncate text-xs">
          {formatSize(file.size, locale)} · {file.author ?? t("someone")} ·{" "}
          {format.relativeTime(new Date(file.createdAt))} ·{" "}
          {href ? (
            <Link href={href} className="hover:text-foreground underline-offset-2 hover:underline">
              {where}
            </Link>
          ) : (
            where
          )}
        </span>
      </div>
    </li>
  );
}
