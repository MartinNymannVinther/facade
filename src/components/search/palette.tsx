"use client";

import { FileText, Hash } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/components/nav/workspace-context";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { plainMentions } from "@/modules/conversation/view";
import type { SearchHit } from "@/modules/search/service";

const EVENT = "facade:search";

export function openSearch() {
  window.dispatchEvent(new Event(EVENT));
}

function hrefOf(hit: SearchHit): string {
  if (hit.kind === "page") return `/pages/${hit.id}`;
  if (hit.pageId) return `/pages/${hit.pageId}?talk=1`;
  const thread = hit.parentId ?? hit.id;
  return `/channels/${hit.channelId}?thread=${thread}`;
}

/** ⟦word⟧ as marked text: the snippet stays text, whatever a page says. */
function Snippet({ text }: { text: string }) {
  const parts = plainMentions(text).split(/⟦|⟧/);
  return (
    <span className="text-meta line-clamp-2 text-xs">
      {parts.map((part, i) =>
        i % 2 ? (
          <mark key={i} className="text-foreground bg-accent rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </span>
  );
}

/** ⌘K: everything written in the workspace, from anywhere. */
export function SearchPalette() {
  const t = useTranslations("search");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const { tree, projects } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [active, setActive] = useState(0);
  const asked = useRef(0);

  useEffect(() => {
    const show = () => setOpen(true);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((was) => !was);
      }
    };
    window.addEventListener(EVENT, show);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener(EVENT, show);
      window.removeEventListener("keydown", key);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    const ask = ++asked.current;
    const timer = setTimeout(async () => {
      if (!q) return setHits(null);
      const answer = await fetch(`/api/search?q=${encodeURIComponent(q)}`).catch(() => null);
      if (!answer?.ok || ask !== asked.current) return;
      setHits(((await answer.json()) as { hits: SearchHit[] }).hits);
      setActive(0);
    }, 140);
    return () => clearTimeout(timer);
  }, [query]);

  const shown: SearchHit[] = useMemo(() => {
    if (hits) return hits;
    return tree.slice(0, 8).map((node) => ({
      kind: "page",
      id: node.id,
      title: node.title,
      icon: node.icon,
      project: projects.find((p) => p.id === node.projectId)?.name ?? "",
      snippet: "",
    }));
  }, [hits, tree, projects]);

  function go(hit: SearchHit) {
    setOpen(false);
    setQuery("");
    setHits(null);
    router.push(hrefOf(hit));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[12vh] max-w-xl translate-y-0 gap-0 p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && shown[active]) {
              e.preventDefault();
              go(shown[active]);
            }
          }}
          placeholder={t("placeholder")}
          aria-label={t("title")}
          className="border-border h-12 w-full border-b bg-transparent px-4 text-base outline-none"
        />
        <ul className="max-h-[52vh] overflow-y-auto p-1.5">
          {shown.length === 0 && (
            <li className="text-meta px-3 py-6 text-sm">
              {query.trim() ? t("nothing") : t("start")}
            </li>
          )}
          {shown.map((hit, i) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                onClick={() => go(hit)}
                onMouseMove={() => setActive(i)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left",
                  i === active && "bg-muted",
                )}
              >
                {hit.kind === "page" ? (
                  <FileText aria-hidden className="text-meta mt-0.5 size-4 shrink-0" />
                ) : (
                  <Hash aria-hidden className="text-meta mt-0.5 size-4 shrink-0" />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {hit.kind === "page"
                      ? hit.title || tNav("untitled")
                      : `${hit.author} ${hit.pageId ? t("onPage") : `#${hit.channel}`}`}
                  </span>
                  {hit.snippet && <Snippet text={hit.snippet} />}
                </span>
                {hit.kind === "page" && (
                  <span className="text-label shrink-0 text-xs">{hit.project}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
