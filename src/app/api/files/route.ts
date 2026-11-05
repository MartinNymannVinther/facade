import { Refused } from "@/core/action";
import { requireOrgContext } from "@/core/auth/guard";
import { crossSite } from "@/core/http/cross-site";
import { rateLimit } from "@/core/rate-limit";
import { MAX_FILE_BYTES, storeFile } from "@/modules/files/service";

/** A file, from a page or the writing field. */
export async function POST(request: Request) {
  if (crossSite(request)) return new Response(null, { status: 403 });
  const ctx = await requireOrgContext();
  if (!ctx) return new Response(null, { status: 401 });
  if (!rateLimit(`file:${ctx.userId}`, 60, 60_000).allowed)
    return new Response(null, { status: 429 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 65_536)
    return new Response(null, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return new Response(null, { status: 400 });
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    return Response.json(await storeFile(ctx, { name: file.name, mime: file.type, bytes }));
  } catch (error) {
    if (error instanceof Refused) return new Response(null, { status: 413 });
    console.error("file upload failed", error);
    return new Response(null, { status: 500 });
  }
}
