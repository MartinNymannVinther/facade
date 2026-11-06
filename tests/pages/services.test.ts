import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { strFromU8, unzipSync } from "fflate";
import * as Y from "yjs";
import type { OrgContext } from "@/core/db/tenant";
import { exportMarkdownZip } from "@/modules/export/markdown";
import { docToJson, buildDoc, jsonToState, markdownToJson, textOf } from "@/modules/pages/document";
import {
  createPage,
  getPage,
  listTrash,
  listTree,
  movePage,
  purgePage,
  recentPages,
  restorePage,
  trashPage,
  updatePage,
} from "@/modules/pages/service";
import { appendUpdate, loadState, settlePage } from "@/modules/pages/sync";
import { listVersions, readVersion } from "@/modules/pages/versions";
import { createProject, listProjects, setProjectArchived } from "@/modules/projects/service";
import { listInbox } from "@/modules/conversation/inbox";
import { search, toPrefixQuery } from "@/modules/search/service";
import { adminPool } from "../helpers/db";
import { seedMember, seedWorkspace } from "../helpers/workspace";

let admin: Pool;
let a: OrgContext;
let a2: OrgContext;
let b: OrgContext;
let projectId: string;

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "pages_a");
  a2 = await seedMember(admin, a.orgId, "pages_a2");
  b = await seedWorkspace(admin, "pages_b");
  ({ id: projectId } = await createProject(a, { name: "Holdet", description: "", icon: "" }));
});

afterAll(async () => {
  await admin.end();
});

const page = (title: string, parentId: string | null = null, markdown?: string) =>
  createPage(a, { projectId, parentId, title, markdown });

function typed(state: Uint8Array, word: string): Uint8Array {
  const doc = buildDoc([state]);
  const before = Y.encodeStateVector(doc);
  const fragment = doc.getXmlFragment("default");
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(word)]);
  fragment.insert(fragment.length, [paragraph]);
  return Y.encodeStateAsUpdate(doc, before);
}

describe("pages in a tree", () => {
  it("nests, renames and answers only inside its workspace", async () => {
    const top = await page("Top");
    const child = await page("Under", top.id);
    await updatePage(a, child.id, { title: "Nyt navn", icon: "📄" });
    const tree = await listTree(a);
    expect(tree.find((n) => n.id === child.id)).toMatchObject({
      parentId: top.id,
      title: "Nyt navn",
      icon: "📄",
    });
    expect(await getPage(b, child.id)).toBeNull();
    await expect(updatePage(b, child.id, { title: "x" })).rejects.toThrow("notFound");
    await expect(createPage(b, { projectId, parentId: null, title: "x" })).rejects.toThrow(
      "notFound",
    );
  });

  it("moves a subtree to another project and refuses a loop", async () => {
    const { id: other } = await createProject(a, { name: "Andet", description: "", icon: "" });
    const top = await page("Flyttes");
    const child = await page("Følger med", top.id);
    await expect(
      movePage(a, { id: top.id, projectId, parentId: child.id, index: 0 }),
    ).rejects.toThrow("conflict");
    await movePage(a, { id: top.id, projectId: other, parentId: null, index: 0 });
    const tree = await listTree(a);
    expect(tree.find((n) => n.id === child.id)?.projectId).toBe(other);
  });

  it("trashes with what hangs under it, and restores exactly that", async () => {
    const top = await page("Papirkurv");
    const child = await page("Barn", top.id);
    const earlier = await page("Smidt ud før", top.id);
    await trashPage(a, earlier.id);
    await new Promise((r) => setTimeout(r, 5));
    await trashPage(a, top.id);

    const trash = await listTrash(a);
    expect(trash.map((t) => t.title)).toContain("Papirkurv");
    expect(trash.map((t) => t.title)).toContain("Smidt ud før");
    expect(trash.map((t) => t.title)).not.toContain("Barn");
    expect(await getPage(a, child.id)).toBeNull();

    await restorePage(a, top.id);
    expect(await getPage(a, top.id)).not.toBeNull();
    expect(await getPage(a, child.id)).not.toBeNull();
    expect(await getPage(a, earlier.id)).toBeNull();

    await purgePage(a, earlier.id);
    await expect(purgePage(a, top.id)).rejects.toThrow("notFound");
  });

  it("restores a child to the top when its parent is still in the trash", async () => {
    const top = await page("Forælder");
    const child = await page("Alene", top.id);
    await trashPage(a, child.id);
    await new Promise((r) => setTimeout(r, 5));
    await trashPage(a, top.id);
    await restorePage(a, child.id);
    expect((await getPage(a, child.id))?.parentId).toBeNull();
  });

  it("keeps an archived project's pages out of recent, and brings them back", async () => {
    const { id } = await createProject(a, { name: "Gammelt", description: "", icon: "" });
    const old = await createPage(a, { projectId: id, parentId: null, title: "Glemt" });
    await setProjectArchived(a, id, true);
    expect((await listProjects(a)).map((p) => p.id)).not.toContain(id);
    expect((await recentPages(a, 100)).map((p) => p.id)).not.toContain(old.id);
    await setProjectArchived(a, id, false);
    expect((await recentPages(a, 100)).map((p) => p.id)).toContain(old.id);
  });
});

