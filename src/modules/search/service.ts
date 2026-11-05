import { sql } from "drizzle-orm";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";

export type SearchHit =
  | { kind: "page"; id: string; title: string; icon: string; project: string; snippet: string }
  | {
      kind: "message";
      id: string;
      parentId: string | null;
      channelId: string;
      channel: string;
      pageId: string | null;
      author: string;
      snippet: string;
    };

/**
 * A person's words into a prefix query: "mod spil" finds "moduler" and
 * "spilmotor". Only letters and digits survive, so nothing a person types
 * can reach the tsquery syntax. Empty when there is nothing to look for.
 */
export function toPrefixQuery(input: string): string {
  const words = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .slice(0, 8)
    .map((word) => `${word}:*`)
    .join(" & ");
}

// The marks are the only structure in a snippet: it is drawn as text,
// never as HTML, whatever a page says.
const MARK = `StartSel=⟦,StopSel=⟧,MaxWords=24,MinWords=8,MaxFragments=1`;

export async function search(ctx: OrgContext, input: string): Promise<SearchHit[]> {
  const query = toPrefixQuery(input);
  if (!query) return [];
  const like = `%${input.trim().replace(/[\\%_]/g, "\\$&")}%`;
  return withOrgContext(ctx, async (tx) => {
    const found = await tx.execute(sql`
      with q as (select to_tsquery('simple', ${query}) as simple, to_tsquery('danish', ${query}) as danish)
      select g.id, g.title, g.icon, p.name as project,
        ts_headline('danish', left(coalesce(d.text, ''), 20000), q.danish, ${MARK}) as snippet,
        ts_rank(coalesce(d.search, ''::tsvector), q.danish)
          + case when g.title ilike ${like} then 1 else 0 end as rank
      from pages g
      join projects p on p.id = g.project_id
      left join page_documents d on d.page_id = g.id
      cross join q
      where g.deleted_at is null and p.archived_at is null and (
        g.title ilike ${like}
        or to_tsvector('simple', g.title) @@ q.simple
        or d.search @@ q.danish
        or to_tsvector('simple', coalesce(d.text, '')) @@ q.simple
      )
      order by rank desc limit 20
    `);
    const said = await tx.execute(sql`
      with q as (select to_tsquery('simple', ${query}) as simple, to_tsquery('danish', ${query}) as danish)
      select m.id, m.parent_id, m.channel_id, c.name as channel, c.page_id,
        coalesce(u.name, '') as author,
        ts_headline('danish', m.body, q.danish, ${MARK}) as snippet
      from messages m
      join channels c on c.id = m.channel_id
      left join users u on u.id = m.author_id
      cross join q
      where m.deleted_at is null and (m.search @@ q.danish or to_tsvector('simple', m.body) @@ q.simple)
      order by m.created_at desc limit 20
    `);
    return [
      ...(found.rows as Omit<Extract<SearchHit, { kind: "page" }>, "kind">[]).map((row) => ({
        kind: "page" as const,
        id: row.id,
        title: row.title,
        icon: row.icon,
        project: row.project,
        snippet: row.snippet,
      })),
      ...(
        said.rows as {
          id: string;
          parent_id: string | null;
          channel_id: string;
          channel: string;
          page_id: string | null;
          author: string;
          snippet: string;
        }[]
      ).map((row) => ({
        kind: "message" as const,
        id: row.id,
        parentId: row.parent_id,
        channelId: row.channel_id,
        channel: row.channel,
        pageId: row.page_id,
        author: row.author,
        snippet: row.snippet,
      })),
    ];
  });
}
