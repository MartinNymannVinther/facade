import { randomUUID } from "node:crypto";
import type { LiveEvent } from "./events";

/**
 * Who is connected, and the one way to reach them. In memory on purpose:
 * Facade runs as one process (ADR 0012), like the rate limiter beside it.
 * Each connection is bound to one person in one workspace when it opens,
 * and nothing here crosses that line: an event is addressed to a workspace,
 * a page in it, or a person in it.
 *
 * Held on globalThis because Next compiles a route and a server action into
 * separate module graphs, and two hubs would each see half the workspace.
 */

export type Connection = {
  id: string;
  orgId: string;
  userId: string;
  pageId: string | null;
  send: (event: LiveEvent) => void;
  close: () => void;
};

const store = globalThis as unknown as { __facadeHub?: Map<string, Connection> };
const connections = (store.__facadeHub ??= new Map<string, Connection>());

function inOrg(orgId: string): Connection[] {
  return [...connections.values()].filter((c) => c.orgId === orgId);
}

function onlineIn(orgId: string): string[] {
  return [...new Set(inOrg(orgId).map((c) => c.userId))];
}

function onPage(orgId: string, pageId: string): string[] {
  return [
    ...new Set(
      inOrg(orgId)
        .filter((c) => c.pageId === pageId)
        .map((c) => c.userId),
    ),
  ];
}

export function publish(orgId: string, event: LiveEvent): void {
  for (const connection of inOrg(orgId)) connection.send(event);
}

export function publishToUser(orgId: string, userId: string, event: LiveEvent): void {
  for (const connection of inOrg(orgId)) if (connection.userId === userId) connection.send(event);
}

export function publishToPage(
  orgId: string,
  pageId: string,
  event: LiveEvent,
  from?: string,
): void {
  for (const connection of inOrg(orgId))
    if (connection.pageId === pageId && connection.id !== from) connection.send(event);
}

export function openConnection(
  orgId: string,
  userId: string,
  send: Connection["send"],
  close: Connection["close"],
): Connection {
  const connection: Connection = { id: randomUUID(), orgId, userId, pageId: null, send, close };
  connections.set(connection.id, connection);
  publish(orgId, { type: "presence", online: onlineIn(orgId) });
  return connection;
}

export function dropConnection(id: string): void {
  const connection = connections.get(id);
  if (!connection) return;
  connections.delete(id);
  const { orgId, pageId } = connection;
  publish(orgId, { type: "presence", online: onlineIn(orgId) });
  if (pageId) publish(orgId, { type: "page.presence", pageId, users: onPage(orgId, pageId) });
}

/** The connection, if it is this person's in this workspace; else nothing. */
export function ownConnection(id: string, orgId: string, userId: string): Connection | null {
  const connection = connections.get(id);
  return connection && connection.orgId === orgId && connection.userId === userId
    ? connection
    : null;
}

/** Moves a connection onto a page (or off one) and tells who is there now. */
export function watchPage(connection: Connection, pageId: string | null): string[] {
  const previous = connection.pageId;
  connection.pageId = pageId;
  const { orgId } = connection;
  if (previous && previous !== pageId)
    publish(orgId, { type: "page.presence", pageId: previous, users: onPage(orgId, previous) });
  if (!pageId) return [];
  const users = onPage(orgId, pageId);
  publish(orgId, { type: "page.presence", pageId, users });
  return users;
}

export function streamsOf(orgId: string, userId: string): number {
  return inOrg(orgId).filter((c) => c.userId === userId).length;
}

export function presence(orgId: string): string[] {
  return onlineIn(orgId);
}

/** Cuts every connection a person has in a workspace, for a removed member. */
export function closeConnectionsOf(orgId: string, userId: string): void {
  for (const connection of inOrg(orgId)) if (connection.userId === userId) connection.close();
}
