import { requireOrgContext } from "@/core/auth/guard";
import { mayShowInline, readFile } from "@/modules/files/service";

/**
 * A file back out. Anything but a plain raster image is a download, and
 * nosniff plus the sandbox keep an uploaded page from running on our origin.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  if (!ctx) return new Response(null, { status: 401 });
  const file = await readFile(ctx, (await params).id);
  if (!file) return new Response(null, { status: 404 });
  const inline = mayShowInline(file.mime);
  const name = encodeURIComponent(file.name);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": inline ? file.mime : "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
