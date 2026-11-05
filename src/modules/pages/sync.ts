import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as Y from "yjs";
import { Refused } from "@/core/action";
import {
  memberships,
  notifications,
  pageDocuments,
  pages,
  pageUpdates,
  pageVersions,
} from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";
import { publishToPage, publishToUser } from "@/modules/live/hub";
import { buildDoc, docToJson, encodeDoc, isValidUpdate, mentionsOf, textOf } from "./document";

/**
 * Where the words go when they leave the browser (docs/adr/0011).
 *
 * Every edit is appended to `page_updates` and passed on to whoever else
 * has the page open. A moment after the typing stops the page is settled:
 * the log is folded into the document, the text is read out for search, and
 * every ten minutes of writing leaves a version behind. Nothing depends on
 * a settle happening; an unsettled log is still the page.
 */

export const MAX_UPDATE_BYTES = 2_000_000;
export const VERSION_EVERY_MS = 10 * 60 * 1000;
const SETTLE_AFTER_MS = 2500;
/** Somebody who never pauses still gets folded. */
const SETTLE_AT_MOST_MS = 10_000;
const VERSIONS_KEPT = 200;

type Parts = { state: Buffer | null; updates: { seq: number; update: Buffer }[] };

/**
 * The document and its log in one statement, so a settle running beside us
 * cannot have moved updates out of the log and not yet into what we read.
 */
async function readParts(
  tx: AppTransaction,
  pageId: string,
  includeTrashed = false,
): Promise<Parts | null> {
  const result = await tx.execute(sql`
    select d.state as state,
      (select array_agg(u.seq order by u.seq) from page_updates u where u.page_id = g.id) as seqs,
      (select array_agg(u.update order by u.seq) from page_updates u where u.page_id = g.id) as updates
    from pages g
    left join page_documents d on d.page_id = g.id
    where g.id = ${pageId} and (g.deleted_at is null or ${includeTrashed}::boolean)
  `);
  const row = result.rows[0] as
    { state: Buffer | null; seqs: string[] | null; updates: Buffer[] | null } | undefined;
  if (!row) return null;
  return {
    state: row.state,
    updates: (row.updates ?? []).map((update, i) => ({ seq: Number(row.seqs![i]), update })),
  };
}

function partsToDoc({ state, updates }: Parts): Y.Doc {
  return buildDoc([...(state ? [state] : []), ...updates.map((u) => u.update)]);
}

export async function loadState(ctx: OrgContext, pageId: string): Promise<Uint8Array> {
  const parts = await withOrgContext(ctx, (tx) => readParts(tx, pageId));
  if (!parts) throw new Refused("notFound");
  return encodeDoc(partsToDoc(parts));
}

/** The document as JSON, for whoever needs to read it on the server. */
export async function loadJson(ctx: OrgContext, pageId: string) {
  const parts = await withOrgContext(ctx, (tx) => readParts(tx, pageId));
  if (!parts) throw new Refused("notFound");
  return docToJson(partsToDoc(parts));
}

export async function appendUpdate(
  ctx: OrgContext,
  pageId: string,
  update: Uint8Array,
  from?: string,
): Promise<void> {
  if (update.length > MAX_UPDATE_BYTES || !isValidUpdate(update)) throw new Refused("invalid");
  await withOrgContext(ctx, async (tx) => {
    // A page a colleague just trashed still takes the words on their way to
    // it: the trash gives pages back, and they should come back whole.
    const [page] = await tx.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId));
    if (!page) throw new Refused("notFound");
    await tx.insert(pageUpdates).values({
      orgId: ctx.orgId,
      pageId,
      update: Buffer.from(update),
      userId: ctx.userId,
    });
  });
  const data = Buffer.from(update).toString("base64");
  publishToPage(ctx.orgId, pageId, { type: "doc.update", pageId, data, from: from ?? "" }, from);
  scheduleSettle(ctx, pageId);
}

type Pending = { timer: ReturnType<typeof setTimeout>; since: number };

const store = globalThis as unknown as { __facadeSettles?: Map<string, Pending> };
const settles = (store.__facadeSettles ??= new Map());

