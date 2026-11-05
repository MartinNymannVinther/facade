"use client";

/* The editor is built once, and these refs are how its callbacks reach the
   latest people and commands: read when a key is pressed, never in render. */
/* eslint-disable react-hooks/refs */

import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Mention from "@tiptap/extension-mention";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Italic, Link2, Strikethrough } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { presenceColor, useWorkspace, type Person } from "@/components/nav/workspace-context";
import { cn } from "@/lib/utils";
import { contentExtensions } from "@/modules/pages/extensions";
import type { LiveDoc } from "./live-doc";
import { slashExtension, type SlashCommand } from "./slash";
import { popupRender } from "./suggestion-popup";
import { uploadFile } from "./upload";

function useSlashCommands(pick: () => void, pickPage: (editor: Editor) => void) {
  const t = useTranslations("editor");
  return useMemo<SlashCommand[]>(() => {
    const block = (id: string, keywords: string, run: (editor: Editor) => void): SlashCommand => ({
      id,
      label: t(`slash.${id}`),
      keywords,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).run();
        run(editor);
      },
    });
    return [
      block("h1", "h1 heading overskrift", (e) => e.chain().toggleHeading({ level: 1 }).run()),
      block("h2", "h2 heading overskrift", (e) => e.chain().toggleHeading({ level: 2 }).run()),
      block("h3", "h3 heading overskrift", (e) => e.chain().toggleHeading({ level: 3 }).run()),
      block("todo", "todo task opgave tjek", (e) => e.chain().toggleTaskList().run()),
      block("bullet", "bullet liste punkter", (e) => e.chain().toggleBulletList().run()),
      block("ordered", "numbered nummer liste", (e) => e.chain().toggleOrderedList().run()),
      block("quote", "quote citat", (e) => e.chain().toggleBlockquote().run()),
      block("code", "code kode", (e) => e.chain().toggleCodeBlock().run()),
      block("table", "table tabel", (e) =>
        e.chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      ),
      block("divider", "divider streg hr", (e) => e.chain().setHorizontalRule().run()),
      block("image", "image billede fil", () => pick()),
      block("pageLink", "link side page", (e) => pickPage(e)),
    ];
  }, [t, pick, pickPage]);
}

function Toolbar({ editor }: { editor: Editor }) {
  const t = useTranslations("editor");
  const mark = (name: string, label: string, icon: React.ReactNode, run: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={editor.isActive(name)}
      onClick={run}
      className={cn(
        "flex size-8 items-center justify-center rounded-md",
        editor.isActive(name) ? "bg-accent text-accent-foreground" : "hover:bg-muted",
      )}
    >
      {icon}
    </button>
  );
  const link = () => {
    const was = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt(t("linkPrompt"), was ?? "https://");
    if (href === null) return;
    if (!href) editor.chain().focus().unsetLink().run();
    else if (/^(https?:|mailto:|\/)/.test(href)) editor.chain().focus().setLink({ href }).run();
  };
  return (
    <div className="bg-popover ring-foreground/10 flex gap-0.5 rounded-lg p-1 shadow-md ring-1">
      {mark("bold", t("bold"), <Bold className="size-4" />, () =>
        editor.chain().focus().toggleBold().run(),
      )}
      {mark("italic", t("italic"), <Italic className="size-4" />, () =>
        editor.chain().focus().toggleItalic().run(),
      )}
      {mark("strike", t("strike"), <Strikethrough className="size-4" />, () =>
        editor.chain().focus().toggleStrike().run(),
      )}
      {mark("code", t("inlineCode"), <Code className="size-4" />, () =>
        editor.chain().focus().toggleCode().run(),
      )}
      {mark("link", t("link"), <Link2 className="size-4" />, link)}
    </div>
  );
}

/**
 * The page itself. Starts from the Y.Doc it is handed and never sets
 * content of its own: a second source of initial text is how collaborative
 * editors end up with everything twice.
 */
export function PageEditor({
  live,
  me,
  onReady,
  onPickPage,
}: {
  live: LiveDoc;
  me: Person;
  onReady: (editor: Editor) => void;
  onPickPage: (editor: Editor) => void;
}) {
  const t = useTranslations("editor");
  const { people } = useWorkspace();
  const peopleRef = useRef(people);
  useEffect(() => {
    peopleRef.current = people;
  }, [people]);
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const pick = useMemo(() => () => fileInput.current?.click(), []);
  const commands = useSlashCommands(pick, onPickPage);
  const commandsRef = useRef(commands);
  useEffect(() => {
    commandsRef.current = commands;
  }, [commands]);

  async function place(files: File[], at?: number) {
    for (const file of files) {
      const stored = await uploadFile(file);
      const editor = editorRef.current;
      if (!stored) {
        toast.error(t("uploadFailed", { name: file.name }));
        continue;
      }
      if (!editor) return;
      const src = `/api/files/${stored.id}`;
      const chain = editor.chain().focus(at);
      if (file.type.startsWith("image/") && file.type !== "image/svg+xml")
        chain.setImage({ src, alt: stored.name }).run();
      else
        chain
          .insertContent({
            type: "paragraph",
            content: [
              { type: "text", text: stored.name, marks: [{ type: "link", attrs: { href: src } }] },
            ],
          })
          .run();
    }
  }
  const placeRef = useRef(place);
  useEffect(() => {
    placeRef.current = place;
  });

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: "facade-page", "aria-label": t("label") },
      handlePaste(_view, event) {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.length) return false;
        void placeRef.current(files);
        return true;
      },
      handleDrop(view, event) {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (!files.length) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void placeRef.current(files, at);
        return true;
      },
    },
    extensions: [
      ...contentExtensions().map((extension) =>
        extension.name === "mention"
          ? (extension as typeof Mention).configure({
              HTMLAttributes: { class: "facade-mention" },
              suggestion: {
                char: "@",
                items: ({ query }: { query: string }) =>
                  peopleRef.current
                    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
                    .slice(0, 8)
                    .map((p) => ({ id: p.id, label: p.name })),
                render: popupRender(t("nobody")),
              },
            })
          : extension,
      ),
      Markdown,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading" ? t("headingPlaceholder") : t("placeholder"),
      }),
      Collaboration.configure({ document: live.doc }),
      CollaborationCaret.configure({
        provider: { awareness: live.awareness },
        user: { name: me.name, color: presenceColor(me.id) },
      }),
      slashExtension(() => commandsRef.current, t("noCommand")),
    ],
  });

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    onReady(editor);
  }, [editor, onReady]);

  return (
    <>
      {editor && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: e, state }) =>
            !state.selection.empty && !e.isActive("codeBlock") && !e.isActive("image")
          }
        >
          <Toolbar editor={editor} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        aria-label={t("slash.image")}
        onChange={(e) => {
          void place([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}
