import { encodeAwarenessUpdate, Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import type { OrgContext } from "@/core/db/tenant";
import { presenceColor } from "@/lib/presence";
import { listMembers } from "@/modules/export/workspace";
import { pageUsers, publish, publishToPage } from "@/modules/live/hub";
import { buildDoc, docToJson, FRAGMENT, textOf } from "@/modules/pages/document";
import { getPage } from "@/modules/pages/service";
import { appendUpdate, loadState } from "@/modules/pages/sync";
import { demoEnabled, isDemoWorkspace } from "./service";

/**
 * Anna, writing. The best thing about Facade is somebody else's cursor, and
 * a visitor alone in a demo would never see one. So the first time the plan is
 * opened, a made-up colleague writes one line on it, through the same log and
 * the same stream as a person. Once per demo: the line on the page says so.
 */

const COLLEAGUE = "Anna Holm";

/** By the plan's title, which is also how the page is known. */
const LINES: Record<string, string> = {
  Planen: "Jeg tager teltet, hvis nogen kan hjælpe med at sætte det op lørdag morgen.",
  "The plan": "I can take the tent if somebody helps put it up on Saturday morning.",
};

type Pace = { startMs: number; stepMs: number; endMs: number };
const PACE: Pace = { startMs: 2500, stepMs: 90, endMs: 2000 };

const store = globalThis as unknown as { __facadeColleagues?: Set<string> };
const writing = (store.__facadeColleagues ??= new Set());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function write(anna: OrgContext, pageId: string, line: string, pace: Pace) {
  const doc = buildDoc([await loadState(anna, pageId)]);
  const awareness = new Awareness(doc);
  const here = (extra: string[]) =>
    publish(anna.orgId, {
      type: "page.presence",
      pageId,
      users: [...pageUsers(anna.orgId, pageId), ...extra],
    });
  const show = () =>
    publishToPage(anna.orgId, pageId, {
      type: "doc.awareness",
      pageId,
      data: Buffer.from(encodeAwarenessUpdate(awareness, [doc.clientID])).toString("base64"),
      from: "",
    });
  const commit = async (run: () => void) => {
    const before = Y.encodeStateVector(doc);
    run();
    await appendUpdate(anna, pageId, Y.encodeStateAsUpdate(doc, before));
  };

  try {
    awareness.setLocalState({ user: { name: COLLEAGUE, color: presenceColor(anna.userId) } });
    here([anna.userId]);
    const fragment = doc.getXmlFragment(FRAGMENT);
    const paragraph = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    await commit(() => {
      fragment.insert(fragment.length, [paragraph]);
      paragraph.insert(0, [text]);
    });
    for (let at = 0; at < line.length; at += 2) {
      await commit(() => text.insert(at, line.slice(at, at + 2)));
      const cursor = Y.relativePositionToJSON(
        Y.createRelativePositionFromTypeIndex(text, text.length),
      );
      awareness.setLocalStateField("cursor", { anchor: cursor, head: cursor });
      show();
      await sleep(pace.stepMs);
    }
    await sleep(pace.endMs);
  } finally {
    awareness.setLocalState(null);
    show();
    here([]);
    awareness.destroy();
    doc.destroy();
  }
}

/** Called when somebody opens a page. Does nothing outside a demo's plan. */
export async function colleagueOnPage(
  ctx: OrgContext,
  pageId: string,
  pace: Pace = PACE,
): Promise<void> {
  if (!demoEnabled() || writing.has(pageId)) return;
  const page = await getPage(ctx, pageId);
  const line = page && LINES[page.title];
  if (!line || !(await isDemoWorkspace(ctx.orgId))) return;
  writing.add(pageId);
  try {
    const member = (await listMembers(ctx)).find(
      (m) => m.name === COLLEAGUE && m.email.endsWith("@demo.facade.invalid"),
    );
    if (!member) return;
    const anna = { orgId: ctx.orgId, userId: member.userId };
    await sleep(pace.startMs);
    const said = textOf(docToJson(buildDoc([await loadState(anna, pageId)])));
    if (!said.includes(line)) await write(anna, pageId, line, pace);
  } finally {
    writing.delete(pageId);
  }
}
