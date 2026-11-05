import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as Y from "yjs";

export type SaveState = "saved" | "saving" | "failed";

const fromBase64 = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

const BATCH_MS = 120;
const AWARENESS_MS = 150;

/**
 * One open page in the browser: the Y.Doc, the wire to the server and the
 * bookkeeping that keeps a word from being lost (ADR 0012). Edits are
 * batched and sent one request at a time; a failed send stays queued and is
 * tried again, so a dropped connection costs a delay, never text.
 */
export class LiveDoc {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  private queue: Uint8Array[] = [];
  private sending = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private awarenessTimer: ReturnType<typeof setTimeout> | undefined;
  private awarenessDirty = new Set<number>();
  private failures = 0;
  private closed = false;
  private connection: string | null = null;
  private waiters: (() => void)[] = [];

  constructor(
    readonly pageId: string,
    private onState: (state: SaveState) => void,
  ) {
    this.doc.on("update", this.onUpdate);
    this.awareness.on("update", this.onAwareness);
    window.addEventListener("pagehide", this.onLeave);
    document.addEventListener("visibilitychange", this.onLeave);
  }

  /**
   * The tab is closing or the phone is switching app, and a timer may never
   * fire again. What is queued leaves now, on a request the browser finishes
   * even after the page is gone; if the page lives on and it failed, it goes
   * back in the queue.
   */
  private onLeave = () => {
    if (document.visibilityState === "visible" || this.queue.length === 0) return;
    clearTimeout(this.timer);
    const body = Y.mergeUpdates(this.queue);
    this.queue = [];
    const url = `/api/pages/${this.pageId}/doc?connection=${this.connection ?? ""}`;
    void fetch(url, { method: "POST", body: body as BodyInit, keepalive: true })
      .then((answer) => {
        if (answer.ok) this.onState("saved");
        else this.requeue(body);
      })
      .catch(() => this.requeue(body));
  };

  private requeue(body: Uint8Array) {
    if (this.closed) return;
    this.queue = [body, ...this.queue];
    this.onState("failed");
    this.schedule(1000);
  }

  private onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    this.queue.push(update);
    this.onState("saving");
    this.schedule(BATCH_MS);
  };

  private onAwareness = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin !== "local") return;
    for (const id of [...changes.added, ...changes.updated, ...changes.removed])
      this.awarenessDirty.add(id);
    this.awarenessTimer ??= setTimeout(() => {
      this.awarenessTimer = undefined;
      this.sendAwareness();
    }, AWARENESS_MS);
  };

  private sendAwareness(ids?: number[]) {
    const clients = ids ?? [...this.awarenessDirty];
    this.awarenessDirty.clear();
    if (!this.connection || clients.length === 0) return;
    const body = encodeAwarenessUpdate(this.awareness, clients);
    void fetch(`/api/pages/${this.pageId}/awareness?connection=${this.connection}`, {
      method: "POST",
      body: body as BodyInit,
      keepalive: true,
    }).catch(() => {});
  }

  /** Reads the whole document; idempotent, so also how a reconnect catches up. */
  async load(): Promise<boolean> {
    const answer = await fetch(`/api/pages/${this.pageId}/doc`).catch(() => null);
    if (!answer?.ok) return false;
    Y.applyUpdate(this.doc, new Uint8Array(await answer.arrayBuffer()), this);
    return true;
  }

  /** Puts this tab on the page, then says where its cursor is. */
  async attach(connection: string): Promise<string[]> {
    this.connection = connection;
    const answer = await fetch("/api/live/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection, pageId: this.pageId }),
    }).catch(() => null);
    if (!answer?.ok) return [];
    this.announce();
    return ((await answer.json()) as { users: string[] }).users;
  }

  /** Somebody new is here and has not seen where we are. */
  announce() {
    this.sendAwareness([this.doc.clientID]);
  }

  receiveUpdate(data: string) {
    Y.applyUpdate(this.doc, fromBase64(data), this);
  }

  receiveAwareness(data: string) {
    applyAwarenessUpdate(this.awareness, fromBase64(data), this);
  }

  private schedule(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  private async flush() {
    if (this.sending || this.queue.length === 0 || this.closed) return;
    this.sending = true;
    const batch = this.queue;
    this.queue = [];
    const url = `/api/pages/${this.pageId}/doc?connection=${this.connection ?? ""}`;
    const body = Y.mergeUpdates(batch);
    // keepalive (64 kB at most) so an edit already on its way outlives the page.
    const keepalive = body.length < 60_000;
    const answer = await fetch(url, { method: "POST", body: body as BodyInit, keepalive }).catch(
      () => null,
    );
    this.sending = false;
    if (answer?.ok) {
      this.failures = 0;
      if (this.queue.length) this.schedule(0);
      else {
        this.onState("saved");
        for (const done of this.waiters.splice(0)) done();
      }
      return;
    }
    // Back at the head of the line, in order.
    this.queue = [body, ...this.queue];
    this.failures += 1;
    this.onState("failed");
    this.schedule(Math.min(1000 * 2 ** this.failures, 15_000));
  }

  /** Resolves when nothing typed so far is still in this tab alone. */
  flushed(): Promise<void> {
    if (!this.pending) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.schedule(0);
    });
  }

  get pending(): boolean {
    return this.queue.length > 0 || this.sending;
  }

  destroy() {
    this.closed = true;
    window.removeEventListener("pagehide", this.onLeave);
    document.removeEventListener("visibilitychange", this.onLeave);
    clearTimeout(this.timer);
    clearTimeout(this.awarenessTimer);
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    this.sendAwareness([this.doc.clientID]);
    if (this.queue.length) {
      const body = Y.mergeUpdates(this.queue);
      void fetch(`/api/pages/${this.pageId}/doc`, {
        method: "POST",
        body: body as BodyInit,
        keepalive: true,
      }).catch(() => {});
    }
    this.doc.off("update", this.onUpdate);
    this.awareness.off("update", this.onAwareness);
    this.awareness.destroy();
    this.doc.destroy();
  }
}
