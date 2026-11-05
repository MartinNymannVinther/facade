import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { InboxActions, InboxLink } from "@/components/conversation/inbox-actions";
import { requireOrgContext } from "@/core/auth/guard";
import { listInbox } from "@/modules/conversation/inbox";
import { plainMentions } from "@/modules/conversation/view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("inbox"))("title") };
}

export default async function InboxPage() {
  const ctx = await requireOrgContext();
  if (!ctx) notFound();
  const t = await getTranslations("inbox");
  const format = await getFormatter();
  const items = await listInbox(ctx);
  const unread = items.filter((i) => !i.read).length;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {unread > 0 && <InboxActions />}
      </div>
      {items.length === 0 && <p className="text-meta text-sm">{t("empty")}</p>}
      <ul className="flex flex-col">
        {items.map((item) => {
          const where = item.pageId
            ? (item.pageTitle ?? "")
            : item.channelName
              ? `#${item.channelName}`
              : "";
          const href = item.pageId
            ? item.kind === "page_mention"
              ? `/pages/${item.pageId}`
              : `/pages/${item.pageId}?talk=1`
            : `/channels/${item.channelId}${item.messageId ? `?thread=${item.parentId ?? item.messageId}` : ""}`;
          return (
            <li key={item.id}>
              <InboxLink id={item.id} href={href} read={item.read}>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm">
                    {t(`kind.${item.kind}`, { actor: item.actor ?? "", where })}
                  </span>
                  <span className="text-meta shrink-0 text-xs">
                    {format.relativeTime(item.createdAt)}
                  </span>
                </span>
                {item.excerpt && (
                  <span className="text-meta line-clamp-2 text-sm">
                    {plainMentions(item.excerpt)}
                  </span>
                )}
              </InboxLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