describe("writing on a page", () => {
  it("keeps every edit through a settle, from two people", async () => {
    const { id } = await page("Sammen", null, "Start");
    const state = await loadState(a, id);
    await appendUpdate(a, id, typed(state, "fra Sofie"));
    await appendUpdate(a2, id, typed(state, "fra Emil"));

    const unsettled = textOf(docToJson(buildDoc([await loadState(a, id)])));
    expect(unsettled).toContain("fra Sofie");
    expect(unsettled).toContain("fra Emil");

    await settlePage(a, id);
    const log = await admin.query(`select 1 from page_updates where page_id = $1`, [id]);
    expect(log.rowCount).toBe(0);
    const settled = textOf(docToJson(buildDoc([await loadState(a, id)])));
    expect(settled).toBe(unsettled);
  });

  it("loses nothing written while a settle runs", async () => {
    const { id } = await page("Kapløb");
    const state = await loadState(a, id);
    const edits = Array.from({ length: 12 }, (_, n) => typed(state, `ord${n}`));
    await Promise.all([
      ...edits.map((edit) => appendUpdate(a, id, edit)),
      settlePage(a, id),
      settlePage(a2, id),
    ]);
    await settlePage(a, id);
    const text = textOf(docToJson(buildDoc([await loadState(a, id)])));
    for (let n = 0; n < 12; n++) expect(text).toContain(`ord${n}`);
  });

  it("refuses noise, an oversized edit, and another workspace's page", async () => {
    const { id } = await page("Værn");
    await expect(appendUpdate(a, id, new Uint8Array([255, 255, 1]))).rejects.toThrow("invalid");
    await expect(appendUpdate(a, id, new Uint8Array(2_000_001))).rejects.toThrow("invalid");
    const good = jsonToState(markdownToJson("hej"));
    await expect(appendUpdate(b, id, good)).rejects.toThrow("notFound");
    await expect(loadState(b, id)).rejects.toThrow("notFound");
  });

  it("takes words still on their way to a page that was just trashed", async () => {
    const { id } = await page("Væk");
    await trashPage(a, id);
    await appendUpdate(a, id, jsonToState(markdownToJson("nåede frem")));
    await restorePage(a, id);
    expect(textOf(docToJson(buildDoc([await loadState(a, id)])))).toContain("nåede frem");
  });

  it("is not taken down by well-formed nonsense", async () => {
    const { id } = await page("Forgiftet", null, "Stadig her");
    const poison = new Y.Doc();
    poison.getArray("default").push(["ikke en blok"]);
    await appendUpdate(a, id, Y.encodeStateAsUpdate(poison));

    const deep = new Y.Doc();
    deep.transact(() => {
      let node: Y.XmlFragment = deep.getXmlFragment("default");
      for (let n = 0; n < 3000; n++) {
        const next = new Y.XmlElement("blockquote");
        node.insert(0, [next]);
        node = next;
      }
    });
    await appendUpdate(a, id, Y.encodeStateAsUpdate(deep));

    await settlePage(a, id);
    const text = textOf(docToJson(buildDoc([await loadState(a, id)])));
    expect(text).toContain("Stadig her");
    await appendUpdate(a, id, typed(await loadState(a, id), "\u0000videre"));
    await settlePage(a, id);
    expect(textOf(docToJson(buildDoc([await loadState(a, id)])))).toContain("videre");
  });

  it("leaves a version on the first settle and always on a named one", async () => {
    const { id } = await page("Historik", null, "Første");
    await appendUpdate(a, id, typed(await loadState(a, id), "anden"));
    await settlePage(a, id);
    await appendUpdate(a, id, typed(await loadState(a, id), "tredje"));
    await settlePage(a, id);
    expect(await listVersions(a, id)).toHaveLength(1);

    await settlePage(a, id, "restore");
    const versions = await listVersions(a, id);
    expect(versions.map((v) => v.reason)).toEqual(["restore", "auto"]);
    expect(textOf(await readVersion(a, id, versions[1]!.id))).toContain("anden");
    await expect(readVersion(b, id, versions[1]!.id)).rejects.toThrow("notFound");
  });

  it("tells a person named on a page, once, and never the writer or a stranger", async () => {
    const { id } = await page("Omtale");
    const mention = (who: string) => {
      const doc = buildDoc([]);
      const fragment = doc.getXmlFragment("default");
      const paragraph = new Y.XmlElement("paragraph");
      const node = new Y.XmlElement("mention");
      node.setAttribute("id", who);
      node.setAttribute("label", who);
      fragment.insert(0, [paragraph]);
      paragraph.insert(0, [node]);
      return Y.encodeStateAsUpdate(doc);
    };
    await appendUpdate(a, id, mention(a2.userId));
    await appendUpdate(a, id, mention(b.userId));
    await appendUpdate(a, id, mention(a.userId));
    await settlePage(a, id);
    await appendUpdate(a, id, mention(a2.userId));
    await settlePage(a, id);
    const inbox = (await listInbox(a2)).filter((n) => n.pageId === id);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ kind: "page_mention", pageTitle: "Omtale", read: false });
    expect((await listInbox(a)).filter((n) => n.pageId === id)).toHaveLength(0);
    const stranger = await admin.query(`select 1 from notifications where user_id = $1`, [
      b.userId,
    ]);
    expect(stranger.rowCount).toBe(0);
  });
});

