"use server";

import { z } from "zod";
import { runAction } from "@/core/action";
import {
  archiveChannel,
  ChannelFields,
  createChannel,
  markRead,
  pageChannelId,
  updateChannel,
} from "./channels";
import { markInboxRead } from "./inbox";
import {
  deleteMessage,
  editMessage,
  listMessages,
  listThread,
  MAX_BODY,
  NewMessage,
  Reaction,
  sendMessage,
  toggleReaction,
} from "./messages";

const Id = z.string().min(1).max(100);

export async function sendMessageAction(raw: unknown) {
  return runAction(raw, NewMessage, sendMessage);
}

export async function editMessageAction(raw: unknown) {
  const schema = z.object({ id: Id, body: z.string().trim().min(1).max(MAX_BODY) });
  return runAction(raw, schema, (ctx, i) => editMessage(ctx, i.id, i.body));
}

export async function deleteMessageAction(raw: unknown) {
  return runAction(raw, z.object({ id: Id }), (ctx, i) => deleteMessage(ctx, i.id));
}

export async function toggleReactionAction(raw: unknown) {
  return runAction(raw, Reaction, toggleReaction);
}

export async function listMessagesAction(raw: unknown) {
  const schema = z.object({ channelId: Id, before: z.iso.datetime().optional() });
  return runAction(raw, schema, (ctx, i) => listMessages(ctx, i.channelId, i.before));
}

export async function listThreadAction(raw: unknown) {
  return runAction(raw, z.object({ id: Id }), (ctx, i) => listThread(ctx, i.id));
}

export async function markReadAction(raw: unknown) {
  return runAction(raw, z.object({ id: Id }), (ctx, i) => markRead(ctx, i.id));
}

export async function pageChannelAction(raw: unknown) {
  return runAction(raw, z.object({ id: Id }), (ctx, i) => pageChannelId(ctx, i.id));
}

export async function createChannelAction(raw: unknown) {
  return runAction(raw, ChannelFields, createChannel);
}

export async function updateChannelAction(raw: unknown) {
  const schema = ChannelFields.partial().extend({ id: Id });
  return runAction(raw, schema, (ctx, { id, ...f }) => updateChannel(ctx, id, f));
}

export async function archiveChannelAction(raw: unknown) {
  return runAction(raw, z.object({ id: Id }), (ctx, i) => archiveChannel(ctx, i.id), ["/"]);
}

export async function markInboxReadAction(raw: unknown) {
  return runAction(raw, z.object({ id: Id.optional() }), (ctx, i) => markInboxRead(ctx, i.id), [
    "/inbox",
  ]);
}