function scheduleSettle(ctx: OrgContext, pageId: string): void {
  const pending = settles.get(pageId);
  if (pending) clearTimeout(pending.timer);
  const since = pending?.since ?? Date.now();
  const wait = Math.min(SETTLE_AFTER_MS, Math.max(0, since + SETTLE_AT_MOST_MS - Date.now()));
  const timer = setTimeout(() => {
    settles.delete(pageId);
    settlePage(ctx, pageId).catch((error) => console.error("settle failed", pageId, error));
  }, wait);
  timer.unref?.();
  settles.set(pageId, { timer, since });
}

export type SettleReason = "auto" | "restore" | "ai";

/**
 * Folds the log into the document. The row lock makes two settles of one
 * page take turns; edits arriving meanwhile are simply left for the next.
 * `reason` other than auto always cuts a version, whatever the clock says.
 */
export async function settlePage(
  ctx: OrgContext,
  pageId: string,
  reason: SettleReason = "auto",
): Promise<void> {
  const named = await withOrgContext(ctx, async (tx) => {
    await tx.execute(sql`select 1 from page_documents where page_id = ${pageId} for update`);
    const parts = await readParts(tx, pageId);
    if (!parts || (parts.updates.length === 0 && reason === "auto")) return [];
    const doc = partsToDoc(parts);
    const json = docToJson(doc);
    const state = Buffer.from(encodeDoc(doc));
    const [before] = await tx
      .select({ mentions: pageDocuments.mentions })
      .from(pageDocuments)
      .where(eq(pageDocuments.pageId, pageId));
    const mentions = mentionsOf(json);
    const values = {
      state,
      text: textOf(json),
      mentions,
      editedBy: ctx.userId,
      editedAt: new Date(),
    };
    await tx
      .insert(pageDocuments)
      .values({ pageId, orgId: ctx.orgId, ...values })
      .onConflictDoUpdate({ target: pageDocuments.pageId, set: values });
    // Exactly the rows read. Not "up to the highest": a lower seq can commit
    // after a higher one, and would go without having been folded in.
    if (parts.updates.length) {
      const seqs = `{${parts.updates.map((u) => u.seq).join(",")}}`;
      await tx.delete(pageUpdates).where(sql`${pageUpdates.seq} = any(${seqs}::bigint[])`);
    }
    await cutVersion(tx, ctx, pageId, state, reason);
    const known = new Set(before?.mentions ?? []);
    const fresh = mentions.filter((id) => !known.has(id) && id !== ctx.userId);
    return notifyNamed(tx, ctx, pageId, fresh);
  });
  for (const userId of named) publishToUser(ctx.orgId, userId, { type: "inbox" });
}

async function cutVersion(
  tx: AppTransaction,
  ctx: OrgContext,
  pageId: string,
  state: Buffer,
  reason: SettleReason,
): Promise<void> {
  const [last] = await tx
    .select({ createdAt: pageVersions.createdAt })
    .from(pageVersions)
    .where(eq(pageVersions.pageId, pageId))
    .orderBy(desc(pageVersions.createdAt))
    .limit(1);
  const due = !last || Date.now() - last.createdAt.getTime() >= VERSION_EVERY_MS;
  if (reason === "auto" && !due) return;
  const [page] = await tx.select({ title: pages.title }).from(pages).where(eq(pages.id, pageId));
  await tx.insert(pageVersions).values({
    orgId: ctx.orgId,
    pageId,
    title: page?.title ?? "",
    state,
    reason,
    createdBy: ctx.userId,
  });
  await tx.execute(sql`
    delete from page_versions where page_id = ${pageId} and id not in (
      select id from page_versions where page_id = ${pageId}
      order by created_at desc limit ${VERSIONS_KEPT}
    )
  `);
}

async function notifyNamed(
  tx: AppTransaction,
  ctx: OrgContext,
  pageId: string,
  ids: string[],
): Promise<string[]> {
  if (!ids.length) return [];
  // A mention is a client's claim; only this workspace's people get a row.
  const members = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.organizationId, ctx.orgId), inArray(memberships.userId, ids)));
  if (!members.length) return [];
  await tx
    .insert(notifications)
    .values(
      members.map((m) => ({
        orgId: ctx.orgId,
        userId: m.userId,
        kind: "page_mention",
        actorId: ctx.userId,
        pageId,
      })),
    )
    .onConflictDoNothing();
  return members.map((m) => m.userId);
}
