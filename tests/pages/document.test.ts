import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  buildDoc,
  docToJson,
  encodeDoc,
  isValidUpdate,
  jsonToMarkdown,
  jsonToState,
  markdownToJson,
  mentionsOf,
  textOf,
} from "@/modules/pages/document";

const SOURCE = `# Skakmester

En **gåde** med [link](https://haij.dk).

- [ ] Print kuverter
- [x] Gå ruten

| Stop | Sted |
| --- | --- |
| 1 | Vesterport |`;

describe("a document without a browser", () => {
  it("survives Markdown → Yjs → Markdown", () => {
    const doc = buildDoc([jsonToState(markdownToJson(SOURCE))]);
    const out = jsonToMarkdown(docToJson(doc));
    expect(out).toContain("# Skakmester");
    expect(out).toContain("**gåde**");
    expect(out).toContain("- [x] Gå ruten");
    expect(out).toContain("Vesterport");
  });

  it("reads out the words a block to a line, table cells included", () => {
    const text = textOf(markdownToJson(SOURCE));
    expect(text.split("\n")).toContain("Skakmester");
    expect(text).toContain("Print kuverter");
    expect(text).toContain("Vesterport");
    expect(text).not.toContain("**");
  });

  it("finds the people named, once each", () => {
    const person = { type: "mention", attrs: { id: "u1", label: "Kasper" } };
    const json = {
      type: "doc",
      content: [{ type: "paragraph", content: [person, { type: "text", text: " og " }, person] }],
    };
    expect(mentionsOf(json)).toEqual(["u1"]);
    expect(textOf(json)).toBe("@Kasper og @Kasper");
  });

  it("merges two people writing at once without losing a word", () => {
    const base = jsonToState(markdownToJson("Fælles start"));
    const one = buildDoc([base]);
    const two = buildDoc([base]);
    const edit = (doc: Y.Doc, word: string) => {
      const paragraph = doc.getXmlFragment("default").get(0) as Y.XmlElement;
      (paragraph.get(0) as Y.XmlText).insert(0, word);
    };
    edit(one, "Kasper ");
    edit(two, "Michael ");
    const merged = buildDoc([encodeDoc(one), encodeDoc(two)]);
    const text = textOf(docToJson(merged));
    expect(text).toContain("Kasper");
    expect(text).toContain("Michael");
    expect(text).toContain("Fælles start");
  });

  it("gives an empty document one empty paragraph", () => {
    expect(docToJson(new Y.Doc()).content).toEqual([{ type: "paragraph" }]);
  });

  it("tells an update from noise", () => {
    expect(isValidUpdate(jsonToState(markdownToJson("hej")))).toBe(true);
    expect(isValidUpdate(new Uint8Array())).toBe(false);
    expect(isValidUpdate(new Uint8Array([255, 255, 255, 255, 1, 2, 3]))).toBe(false);
  });
});
