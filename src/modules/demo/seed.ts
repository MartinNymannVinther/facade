import type { OrgContext } from "@/core/db/tenant";
import { ensureGeneralChannel } from "@/modules/conversation/channels";
import { sendMessage } from "@/modules/conversation/messages";
import { createPage } from "@/modules/pages/service";
import { createProject } from "@/modules/projects/service";

/**
 * A project under way for the demo: an association planning its summer
 * festival, written through the ordinary services as the demo's owner, so
 * what a visitor sees is exactly what the product does with real rows.
 */

type L = "da" | "en";

const TEXT = {
  da: {
    general: "generelt",
    project: "Sommerfesten",
    description: "Vi samler alt om festen her: planen, aftalerne og snakken.",
    plan: "Planen",
    planBody: `Festen er lørdag i uge 26. Vi regner med **120 gæster**.

## Det skal være på plads

- [x] Lej pladsen hos kommunen
- [x] Book bandet
- [ ] Find to frivillige til baren
- [ ] Bestil telt

## Beslutninger

> Vi laver ikke billetsalg i år. Man melder sig til, og vi sender hatten rundt.

Skriv på siden samtidig: åbn den i to vinduer, og se bogstaverne komme.`,
    budget: "Budget",
    budgetBody: `| Post | Kroner |
| --- | --- |
| Telt | 6.500 |
| Band | 8.000 |
| Mad | 12.000 |`,
    music: "Musik",
    musicBody: "Bandet spiller fra 20 til 22. Vi mangler en plan for lyd efter klokken 22.",
    hello: "Velkommen. Skriv her, eller brug projektets egen kanal.",
    channel: "Hvem tager sig af teltet? Det skal bestilles inden fredag.",
    reply: "Jeg ringer til udlejeren i morgen.",
  },
  en: {
    general: "general",
    project: "Summer party",
    description: "Everything about the party in one place: the plan, the deals and the talk.",
    plan: "The plan",
    planBody: `The party is on the last Saturday in June. We expect **120 guests**.

## To get done

- [x] Rent the field from the council
- [x] Book the band
- [ ] Find two volunteers for the bar
- [ ] Order the tent

## Decisions

> No ticket sales this year. People sign up, and we pass the hat.

Write on the page together: open it in two windows and watch the letters arrive.`,
    budget: "Budget",
    budgetBody: `| Item | Kroner |
| --- | --- |
| Tent | 6,500 |
| Band | 8,000 |
| Food | 12,000 |`,
    music: "Music",
    musicBody: "The band plays from 8 to 10. We still need a plan for sound after 10.",
    hello: "Welcome. Write here, or use the project's own channel.",
    channel: "Who is taking the tent? It has to be ordered by Friday.",
    reply: "I'll call the rental place tomorrow.",
  },
} as const;

export async function seedDemoWorkspace(ctx: OrgContext, locale: L): Promise<void> {
  const t = TEXT[locale];
  await ensureGeneralChannel(ctx, t.general);
  const { id: projectId, channelId } = await createProject(ctx, {
    name: t.project,
    description: t.description,
    icon: "🎪",
  });
  const plan = await createPage(ctx, {
    projectId,
    parentId: null,
    title: t.plan,
    markdown: t.planBody,
  });
  await createPage(ctx, {
    projectId,
    parentId: plan.id,
    title: t.budget,
    markdown: t.budgetBody,
  });
  await createPage(ctx, {
    projectId,
    parentId: plan.id,
    title: t.music,
    markdown: t.musicBody,
  });
  const first = await sendMessage(ctx, {
    channelId,
    parentId: null,
    body: t.channel,
    fileIds: [],
  });
  await sendMessage(ctx, { channelId, parentId: first.id, body: t.reply, fileIds: [] });
}
