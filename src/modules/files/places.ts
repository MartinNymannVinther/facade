import { and, inArray, isNull } from "drizzle-orm";
import { files } from "@/core/db/schema";
import type { AppTransaction } from "@/core/db/tenant";

/**
 * Where a file was shared, written the first time it lands somewhere
 * (docs/adr/0016). A file already placed keeps its place: a picture copied
 * from one page to the next still belongs to the first. RLS checks that
 * every id named here is in the active workspace.
 */

type Place = { projectId: string | null; pageId: string | null; messageId?: string };

export async function placeFiles(tx: AppTransaction, ids: string[], place: Place): Promise<void> {
  if (!ids.length) return;
  await tx
    .update(files)
    .set({
      projectId: place.projectId,
      pageId: place.pageId,
      messageId: place.messageId ?? null,
    })
    .where(and(inArray(files.id, ids), isNull(files.messageId), isNull(files.pageId)));
}
