"use client";

import type { Editor } from "@tiptap/react";
import {
  Check,
  CloudOff,
  FileText,
  History,
  Loader2,
  MessageSquare,
  Plus,
  WandSparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLive, useLiveEvent } from "@/components/live/live-provider";
import { MovePageDialog } from "@/components/nav/move-page-dialog";
import { PersonDot, useWorkspace } from "@/components/nav/workspace-context";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { createPageAction } from "@/modules/pages/actions";
import { breadcrumbs } from "@/modules/pages/tree";
import { AiPanel } from "./ai-panel";
import { PageEditor } from "./editor";
import { HistoryPanel } from "./history-panel";
import { LiveDoc, type SaveState } from "./live-doc";
import { PageLinkDialog } from "./page-link-dialog";
import { PageMenu } from "./page-menu";
import { PageTalk } from "./page-talk";

type Panel = "talk" | "history" | "ai" | null;

export type PageInfo = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  icon: string;
  editedAt: string | null;
  editedBy: string | null;
};

function SaveMark({ state }: { state: SaveState }) {
  const t = useTranslations("page");
  const [Icon, label] =
    state === "saving"
      ? [Loader2, t("saving")]
      : state === "failed"
        ? [CloudOff, t("notSaved")]
        : [Check, t("saved")];
  return (
    <span
      role="status"
      className={cn(
        "text-meta flex items-center gap-1 text-xs",
        state === "failed" && "text-destructive font-medium",
      )}
    >
      <Icon aria-hidden className={cn("size-3.5", state === "saving" && "animate-spin")} />
      <span className={cn(state !== "failed" && "hidden sm:inline")}>{label}</span>
    </span>
  );
}

