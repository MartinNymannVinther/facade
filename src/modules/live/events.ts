import type { MessageView } from "@/modules/conversation/view";

/**
 * Everything that travels down the live stream. The stream tells a browser
 * that something happened; the database stays the truth, and a browser that
 * missed an event catches up by reading (docs/adr/0012).
 */
export type LiveEvent =
  | { type: "tree" }
  | { type: "page.title"; pageId: string; title: string; icon: string }
  | { type: "channels" }
  | { type: "message.new"; message: MessageView }
  | { type: "message.changed"; message: MessageView }
  | { type: "presence"; online: string[] }
  | { type: "page.presence"; pageId: string; users: string[] }
  | { type: "doc.update"; pageId: string; data: string; from: string }
  | { type: "doc.awareness"; pageId: string; data: string; from: string }
  | { type: "inbox" };
