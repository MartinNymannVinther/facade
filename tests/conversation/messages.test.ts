import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { OrgContext } from "@/core/db/tenant";
import {
  createChannel,
  ensureGeneralChannel,
  listChannels,
  markRead,
  pageChannelId,
} from "@/modules/conversation/channels";
import { listInbox, markInboxRead, unreadInbox } from "@/modules/conversation/inbox";
import {
  deleteMessage,
  editMessage,
  listMessages,
  listThread,
  sendMessage,
  toggleReaction,
} from "@/modules/conversation/messages";
import {
  encodeMentions,
  mentionIds,
  plainMentions,
  splitMentions,
} from "@/modules/conversation/view";
import { storeFile, readFile, mayShowInline } from "@/modules/files/service";
import { createPage } from "@/modules/pages/service";
import { createProject } from "@/modules/projects/service";
import { search } from "@/modules/search/service";
import { adminPool } from "../helpers/db";
import { seedMember, seedWorkspace } from "../helpers/workspace";

let admin: Pool;
let a: OrgContext;
let a2: OrgContext;
let b: OrgContext;
let channelId: string;

const say = (ctx: OrgContext, body: string, parentId: string | null = null, id = channelId) =>
  sendMessage(ctx, { channelId: id, parentId, body, fileIds: [] });

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "chat_a");
  a2 = await seedMember(admin, a.orgId, "chat_a2");
  b = await seedWorkspace(admin, "chat_b");
  await ensureGeneralChannel(a, "generelt");
  ({ id: channelId } = await createChannel(a, { name: "udvikling", topic: "" }));
});

afterAll(async () => {
  await admin.end();
});

describe("mentions", () => {
  const people = [
    { id: "1", name: "Sofie" },
    { id: "2", name: "Sofie Holm" },
  ];

  it("takes the longest name, and goes both ways", () => {
    const body = encodeMentions("Hej @Sofie Holm og @Sofie", people);
    expect(body).toBe("Hej @[Sofie Holm](2) og @[Sofie](1)");
    expect(mentionIds(body)).toEqual(["2", "1"]);
    expect(plainMentions(body)).toBe("Hej @Sofie Holm og @Sofie");
    expect(splitMentions(body)).toEqual([
      { text: "Hej " },
      { name: "Sofie Holm", id: "2" },
      { text: " og " },
      { name: "Sofie", id: "1" },
    ]);
  });
});

describe("channels", () => {
  it("makes the general channel once, and every project brings its own", async () => {
    await ensureGeneralChannel(a, "generelt");
    await ensureGeneralChannel(a, "generelt");
    await createProject(a, { name: "Holdet", description: "", icon: "" });
    const list = await listChannels(a);
    expect(list.filter((c) => c.name === "generelt")).toHaveLength(1);
    expect(list.find((c) => c.name === "Holdet")?.kind).toBe("project");
  });

  it("refuses a second channel of the same name", async () => {
    await expect(createChannel(a, { name: "udvikling", topic: "" })).rejects.toThrow("conflict");
  });

  it("counts what a person has not read, and never their own words", async () => {
    const { id } = await createChannel(a, { name: "læst", topic: "" });
    await say(a, "fra mig", null, id);
    await say(a2, "fra dig", null, id);
    const count = async (ctx: OrgContext) =>
      (await listChannels(ctx)).find((c) => c.id === id)!.unread;
    expect(await count(a)).toBe(1);
    expect(await count(a2)).toBe(1);
    await markRead(a, id);
    expect(await count(a)).toBe(0);
    expect(await count(a2)).toBe(1);
  });
});

