"use server";

import { z } from "zod";
import { runAction } from "@/core/action";
import {
  createPage,
  movePage,
  MovePage,
  NewPage,
  PageFields,
  purgePage,
  restorePage,
  trashPage,
  updatePage,
} from "./service";
import { settlePage } from "./sync";
import { listVersions, readVersion } from "./versions";

/**
 * The tree's server actions. Nothing here revalidates: the live stream
 * tells every open browser, the caller's included, that the tree moved.
 */

const Id = z.string().min(1).max(100);
const ById = z.object({ id: Id });

export async function createPageAction(raw: unknown) {
  return runAction(raw, NewPage, createPage);
}

export async function updatePageAction(raw: unknown) {
  const schema = PageFields.partial().extend({ id: Id });
  return runAction(raw, schema, (ctx, { id, ...fields }) => updatePage(ctx, id, fields));
}

export async function movePageAction(raw: unknown) {
  return runAction(raw, MovePage, movePage);
}

export async function trashPageAction(raw: unknown) {
  return runAction(raw, ById, (ctx, i) => trashPage(ctx, i.id));
}

export async function restorePageAction(raw: unknown) {
  return runAction(raw, ById, (ctx, i) => restorePage(ctx, i.id), ["/"]);
}

export async function purgePageAction(raw: unknown) {
  return runAction(raw, ById, (ctx, i) => purgePage(ctx, i.id), ["/"]);
}

export async function listVersionsAction(raw: unknown) {
  return runAction(raw, ById, (ctx, i) => listVersions(ctx, i.id));
}

export async function readVersionAction(raw: unknown) {
  const schema = z.object({ pageId: Id, versionId: Id });
  return runAction(raw, schema, (ctx, i) => readVersion(ctx, i.pageId, i.versionId));
}

/**
 * A marker before or after a change nobody typed: a restore or an accepted
 * AI proposal leaves a version with its reason, so the history says so.
 */
export async function markVersionAction(raw: unknown) {
  const schema = z.object({ id: Id, reason: z.enum(["restore", "ai"]) });
  return runAction(raw, schema, (ctx, i) => settlePage(ctx, i.id, i.reason));
}
