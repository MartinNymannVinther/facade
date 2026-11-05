import type { NextRequest } from "next/server";
import { requireOrgContext } from "@/core/auth/guard";
import { rateLimit } from "@/core/rate-limit";
import { exportFileName, exportToJson, exportToXlsx } from "@/modules/export/format";
import { exportMarkdownZip } from "@/modules/export/markdown";
import { buildOrgExport } from "@/modules/export/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything this organization holds, as one file.
 *
 * Behind the ordinary session guard and the ordinary org context, so it can
 * only ever hand out the data of the organization the caller is signed in
 * to. The response is marked no-store: a full export is the last thing that
 * should sit in a shared cache.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireOrgContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  // A download is a person's click. An image tag on a page pointing here is
  // every reader of that page starting the heaviest request there is.
  if (request.headers.get("sec-fetch-dest") === "image") return new Response(null, { status: 403 });
  if (!rateLimit(`export:${ctx.orgId}`, 6, 10 * 60_000).allowed)
    return new Response(null, { status: 429 });

  const format = request.nextUrl.searchParams.get("format");
  const wantsJson = format === "json";
  const data = await buildOrgExport(ctx);
  const name = data.organization?.name ?? "facade";

  if (format === "markdown") {
    return new Response(Buffer.from(await exportMarkdownZip(ctx)), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${exportFileName(name, data.exportedAt, "zip")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (wantsJson) {
    return new Response(exportToJson(data), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(name, data.exportedAt, "json")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const workbook = exportToXlsx(data);
  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName(name, data.exportedAt, "xlsx")}"`,
      "Cache-Control": "no-store",
    },
  });
}
