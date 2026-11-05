import * as Y from "yjs";

/**
 * What a page could not hand to the server before it went away: a sidebar
 * link clicked while offline, a page a colleague trashed, a tab closing. It
 * outlives the editor, and in localStorage the tab too, and is sent when
 * the server answers. Sending twice does no harm: Yjs merges by identity.
 */

const KEY = "facade-outbox";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const RETRY_MS = 5000;

type Entry = { data: string; at: number };
type Box = Record<string, Entry>;

const toBase64 = (bytes: Uint8Array) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const fromBase64 = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

/** Kept here too, for when the browser refuses storage or it is full. */
let memory: Box = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let draining = false;

function read(): Box {
  try {
    return { ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Box), ...memory };
  } catch {
    return memory;
  }
}

function write(box: Box) {
  memory = box;
  try {
    localStorage.setItem(KEY, JSON.stringify(box));
    memory = {};
  } catch {}
}

/** Takes over what a page still holds, and starts trying. */
export function park(pageId: string, updates: Uint8Array[]) {
  if (updates.length === 0) return;
  const box = read();
  const held = box[pageId] ? [fromBase64(box[pageId].data)] : [];
  box[pageId] = { data: toBase64(Y.mergeUpdates([...held, ...updates])), at: Date.now() };
  write(box);
  void drain();
}

export async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  clearTimeout(timer);
  const box = read();
  let waiting = false;
  for (const [pageId, entry] of Object.entries(box)) {
    const body = fromBase64(entry.data);
    const answer = await fetch(`/api/pages/${pageId}/doc`, {
      method: "POST",
      body: body as BodyInit,
      keepalive: body.length < 60_000,
    }).catch(() => null);
    // 404 may be another workspace's page: it waits for that session, for a while.
    const expired = Date.now() - entry.at > MAX_AGE_MS;
    if (answer?.ok || expired) {
      const now = read();
      if (now[pageId]?.data === entry.data) delete now[pageId];
      write(now);
    } else if (answer?.status !== 404) waiting = true;
  }
  draining = false;
  if (waiting) timer = setTimeout(() => void drain(), RETRY_MS);
}
