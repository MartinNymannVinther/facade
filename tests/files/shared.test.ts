import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { OrgContext } from "@/core/db/tenant";
import { pageChannelId } from "@/modules/conversation/channels";
import { deleteMessage, sendMessage } from "@/modules/conversation/messages";
import { storeFile } from "@/modules/files/service";
import { listProjectFiles } from "@/modules/files/shared";
import { formatSize, placeHref } from "@/modules/files/view";
import { filesOf, jsonToState, markdownToJson } from "@/modules/pages/document";
import { createPage, restorePage, trashPage } from "@/modules/pages/service";
import { createProject } from "@/modules/projects/service";
import { search } from "@/modules/search/service";
import { adminPool } from "../helpers/db";
import { seedWorkspace } from "../helpers/workspace";

let admin: Pool;
let a: OrgContext;
let b: OrgContext;
let projectId: string;
let otherProjectId: string;
let channelId: string;

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const upload = (ctx: OrgContext, name: string, mime = "application/pdf") =>
  storeFile(ctx, { name, mime, bytes: Buffer.from(`${name} indhold`) });

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "files_a");
  b = await seedWorkspace(admin, "files_b");
  ({ id: projectId } = await createProject(a, { name: "Spillet", description: "", icon: "" }));
  ({ id: otherProjectId } = await createProject(a, { name: "Andet", description: "", icon: "" }));
  const { rows } = await admin.query(`select id from channels where project_id = $1`, [projectId]);
  channelId = rows[0].id;
});

afterAll(async () => {
  await admin.end();
});

describe("a project's files", () => {
  it("gathers what was sent in its channel, and only there", async () => {
    const file = await upload(a, "lydbanke.pdf");
    const sent = await sendMessage(a, { channelId, parentId: null, body: "", fileIds: [file.id] });
    const listed = await listProjectFiles(a, projectId);
    const found = listed.find((f) => f.id === file.id);
    expect(found?.message).toEqual({ id: sent.id, channelId, parentId: null });
    expect(found?.author).toBe("User files_a");
    expect((await listProjectFiles(a, otherProjectId)).map((f) => f.id)).not.toContain(file.id);
    expect(await listProjectFiles(b, projectId)).toEqual([]);
  });

  it("leaves out a file uploaded and never sent", async () => {
    const file = await upload(a, "kladde.pdf");
    expect((await listProjectFiles(a, projectId)).map((f) => f.id)).not.toContain(file.id);
  });

  it("gathers what was placed on a page, and hides it while the page is in the trash", async () => {
    const image = await storeFile(a, { name: "skitse.png", mime: "image/png", bytes: png });
    const doc = await upload(a, "manus.pdf");
    const { id: pageId } = await createPage(a, {
      projectId,
      parentId: null,
      title: "Bane 1",
      markdown: `![skitse](/api/files/${image.id})\n\n[manus](/api/files/${doc.id})`,
    });
    const placed = (await listProjectFiles(a, projectId)).filter((f) => f.page?.id === pageId);
    expect(placed.map((f) => f.id).sort()).toEqual([image.id, doc.id].sort());
    expect(placed.every((f) => f.message === null && f.page?.title === "Bane 1")).toBe(true);

    await trashPage(a, pageId);
    expect((await listProjectFiles(a, projectId)).map((f) => f.id)).not.toContain(image.id);
    await restorePage(a, pageId);
    expect((await listProjectFiles(a, projectId)).map((f) => f.id)).toContain(image.id);
  });

  it("keeps a file where it first landed", async () => {
    const image = await storeFile(a, { name: "logo.png", mime: "image/png", bytes: png });
    const markdown = `![logo](/api/files/${image.id})`;
    const first = await createPage(a, { projectId, parentId: null, title: "Først", markdown });
    await createPage(a, { projectId: otherProjectId, parentId: null, title: "Siden", markdown });
    const found = (await listProjectFiles(a, projectId)).find((f) => f.id === image.id);
    expect(found?.page?.id).toBe(first.id);
    expect((await listProjectFiles(a, otherProjectId)).map((f) => f.id)).not.toContain(image.id);
  });

  it("knows a page's conversation from the project's channel", async () => {
    const { id: pageId } = await createPage(a, { projectId, parentId: null, title: "Snak" });
    const talk = await pageChannelId(a, pageId);
    const file = await upload(a, "noter.pdf");
    await sendMessage(a, { channelId: talk, parentId: null, body: "", fileIds: [file.id] });
    const found = (await listProjectFiles(a, projectId)).find((f) => f.id === file.id);
    expect(found?.page?.id).toBe(pageId);
    expect(found?.message?.channelId).toBe(talk);
  });

  it("sorts pictures from the rest", async () => {
    const images = await listProjectFiles(a, projectId, "images");
    const other = await listProjectFiles(a, projectId, "other");
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((f) => f.mime === "image/png")).toBe(true);
    expect(other.every((f) => f.mime !== "image/png")).toBe(true);
  });

  it("lets a file go with the message it was sent in", async () => {
    const file = await upload(a, "fortrudt.pdf");
    const sent = await sendMessage(a, { channelId, parentId: null, body: "", fileIds: [file.id] });
    await deleteMessage(a, sent.id);
    expect((await listProjectFiles(a, projectId)).map((f) => f.id)).not.toContain(file.id);
  });

  it("is found by its name, at home only", async () => {
    const file = await upload(a, "Lydbanke-endelig.pdf");
    await sendMessage(a, { channelId, parentId: null, body: "", fileIds: [file.id] });
    const hits = await search(a, "lydbanke-endel");
    expect(hits.some((h) => h.kind === "file" && h.id === file.id)).toBe(true);
    expect((await search(b, "lydbanke-endel")).some((h) => h.kind === "file")).toBe(false);
  });
});

