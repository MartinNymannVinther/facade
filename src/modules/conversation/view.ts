/** A message as the interface shows it; shared with the browser. */
export type MessageView = {
  id: string;
  channelId: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string;
  body: string;
  attachments: { id: string; name: string; mime: string; size: number }[];
  reactions: { emoji: string; userIds: string[] }[];
  replyCount: number;
  lastReplyAt: string | null;
  editedAt: string | null;
  deleted: boolean;
  createdAt: string;
};

export const REACTIONS = ["👍", "❤️", "😄", "🎉", "👀", "✅"] as const;

const MENTION = /@\[([^\]]{1,120})\]\(([^)\s]{1,100})\)/g;

/** The people a body names, as `@[Name](id)` tokens. */
export function mentionIds(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION)].map((m) => m[2]!))];
}

/** A body split into plain text and people, for drawing. */
export function splitMentions(body: string): ({ text: string } | { name: string; id: string })[] {
  const parts: ({ text: string } | { name: string; id: string })[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION)) {
    if (match.index > last) parts.push({ text: body.slice(last, match.index) });
    parts.push({ name: match[1]!, id: match[2]! });
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts;
}

/** Names typed as `@Name` into tokens, longest name first; run before sending. */
export function encodeMentions(text: string, people: { id: string; name: string }[]): string {
  let body = text;
  for (const person of [...people].sort((a, b) => b.name.length - a.name.length)) {
    body = body.split(`@${person.name}`).join(`@[${person.name}](${person.id})`);
  }
  return body;
}

/** Tokens back to `@Name`, for editing and for reading outside the app. */
export function plainMentions(body: string): string {
  return body.replace(MENTION, "@$1");
}
