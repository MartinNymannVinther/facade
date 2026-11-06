import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { OrgContext } from "@/core/db/tenant";
import { handleMcp } from "@/modules/agents/mcp";
import {
  authenticateAgent,
  createAgent,
  revokeAgent,
  type AgentContext,
} from "@/modules/agents/service";
import { createChannel } from "@/modules/conversation/channels";
import { listInbox } from "@/modules/conversation/inbox";
import { listMessages, sendMessage } from "@/modules/conversation/messages";
import { docToJson, buildDoc, textOf } from "@/modules/pages/document";
import { createPage } from "@/modules/pages/service";
import { loadState } from "@/modules/pages/sync";
import { listVersions } from "@/modules/pages/versions";
import { createProject } from "@/modules/projects/service";
import { adminPool } from "../helpers/db";
import { seedMember, seedWorkspace } from "../helpers/workspace";

let admin: Pool;
let a: OrgContext;
let member: OrgContext;
let b: OrgContext;
let projectId: string;
let writer: AgentContext;
let reader: AgentContext;
let writerToken: string;

type Called = { content: { text: string }[]; isError?: boolean };

async function rpc(agent: AgentContext, method: string, params?: object) {
  const reply = await handleMcp(agent, { jsonrpc: "2.0", id: 1, method, params });
  return reply as { result?: unknown; error?: { code: number } };
}

async function call(agent: AgentContext, name: string, args: object = {}) {
  return (await rpc(agent, "tools/call", { name, arguments: args })).result as Called;
}

const text = async (id: string) => textOf(docToJson(buildDoc([await loadState(a, id)])));

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "agents_a");
  member = await seedMember(admin, a.orgId, "agents_m");
  b = await seedWorkspace(admin, "agents_b");
  ({ id: projectId } = await createProject(a, { name: "Ukendt", description: "", icon: "" }));
  const made = await createAgent(a, { name: "Claude", access: "write" });
  writerToken = made.token;
  writer = (await authenticateAgent(made.token))!;
  const read = await createAgent(a, { name: "Læser", access: "read" });
  reader = (await authenticateAgent(read.token))!;
});

afterAll(async () => {
  await admin.end();
});

describe("inviting an agent", () => {
  it("takes an owner or an admin, and keeps only a hash", async () => {
    await expect(createAgent(member, { name: "Nej", access: "read" })).rejects.toThrow("forbidden");
    const rows = await admin.query(`select token_hash from agent_tokens where org_id = $1`, [
      a.orgId,
    ]);
    expect(rows.rows.map((r) => r.token_hash)).not.toContain(writerToken);
    const audit = await admin.query(
      `select after_data from audit_log where entity_type = 'agent_tokens' and org_id = $1`,
      [a.orgId],
    );
    expect(audit.rowCount).toBeGreaterThan(0);
    expect(JSON.stringify(audit.rows)).not.toContain("token_hash");
  });

  it("gives a user that has no way to log in", async () => {
    const accounts = await admin.query(`select 1 from accounts where user_id = $1`, [
      writer.userId,
    ]);
    expect(accounts.rowCount).toBe(0);
  });

  it("opens nothing with a wrong key", async () => {
    expect(await authenticateAgent("fa_wrong")).toBeNull();
    expect(await authenticateAgent("")).toBeNull();
    expect(await authenticateAgent(writerToken.slice(0, -1))).toBeNull();
  });
});

describe("the protocol", () => {
  it("shakes hands and stays silent on a notification", async () => {
    const hello = await rpc(writer, "initialize", { protocolVersion: "2025-06-18" });
    expect(hello.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
    });
    expect(
      await handleMcp(writer, { jsonrpc: "2.0", method: "notifications/initialized" }),
    ).toBeNull();
    expect((await rpc(writer, "nonsense")).error?.code).toBe(-32601);
    expect(await handleMcp(writer, { nonsense: true })).toMatchObject({
      error: { code: -32600 },
    });
  });

  it("offers no tool that deletes, invites or exports, to anybody", async () => {
    const { tools } = (await rpc(writer, "tools/list")).result as { tools: { name: string }[] };
    const names = tools.map((t) => t.name);
    expect(names).toContain("append_to_page");
    expect(names.filter((n) => /delete|trash|purge|invite|export|remove/.test(n))).toEqual([]);
  });

  it("shows a read key no writing tool, and refuses one called anyway", async () => {
    const { tools } = (await rpc(reader, "tools/list")).result as { tools: { name: string }[] };
    expect(tools.map((t) => t.name)).toContain("read_page");
    expect(tools.map((t) => t.name)).not.toContain("create_page");
    const refused = await call(reader, "create_page", { project_id: projectId, title: "x" });
    expect(refused.isError).toBe(true);
  });

  it("answers bad arguments with an error and no stack", async () => {
    const bad = await call(writer, "read_page", {});
    expect(bad.isError).toBe(true);
    expect(bad.content[0]!.text).toContain("Invalid arguments");
  });
});