describe("messages", () => {
  it("are read in order, and stay in their workspace", async () => {
    await say(a, "først");
    await say(a2, "bagefter");
    const { messages } = await listMessages(a, channelId);
    expect(messages.slice(-2).map((m) => m.body)).toEqual(["først", "bagefter"]);
    expect(messages.at(-1)?.authorName).toBe("User chat_a2");
    expect((await listMessages(b, channelId)).messages).toEqual([]);
    await expect(say(b, "indtrængen")).rejects.toThrow("notFound");
  });

  it("thread one level deep, in the same channel only", async () => {
    const top = await say(a, "tråd");
    const reply = await say(a2, "svar", top.id);
    await expect(say(a, "svar på svar", reply.id)).rejects.toThrow("invalid");
    const { id: elsewhere } = await createChannel(a, { name: "andensteds", topic: "" });
    await expect(say(a, "på tværs", top.id, elsewhere)).rejects.toThrow("invalid");
    const thread = await listThread(a, top.id);
    expect(thread.map((m) => m.body)).toEqual(["tråd", "svar"]);
    expect(thread[0]!.replyCount).toBe(1);
    const { messages } = await listMessages(a, channelId);
    expect(messages.map((m) => m.body)).not.toContain("svar");
  });

  it("can be changed and deleted by their author alone, and leave no words behind", async () => {
    const mine = await say(a, "hemmeligt ord");
    await expect(editMessage(a2, mine.id, "hacket")).rejects.toThrow("forbidden");
    await expect(deleteMessage(a2, mine.id)).rejects.toThrow("forbidden");
    await editMessage(a, mine.id, "rettet ord");
    await deleteMessage(a, mine.id);
    const raw = await admin.query(`select body from messages where id = $1`, [mine.id]);
    expect(raw.rows[0].body).toBe("");
    const audit = await admin.query(
      `select 1 from audit_log where entity_id = $1 and (after_data::text like '%ord%' or before_data::text like '%ord%')`,
      [mine.id],
    );
    expect(audit.rowCount).toBe(0);
    expect(await search(a, "hemmeligt")).toEqual([]);
  });

  it("toggle a person's reaction without touching the next person's", async () => {
    const message = await say(a, "reager");
    await toggleReaction(a, { messageId: message.id, emoji: "👍" });
    await toggleReaction(a2, { messageId: message.id, emoji: "👍" });
    await toggleReaction(a, { messageId: message.id, emoji: "👍" });
    const [view] = await listThread(a, message.id);
    expect(view!.reactions).toEqual([{ emoji: "👍", userIds: [a2.userId] }]);
  });

  it("carry a file only from their own workspace", async () => {
    const file = await storeFile(a, {
      name: "kort.png",
      mime: "image/png",
      bytes: Buffer.from([1, 2, 3]),
    });
    const sent = await sendMessage(a, { channelId, parentId: null, body: "", fileIds: [file.id] });
    expect(sent.attachments[0]).toMatchObject({ name: "kort.png", size: 3 });
    const theirs = await storeFile(b, {
      name: "x.png",
      mime: "image/png",
      bytes: Buffer.from([1]),
    });
    await expect(
      sendMessage(a, { channelId, parentId: null, body: "", fileIds: [theirs.id] }),
    ).rejects.toThrow("invalid");
    expect(await readFile(b, file.id)).toBeNull();
    expect(mayShowInline("image/png")).toBe(true);
    expect(mayShowInline("image/svg+xml")).toBe(false);
    expect(mayShowInline("text/html")).toBe(false);
  });
});

describe("the inbox", () => {
  it("hears a mention and an answer, not the writer's own, and empties", async () => {
    await markInboxRead(a);
    await markInboxRead(a2);
    const top = await say(a, `Kig her @[A2](${a2.userId}) og @[Fremmed](${b.userId})`);
    await say(a2, "Gjort", top.id);
    const theirs = await listInbox(a2);
    expect(theirs[0]).toMatchObject({ kind: "mention", read: false });
    const mine = await listInbox(a);
    expect(mine[0]).toMatchObject({ kind: "reply", parentId: top.id, read: false });
    expect(await unreadInbox(b)).toBe(0);
    await markInboxRead(a2);
    expect(await unreadInbox(a2)).toBe(0);
    expect(await unreadInbox(a)).toBe(1);
  });

  it("follows a page's conversation once a person has spoken there", async () => {
    const { id: projectId } = await createProject(a, {
      name: "Sidesnak",
      description: "",
      icon: "",
    });
    const page = await createPage(a, { projectId, parentId: null, title: "Idé" });
    const id = await pageChannelId(a, page.id);
    expect(await pageChannelId(a2, page.id)).toBe(id);
    expect((await listChannels(a)).map((c) => c.id)).not.toContain(id);
    await say(a2, "En kommentar", null, id);
    await markInboxRead(a2);
    await say(a, "Et svar", null, id);
    const item = (await listInbox(a2))[0];
    expect(item).toMatchObject({ kind: "reply", pageId: page.id, pageTitle: "Idé" });
  });
});
