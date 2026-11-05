import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { listMessages } from "@/modules/conversation/messages";
import { plainMentions } from "@/modules/conversation/view";
import { textOf } from "@/modules/pages/document";
import { loadJson } from "@/modules/pages/sync";
import type { OrgContext } from "@/core/db/tenant";
import { MAX_INPUT_CHARS } from "./limits";
import { DATA_RULE, fenceUntrusted, languageRule } from "./prompting";
import { askForJson } from "./service";

/**
 * The AI's two proposals: on a page, and on a channel. The server reads
 * the content itself rather than taking it from the browser, what it reads
 * is fenced as data, and the answer is text a person may or may not place
 * (dogma five). Neither of these writes a row.
 */

const Proposal = z.object({ text: z.string().trim().min(1).max(12_000) });

export const PageAsk = z.object({
  pageId: z.string().min(1).max(100),
  task: z.enum(["summarize", "tasks", "continue", "improve"]),
  selection: z.string().max(MAX_INPUT_CHARS).default(""),
});

const TASKS: Record<z.infer<typeof PageAsk>["task"], string> = {
  summarize: "Write a short summary of the page: at most five bullet points.",
  tasks:
    'List what still has to be done according to the page, as a Markdown task list ("- [ ] ...").',
  continue: "Continue the page from where it ends, in its own voice: one or two paragraphs.",
  improve:
    "Rewrite the selected text so it is clearer and shorter, keeping its meaning. If nothing is selected, improve the page's opening paragraph.",
};

const SHAPE = 'Answer with JSON: {"text": "..."} where text is Markdown.';

export async function proposeForPage(
  ctx: OrgContext,
  input: z.infer<typeof PageAsk>,
  locale: Locale,
) {
  const page = textOf(await loadJson(ctx, input.pageId));
  const { data, engine } = await askForJson(ctx, "page", [
    {
      role: "system",
      content: `You help a small team with a page they write together. ${TASKS[input.task]} ${DATA_RULE} ${languageRule(locale)} ${SHAPE}`,
    },
    {
      role: "user",
      content: `The page:\n${fenceUntrusted(page)}\n\nSelected text:\n${fenceUntrusted(input.selection)}`,
    },
  ]);
  return { proposal: Proposal.parse(data), engine };
}

export const ChannelAsk = z.object({ channelId: z.string().min(1).max(100) });

/** The channel's latest stretch in a few lines, for whoever was away. */
export async function proposeCatchUp(
  ctx: OrgContext,
  input: z.infer<typeof ChannelAsk>,
  locale: Locale,
) {
  const { messages } = await listMessages(ctx, input.channelId);
  const said = messages
    .filter((m) => !m.deleted)
    .map((m) => `${m.authorName}: ${plainMentions(m.body)}`)
    .join("\n");
  const { data, engine } = await askForJson(ctx, "channel", [
    {
      role: "system",
      content: `Summarize this team conversation for somebody who was away: what was decided, what is open, who does what. At most six bullet points. ${DATA_RULE} ${languageRule(locale)} ${SHAPE}`,
    },
    { role: "user", content: fenceUntrusted(said) },
  ]);
  return { proposal: Proposal.parse(data), engine };
}
