"use client";

import { createContext, useContext } from "react";
import { presenceColor } from "@/lib/presence";
import type { ChannelView } from "@/modules/conversation/channels";
import type { TreeNode } from "@/modules/pages/tree";

export { presenceColor };

export type Person = { id: string; name: string; agent?: boolean };
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
