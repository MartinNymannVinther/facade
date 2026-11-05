import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { popupRender, type PopupItem } from "./suggestion-popup";

export type SlashCommand = PopupItem & {
  keywords: string;
  run: (editor: Editor, range: Range) => void;
};

/** "/" at the start of anything: the whole menu of what a page can hold. */
export function slashExtension(commands: () => SlashCommand[], empty: string) {
  return Extension.create({
    name: "slash",
    addProseMirrorPlugins() {
      return [
        Suggestion<PopupItem>({
          editor: this.editor,
          pluginKey: new PluginKey("slash"),
          char: "/",
          startOfLine: false,
          allowSpaces: false,
          items: ({ query }) => {
            const q = query.toLowerCase();
            return commands().filter(
              (c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q),
            );
          },
          command: ({ editor, range, props }) => {
            commands()
              .find((c) => c.id === props.id)
              ?.run(editor, range);
          },
          render: popupRender(empty),
        }),
      ];
    },
  });
}