describe("search", () => {
  it("makes a safe prefix query of anything", () => {
    expect(toPrefixQuery("mod spil")).toBe("mod:* & spil:*");
    expect(toPrefixQuery("a' | b & !c:*")).toBe("a:* & b:* & c:*");
    expect(toPrefixQuery("  ''  ")).toBe("");
  });

  it("finds a title, a word in the text by its beginning, and stays home", async () => {
    const { id } = await page("Havelågen", null, "Idén med cykelhjelmen og lampeskærme");
    const byTitle = await search(a, "havelåg");
    expect(byTitle.some((h) => h.kind === "page" && h.id === id)).toBe(true);
    const byText = await search(a, "lampeskær");
    const hit = byText.find((h) => h.kind === "page" && h.id === id);
    expect(hit?.snippet).toContain("⟦");
    expect(await search(b, "lampeskær")).toEqual([]);
    expect(await search(a, "' OR 1=1 --")).toBeInstanceOf(Array);
  });
});

describe("the Markdown export", () => {
  it("writes the tree as folders, with its pictures, and nothing from elsewhere", async () => {
    const { id: proj } = await createProject(b, { name: "Bog/Plan", description: "", icon: "" });
    const { id: sly } = await createProject(b, { name: "..", description: "", icon: "" });
    await createPage(b, { projectId: sly, parentId: null, title: "../../flugt" });
    const top = await createPage(b, {
      projectId: proj,
      parentId: null,
      title: "Kapitel",
      markdown: "Første tekst",
    });
    await createPage(b, {
      projectId: proj,
      parentId: top.id,
      title: "Afsnit",
      markdown: "Anden tekst",
    });
    const zip = unzipSync(await exportMarkdownZip(b));
    const names = Object.keys(zip);
    expect(names).toContain("Bog Plan/Kapitel.md");
    expect(names).toContain("Bog Plan/Kapitel/Afsnit.md");
    expect(strFromU8(zip["Bog Plan/Kapitel/Afsnit.md"]!)).toContain("Anden tekst");
    expect(names.some((n) => n.startsWith("Holdet"))).toBe(false);
    expect(names.filter((n) => n.split("/").includes(".."))).toEqual([]);
  });
});
