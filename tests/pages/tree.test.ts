import { describe, expect, it } from "vitest";
import { breadcrumbs, sortAt, subtreeIds, wouldCycle } from "@/modules/pages/tree";

const node = (id: string, parentId: string | null) => ({
  id,
  parentId,
  projectId: "p",
  title: id,
  icon: "",
  sort: 0,
});
const nodes = [node("a", null), node("b", "a"), node("c", "b"), node("d", null)];

describe("the tree", () => {
  it("refuses a page under itself or under its own descendant", () => {
    expect(wouldCycle(nodes, "a", "a")).toBe(true);
    expect(wouldCycle(nodes, "a", "c")).toBe(true);
    expect(wouldCycle(nodes, "c", "a")).toBe(false);
    expect(wouldCycle(nodes, "a", null)).toBe(false);
    expect(wouldCycle(nodes, "a", "d")).toBe(false);
  });

  it("finds room between siblings, at the ends, and in an empty level", () => {
    const siblings = [{ sort: 2 }, { sort: 1 }, { sort: 3 }];
    expect(sortAt(siblings, 0)).toBe(0);
    expect(sortAt(siblings, 1)).toBe(1.5);
    expect(sortAt(siblings, 3)).toBe(4);
    expect(sortAt([], 0)).toBe(1);
  });

  it("collects a subtree and the way down to a page", () => {
    expect(subtreeIds(nodes, "a").sort()).toEqual(["a", "b", "c"]);
    expect(breadcrumbs(nodes, "c").map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});
