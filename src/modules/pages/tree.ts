/** Pure rules of the tree, kept apart so they can be tested without a database. */

export type TreeNode = {
  id: string;
  parentId: string | null;
  projectId: string;
  title: string;
  icon: string;
  sort: number;
};

/** A page may not be moved under itself or anything below it. */
export function wouldCycle(nodes: TreeNode[], pageId: string, newParentId: string | null): boolean {
  const parents = new Map(nodes.map((n) => [n.id, n.parentId]));
  const seen = new Set<string>();
  let current = newParentId;
  while (current) {
    if (current === pageId || seen.has(current)) return true;
    seen.add(current);
    current = parents.get(current) ?? null;
  }
  return false;
}

/** The sort value that puts a page at `index` among its new siblings. */
export function sortAt(siblings: { sort: number }[], index: number): number {
  const ordered = [...siblings].sort((a, b) => a.sort - b.sort);
  const before = ordered[index - 1]?.sort;
  const after = ordered[index]?.sort;
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** The page and everything under it. */
export function subtreeIds(nodes: { id: string; parentId: string | null }[], rootId: string) {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
  }
  const ids: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    ids.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return ids;
}

/** From the top of the project down to the page, the page included. */
export function breadcrumbs<T extends { id: string; parentId: string | null }>(
  nodes: T[],
  pageId: string,
): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const trail: T[] = [];
  let current = byId.get(pageId);
  while (current && !trail.includes(current)) {
    trail.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return trail;
}
