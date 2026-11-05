import { describe, expect, it, vi } from "vitest";
import type { LiveEvent } from "@/modules/live/events";
import {
  dropConnection,
  openConnection,
  ownConnection,
  presence,
  publish,
  publishToPage,
  publishToUser,
  watchPage,
} from "@/modules/live/hub";

function open(orgId: string, userId: string) {
  const events: LiveEvent[] = [];
  const close = vi.fn();
  return { connection: openConnection(orgId, userId, (e) => events.push(e), close), events };
}

describe("the hub", () => {
  it("never carries an event across a workspace", () => {
    const one = open("org1", "u1");
    const two = open("org2", "u2");
    two.events.length = 0;
    publish("org1", { type: "tree" });
    expect(one.events).toContainEqual({ type: "tree" });
    expect(two.events).toEqual([]);
    dropConnection(one.connection.id);
    dropConnection(two.connection.id);
  });

  it("reaches one person, one page, and skips the sender", () => {
    const me = open("org3", "u1");
    const you = open("org3", "u2");
    const away = open("org3", "u3");
    watchPage(me.connection, "p");
    watchPage(you.connection, "p");
    for (const c of [me, you, away]) c.events.length = 0;
    const event = { type: "doc.update", pageId: "p", data: "", from: me.connection.id } as const;
    publishToPage("org3", "p", event, me.connection.id);
    expect(you.events).toEqual([event]);
    expect(me.events).toEqual([]);
    expect(away.events).toEqual([]);
    publishToUser("org3", "u3", { type: "inbox" });
    expect(away.events).toEqual([{ type: "inbox" }]);
    expect(you.events).toHaveLength(1);
    for (const c of [me, you, away]) dropConnection(c.connection.id);
  });

  it("will not hand a connection to anybody but its owner", () => {
    const me = open("org4", "u1");
    const { id } = me.connection;
    expect(ownConnection(id, "org4", "u1")).toBe(me.connection);
    expect(ownConnection(id, "org4", "u2")).toBeNull();
    expect(ownConnection(id, "other", "u1")).toBeNull();
    dropConnection(id);
  });

  it("knows who is here, a person once however many tabs", () => {
    const tab1 = open("org5", "u1");
    const tab2 = open("org5", "u1");
    const other = open("org5", "u2");
    expect(presence("org5").sort()).toEqual(["u1", "u2"]);
    dropConnection(tab1.connection.id);
    expect(presence("org5").sort()).toEqual(["u1", "u2"]);
    dropConnection(tab2.connection.id);
    expect(presence("org5")).toEqual(["u2"]);
    dropConnection(other.connection.id);
  });
});