describe("the files of before (drizzle/0008)", () => {
  it("finds a page's file in its Yjs state, where the link is plain text", () => {
    const state = jsonToState(markdownToJson("![x](/api/files/abc-123)"));
    expect(Buffer.from(state).includes(Buffer.from("/api/files/abc-123"))).toBe(true);
  });

  it("places files shared before the columns existed", async () => {
    const message = await upload(a, "gammel-besked.pdf");
    const onPage = await storeFile(a, { name: "gammel.png", mime: "image/png", bytes: png });
    await sendMessage(a, { channelId, parentId: null, body: "", fileIds: [message.id] });
    const { id: pageId } = await createPage(a, {
      projectId,
      parentId: null,
      title: "Gammel",
      markdown: `![gammel](/api/files/${onPage.id})`,
    });
    await admin.query(
      `update files set project_id = null, page_id = null, message_id = null where id = any($1)`,
      [[message.id, onPage.id]],
    );
    const migration = readFileSync("drizzle/0008_files_in_projects_rls.sql", "utf8");
    for (const statement of migration.split("--> statement-breakpoint").slice(2))
      await admin.query(statement);
    const listed = await listProjectFiles(a, projectId);
    expect(listed.find((f) => f.id === message.id)?.message).not.toBeNull();
    expect(listed.find((f) => f.id === onPage.id)?.page?.id).toBe(pageId);
  });
});

describe("pure helpers", () => {
  it("reads the files a document shows or links to, and nothing else", () => {
    const json = markdownToJson(
      "![a](/api/files/one)\n\n[b](/api/files/two) [c](https://example.com/api/files/three)\n\n![d](/api/files/one)",
    );
    expect(filesOf(json).sort()).toEqual(["one", "two"]);
  });

  it("names where a file can be seen in its place", () => {
    const none = { pageId: null, messageId: null, channelId: null, parentId: null };
    expect(placeHref({ ...none, pageId: "p" })).toBe("/pages/p");
    expect(placeHref({ ...none, pageId: "p", messageId: "m", channelId: "c" })).toBe(
      "/pages/p?talk=1",
    );
    expect(placeHref({ ...none, messageId: "m", channelId: "c", parentId: "t" })).toBe(
      "/channels/c?thread=t",
    );
    expect(placeHref(none)).toBeNull();
  });

  it("writes a size the way a person reads it", () => {
    expect(formatSize(312, "da")).toBe("312 B");
    expect(formatSize(1536, "da")).toBe("1,5 kB");
    expect(formatSize(10 * 1024 * 1024, "en")).toBe("10 MB");
  });
});