export function PageView({ page, openTalk }: { page: PageInfo; openTalk: boolean }) {
  const t = useTranslations("page");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const { me, people, tree, aiReady } = useWorkspace();
  const { connection, generation } = useLive();
  const [save, setSave] = useState<SaveState>("saved");
  const [doc, setDoc] = useState<LiveDoc | null>(null);
  const [live, setLive] = useState<LiveDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [here, setHere] = useState<string[]>([]);
  const [panel, setPanel] = useState<Panel>(openTalk ? "talk" : null);
  const [title, setTitle] = useState(page.title);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [linking, setLinking] = useState<Editor | null>(null);
  const [moving, setMoving] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const saveTitle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unsavedTitle = useRef<string | null>(null);

  useEffect(() => {
    const created = new LiveDoc(page.id, setSave);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a Y.Doc lives in the browser only, for this mount
    setDoc(created);
    const warn = (e: BeforeUnloadEvent) => {
      if (created.pending) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      setDoc(null);
      setLive(null);
      setEditor(null);
      created.destroy();
    };
  }, [page.id]);

  // On every (re)connection: first join the page, then read it. In that
  // order, or an edit landing between the two reaches this tab by neither
  // road, and everything after it waits behind the gap.
  useEffect(() => {
    if (!doc) return;
    let gone = false;
    const read = () =>
      doc.load().then((ok) => {
        if (gone) return;
        if (ok) setLive(doc);
        else setMissing(true);
      });
    if (!connection) {
      // The stream is late or down: the page can still be read and written.
      const timer = setTimeout(() => void read(), 2500);
      return () => {
        gone = true;
        clearTimeout(timer);
      };
    }
    void doc.attach(connection).then((users) => {
      if (gone) return;
      setHere(users);
      void read();
    });
    return () => {
      gone = true;
    };
  }, [doc, connection, generation]);

  useLiveEvent((event) => {
    if (event.type === "doc.update" && event.pageId === page.id) doc?.receiveUpdate(event.data);
    else if (event.type === "doc.awareness" && event.pageId === page.id)
      doc?.receiveAwareness(event.data);
    else if (event.type === "page.presence" && event.pageId === page.id) {
      setHere(event.users);
      doc?.announce();
    } else if (
      event.type === "page.title" &&
      event.pageId === page.id &&
      document.activeElement !== titleRef.current
    )
      setTitle(event.title);
  });

  useEffect(() => {
    const box = titleRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [title]);

  const flushTitle = useCallback(() => {
    clearTimeout(saveTitle.current);
    const clean = unsavedTitle.current;
    if (clean === null) return;
    unsavedTitle.current = null;
    // keepalive: a title typed a moment before the tab closes still arrives.
    void fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: clean }),
      keepalive: true,
    })
      .then((answer) => {
        if (!answer.ok) toast.error(tNav("failed"));
      })
      .catch(() => toast.error(tNav("failed")));
  }, [page.id, tNav]);

  useEffect(() => {
    window.addEventListener("pagehide", flushTitle);
    return () => {
      window.removeEventListener("pagehide", flushTitle);
      flushTitle();
    };
  }, [flushTitle]);

  function changeTitle(next: string) {
    const clean = next.replace(/\n/g, " ");
    setTitle(clean);
    unsavedTitle.current = clean;
    clearTimeout(saveTitle.current);
    saveTitle.current = setTimeout(flushTitle, 350);
  }

  const trail = useMemo(() => breadcrumbs(tree, page.id).slice(0, -1), [tree, page.id]);
  const children = tree.filter((n) => n.parentId === page.id).sort((a, b) => a.sort - b.sort);
  const present = people.filter((p) => here.includes(p.id) && p.id !== me.id);
  const self = tree.find((n) => n.id === page.id);
  const onReady = useCallback((e: Editor) => setEditor(e), []);
  const onPickPage = useCallback((e: Editor) => setLinking(e), []);

  async function addSubpage() {
    const made = await createPageAction({ projectId: page.projectId, parentId: page.id });
    if (made.ok) router.push(`/pages/${made.data.id}`);
    else toast.error(tNav("failed"));
  }

  if (missing) return <p className="text-meta p-8 text-sm">{t("gone")}</p>;

  const toggle = (next: Panel) => setPanel((was) => (was === next ? null : next));
  const tool = (key: Exclude<Panel, null>, icon: React.ReactNode, label: string) => (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={panel === key}
      aria-label={label}
      title={label}
      onClick={() => toggle(key)}
      className={cn(panel === key && "bg-accent text-accent-foreground")}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 px-4">
          <nav aria-label={t("breadcrumbs")} className="min-w-0 flex-1 truncate text-sm">
            <Link href={`/projects/${page.projectId}`} className="text-meta hover:text-foreground">
              {page.projectName}
            </Link>
            {trail.map((node) => (
              <span key={node.id}>
                <span className="text-label mx-1.5">/</span>
                <Link href={`/pages/${node.id}`} className="text-meta hover:text-foreground">
                  {node.title || tNav("untitled")}
                </Link>
              </span>
            ))}
          </nav>
          <div role="group" className="flex items-center -space-x-1.5" aria-label={t("hereNow")}>
            {present.map((person) => (
              <span key={person.id} className="ring-background rounded-full ring-2">
                <PersonDot person={person} size={26} />
              </span>
            ))}
          </div>
          <SaveMark state={save} />
          {tool("talk", <MessageSquare aria-hidden />, t("talk"))}
          {tool("history", <History aria-hidden />, t("history"))}
          {aiReady && tool("ai", <WandSparkles aria-hidden />, t("ai"))}
          <PageMenu
            pageId={page.id}
            projectId={page.projectId}
            title={title}
            onMove={() => setMoving(true)}
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto" id="page-scroll">
          <article className="mx-auto w-full max-w-[46rem] px-5 pt-6 pb-40 sm:px-8 lg:pt-12">
            <textarea
              ref={titleRef}
              rows={1}
              value={title}
              onChange={(e) => changeTitle(e.target.value)}
              onBlur={flushTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editor?.commands.focus("start");
                }
              }}
              placeholder={tNav("untitled")}
              aria-label={t("titleLabel")}
              className="placeholder:text-label w-full resize-none overflow-hidden bg-transparent text-[2.125rem] leading-tight font-semibold tracking-tight outline-none"
            />
            {page.editedBy && page.editedAt && (
              <p className="text-meta mt-1 mb-5 text-xs">
                {t("lastEdited", { name: page.editedBy, when: new Date(page.editedAt) })}
              </p>
            )}
            {live ? (
              <PageEditor live={live} me={me} onReady={onReady} onPickPage={onPickPage} />
            ) : (
              <div aria-hidden className="mt-6 flex flex-col gap-3">
                <div className="bg-hairline h-4 w-3/4 rounded" />
                <div className="bg-hairline h-4 w-1/2 rounded" />
              </div>
            )}
            <section className="border-hairline mt-10 border-t pt-4">
              <h2 className="sr-only">{t("subpages")}</h2>
              <ul>
                {children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/pages/${child.id}`}
                      className="hover:bg-muted -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                    >
                      {child.icon ? (
                        <span aria-hidden>{child.icon}</span>
                      ) : (
                        <FileText aria-hidden className="text-meta size-4" />
                      )}
                      <span className="underline-offset-2 hover:underline">
                        {child.title || tNav("untitled")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void addSubpage()}
                className="text-meta hover:text-foreground hover:bg-muted -mx-2 mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <Plus aria-hidden className="size-4" />
                {tNav("addSubpage")}
              </button>
            </section>
          </article>
        </div>
      </div>
      {panel === "talk" && <PageTalk pageId={page.id} onClose={() => setPanel(null)} />}
      {panel === "history" && live && (
        <HistoryPanel pageId={page.id} editor={editor} live={live} onClose={() => setPanel(null)} />
      )}
      {panel === "ai" && live && (
        <AiPanel pageId={page.id} editor={editor} live={live} onClose={() => setPanel(null)} />
      )}
      {linking && <PageLinkDialog editor={linking} onClose={() => setLinking(null)} />}
      {moving && self && <MovePageDialog page={self} onClose={() => setMoving(false)} />}
    </div>
  );
}
