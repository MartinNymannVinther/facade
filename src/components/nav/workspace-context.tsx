"use client";

import { createContext, useContext } from "react";
import type { ChannelView } from "@/modules/conversation/channels";
import type { TreeNode } from "@/modules/pages/tree";

export type Person = { id: string; name: string };
export type NavProject = { id: string; name: string; icon: string };

export type WorkspaceData = {
  me: Person;
  people: Person[];
  projects: NavProject[];
  tree: TreeNode[];
  channels: ChannelView[];
  inbox: number;
  aiReady: boolean;
};

const WorkspaceContext = createContext<WorkspaceData | null>(null);

/** What the whole shell reads, drawn on the server and refreshed by the live stream. */
export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceData;
  children: React.ReactNode;
}) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceData {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace outside WorkspaceProvider");
  return workspace;
}

/**
 * The six colours people have on a page: the one place 2a allows hue beyond
 * moss, because telling two cursors apart is the point. Even lightness, so
 * no colleague shouts louder than another. Hex because the cursor library
 * accepts nothing else; the ink on them is --presence-ink, in both themes.
 */
const PRESENCE = ["#9fd4a9", "#e8b98b", "#9cc3ea", "#e0a8d6", "#cfcf8b", "#eda8a6"];

/** A person's own colour on the page, stable across sessions. */
export function presenceColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PRESENCE[Math.abs(hash) % PRESENCE.length]!;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return (
    (words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

export function PersonDot({ person, size = 24 }: { person: Person; size?: number }) {
  return (
    <span
      title={person.name}
      aria-label={person.name}
      role="img"
      style={{ background: presenceColor(person.id), width: size, height: size }}
      className="text-presence-ink inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
    >
      {initials(person.name)}
    </span>
  );
}
