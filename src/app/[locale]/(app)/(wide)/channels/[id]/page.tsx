import { Hash } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CatchUp } from "@/components/conversation/catch-up";
import { Conversation } from "@/components/conversation/conversation";
import { requireOrgContext } from "@/core/auth/guard";
import { getChannel } from "@/modules/conversation/channels";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ thread?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ctx = await requireOrgContext();
  const channel = ctx ? await getChannel(ctx, (await params).id) : null;
  return { title: channel ? `#${channel.name}` : "Facade" };
}

export default async function ChannelPage({ params, searchParams }: Props) {
  const ctx = await requireOrgContext();
  if (!ctx) notFound();
  const channel = await getChannel(ctx, (await params).id);
  if (!channel || channel.kind === "page") notFound();
  const t = await getTranslations("conversation");
  const { thread } = await searchParams;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="border-hairline flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Hash aria-hidden className="text-meta size-4 shrink-0" />
        <h1 className="truncate text-sm font-semibold">{channel.name}</h1>
        {channel.topic && (
          <p className="text-meta hidden truncate text-sm md:block">{channel.topic}</p>
        )}
        <span className="ml-auto" />
        <CatchUp channelId={channel.id} projectId={channel.projectId} />
      </header>
      <Conversation
        // A link to a thread opens it, also from inside the same channel.
        key={`${channel.id}-${thread ?? ""}`}
        channelId={channel.id}
        thread={thread ?? null}
        emptyHint={t("empty")}
        placeholder={t("placeholder", { channel: channel.name })}
      />
    </div>
  );
}