describe("an agent at work", () => {
  it("reads the tree, a page and search", async () => {
    const page = await createPage(a, {
      projectId,
      parentId: null,
      title: "Gåder",
      markdown: "Låsecylinderen er gåde tre",
    });
    expect((await call(reader, "list_pages")).content[0]!.text).toContain("Gåder");
    const read = await call(reader, "read_page", { page_id: page.id });
    expect(read.content[0]!.text).toContain("Låsecylinderen");
    expect((await call(reader, "search", { query: "låsecyl" })).content[0]!.text).toContain(
      page.id,
    );
  });

  it("appends beside a colleague's words, undoably and in its own name", async () => {
    const page = await createPage(a, {
      projectId,
      parentId: null,
      title: "Sammen",
      markdown: "Martins tekst",
    });
    const done = await call(writer, "append_to_page", {
      page_id: page.id,
      markdown: "## Forslag\n\n- [ ] Gå ruten",
    });
    expect(done.isError).toBeUndefined();
    const after = await text(page.id);
    expect(after).toContain("Martins tekst");
    expect(after).toContain("Gå ruten");
    const versions = await listVersions(a, page.id);
    expect(versions[0]).toMatchObject({ reason: "ai", author: "Claude" });
  });

  it("replaces a page and leaves the old words in the history", async () => {
    const page = await createPage(a, {
      projectId,
      parentId: null,
      title: "Omskrives",
      markdown: "Gammel tekst",
    });
    await call(writer, "replace_page", { page_id: page.id, markdown: "Ny tekst" });
    const after = await text(page.id);
    expect(after).toContain("Ny tekst");
    expect(after).not.toContain("Gammel tekst");
    expect(await listVersions(a, page.id)).toHaveLength(1);
  });

  it("creates pages, and writes where it can be read and answered", async () => {
    const made = await call(writer, "create_page", {
      project_id: projectId,
      title: "Fra agenten",
      markdown: "Hej",
    });
    const id = made.content[0]!.text.replace("Created page ", "");
    expect(await text(id)).toContain("Hej");

    const { id: channelId } = await createChannel(a, { name: "agent-test", topic: "" });
    const sent = await call(writer, "send_message", {
      channel_id: channelId,
      body: "Kan @User agents_m kigge?",
    });
    expect(sent.isError).toBeUndefined();
    const { messages } = await listMessages(a, channelId);
    expect(messages[0]).toMatchObject({ authorName: "Claude" });
    expect((await listInbox(member))[0]).toMatchObject({ kind: "mention", actor: "Claude" });

    await sendMessage(member, {
      channelId,
      parentId: null,
      body: `Hej @[Claude](${writer.userId})`,
      fileIds: [],
    });
    expect((await call(writer, "read_inbox")).content[0]!.text).toContain("mention");
  });

  it("reaches nothing in another workspace", async () => {
    const { id: theirs } = await createProject(b, { name: "Hemmelig", description: "", icon: "" });
    const page = await createPage(b, {
      projectId: theirs,
      parentId: null,
      title: "Fortroligt",
      markdown: "hemmeligord",
    });
    expect((await call(writer, "read_page", { page_id: page.id })).isError).toBe(true);
    expect(
      (await call(writer, "append_to_page", { page_id: page.id, markdown: "x" })).isError,
    ).toBe(true);
    expect((await call(writer, "search", { query: "hemmeligord" })).content[0]!.text).toBe("[]");
    expect((await call(writer, "list_pages")).content[0]!.text).not.toContain("Fortroligt");
  });
});

describe("taking access back", () => {
  it("shuts the key at once, leaves the words, and is an admin's to do", async () => {
    const { id: channelId } = await createChannel(a, { name: "afsked", topic: "" });
    const made = await createAgent(a, { name: "Afgået", access: "write" });
    const agent = (await authenticateAgent(made.token))!;
    await call(agent, "send_message", { channel_id: channelId, body: "Farvel" });

    await expect(revokeAgent(member, made.id)).rejects.toThrow("forbidden");
    await expect(revokeAgent(b, made.id)).rejects.toThrow();
    await revokeAgent(a, made.id);

    expect(await authenticateAgent(made.token)).toBeNull();
    const { messages } = await listMessages(a, channelId);
    expect(messages[0]).toMatchObject({ body: "Farvel", authorName: "Afgået" });
  });

  it("shuts the key when the membership goes too", async () => {
    const made = await createAgent(a, { name: "Fjernet", access: "read" });
    const agent = (await authenticateAgent(made.token))!;
    await admin.query(`delete from memberships where user_id = $1`, [agent.userId]);
    expect(await authenticateAgent(made.token)).toBeNull();
  });
});
