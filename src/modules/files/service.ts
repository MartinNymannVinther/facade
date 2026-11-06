import { eq, sql } from "drizzle-orm";
import { Refused } from "@/core/action";
import { files } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { isDemoWorkspace } from "@/modules/demo/service";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_WORKSPACE_FILE_BYTES = 2 * 1024 * 1024 * 1024;
/** A demo is for trying, and two hundred of them share the disk with real work. */
export const MAX_DEMO_FILE_BYTES = 10 * 1024 * 1024;

/** Raster images a browser may draw in place. SVG can carry script: it downloads. */
const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

export function mayShowInline(mime: string): boolean {
  return INLINE.has(mime);
}

export async function storeFile(
  ctx: OrgContext,
  input: { name: string; mime: string; bytes: Buffer },
): Promise<{ id: string; name: string; mime: string; size: number }> {
  if (input.bytes.length === 0 || input.bytes.length > MAX_FILE_BYTES) throw new Refused("invalid");
  const ceiling = (await isDemoWorkspace(ctx.orgId))
    ? MAX_DEMO_FILE_BYTES
    : MAX_WORKSPACE_FILE_BYTES;
  return withOrgContext(ctx, async (tx) => {
    const [used] = await tx
      .select({ total: sql<string>`coalesce(sum(${files.size}), 0)` })
      .from(files);
    if (Number(used?.total ?? 0) + input.bytes.length > ceiling)
      throw new Refused("conflict", "storageFull");
    const [row] = await tx
      .insert(files)
      .values({
        orgId: ctx.orgId,
        name: input.name.slice(0, 200),
        mime: input.mime.slice(0, 120) || "application/octet-stream",
        size: input.bytes.length,
        bytes: input.bytes,
        createdBy: ctx.userId,
      })
      .returning({ id: files.id, name: files.name, mime: files.mime, size: files.size });
    return row!;
  });
}

export async function readFile(ctx: OrgContext, id: string) {
  return withOrgContext(ctx, async (tx) => {
    const [row] = await tx.select().from(files).where(eq(files.id, id));
    return row ?? null;
  });
}
