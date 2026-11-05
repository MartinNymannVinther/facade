"use client";

import { ReactRenderer, type Editor } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";

export type PopupItem = { id: string; label: string; hint?: string };

type Handle = { onKeyDown: (event: KeyboardEvent) => boolean };
type ListProps = { items: PopupItem[]; command: (item: PopupItem) => void; empty: string };

const List = forwardRef<Handle, ListProps>(function List({ items, command, empty }, ref) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (event.key === "ArrowDown") {
        setActive((a) => (a + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setActive((a) => (a - 1 + items.length) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "Enter" && items[active]) {
        command(items[active]);
        return true;
      }
      return false;
    },
  }));

  return (
    <div
      role="listbox"
      className="bg-popover ring-foreground/10 max-h-72 w-64 overflow-y-auto rounded-lg p-1 shadow-md ring-1"
    >
      {items.length === 0 && <p className="text-meta px-2 py-1.5 text-sm">{empty}</p>}
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault();
            command(item);
          }}
          onMouseEnter={() => setActive(i)}
          className={cn(
            "flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm",
            i === active && "bg-muted",
          )}
        >
          <span className="truncate">{item.label}</span>
          {item.hint && <span className="text-label shrink-0 text-xs">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
});

/** The little list under the cursor, for both "/" and "@". */
export function popupRender(empty: string): SuggestionOptions<PopupItem>["render"] {
  return () => {
    let renderer: ReactRenderer<Handle, ListProps> | null = null;
    const place = (props: SuggestionProps<PopupItem>) => {
      const box = props.clientRect?.();
      const element = renderer?.element as HTMLElement | undefined;
      if (!box || !element) return;
      const below = box.bottom + 300 < window.innerHeight;
      element.style.position = "fixed";
      element.style.zIndex = "60";
      element.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - 272))}px`;
      element.style.top = below ? `${box.bottom + 6}px` : "";
      element.style.bottom = below ? "" : `${window.innerHeight - box.top + 6}px`;
    };
    const propsOf = (props: SuggestionProps<PopupItem>): ListProps => ({
      items: props.items,
      command: (item) => props.command(item),
      empty,
    });
    return {
      onStart(props) {
        renderer = new ReactRenderer(List, {
          props: propsOf(props),
          editor: props.editor as Editor,
        });
        document.body.appendChild(renderer.element);
        place(props);
      },
      onUpdate(props) {
        renderer?.updateProps(propsOf(props));
        place(props);
      },
      onKeyDown({ event }) {
        if (event.key === "Escape") {
          renderer?.element.remove();
          return true;
        }
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit() {
        renderer?.element.remove();
        renderer?.destroy();
        renderer = null;
      },
    };
  };
}
