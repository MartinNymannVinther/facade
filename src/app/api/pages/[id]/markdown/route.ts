import { Refused } from "@/core/action";
import { requireOrgContext } from "@/core/auth/guard";
import { jsonToMarkdown } from "@/modules/pages/document";
import { getPage } from "@/modules/pages/service";
import { loadJson } from "@/modules/pages/sync";

/** One page out, as a file. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgContext();
  if (!ctx) return new Response(null, { status: 401 });
  const id = (await params).id;
  const page = await getPage(ctx, id);
  if (!page) return new Response(null, { status: 404 });
  try {
    const body = `# ${page.title}\n\n${jsonToMarkdown(await loadJson(ctx, id))}\n`;
    const name = encodeURIComponent(`${page.title || "side"}.md`);
    return new Response(body, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Refused) return new Response(null, { status: 404 });
    throw error;
  }
}
