import { randomUUID } from "node:crypto";
import { authDb } from "@/core/db/client";
import { memberships, users } from "@/core/db/schema";
import type { OrgContext } from "@/core/db/tenant";
import { ensureGeneralChannel, pageChannelId } from "@/modules/conversation/channels";
import { sendMessage, toggleReaction } from "@/modules/conversation/messages";
import { createPage } from "@/modules/pages/service";
import { createProject } from "@/modules/projects/service";

/**
 * A project under way for the demo: an association planning its summer
 * festival, written through the ordinary services, so what a visitor sees is
 * exactly what the product does with real rows. Facade is about other people,
 * so two made-up colleagues are in the room: members who cannot log in, the
 * same trick as an agent (docs/adr/0015), and gone with the demo.
 */

type L = "da" | "en";

const TEXT = {
  da: {
    general: "generelt",
    anna: "Anna Holm",
    jonas: "Jonas Berg",
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

## Prøv selv

Skriv / på en tom linje for at vælge, og @ for at nævne Anna eller Jonas. Åbn siden i to vinduer, og se bogstaverne komme.`,
    budget: "Budget",
    budgetBody: `| Post | Kroner |
| --- | --- |
| Telt | 6.500 |
| Band | 8.000 |
| Mad | 12.000 |`,
    music: "Musik",
    musicBody: "Bandet spiller fra 20 til 22. Vi mangler en plan for lyd efter klokken 22.",
    welcome: "Velkommen til! Vi er i gang med sommerfesten, så kig bare med.",
    tent: "Hvem tager sig af teltet? Det skal bestilles inden fredag.",
    tentReply: "Jeg ringer til udlejeren i morgen.",
    ask: (you: string) => `Kan du kigge på budgettet, ${you}? Vi mangler at beslutte teltet.`,
    comment: "Skal der ikke stå noget om regnvejr her?",
    commentReply: "God pointe. Teltet dækker 80, så vi skal bruge et større.",
  },
  en: {
    general: "general",
    anna: "Anna Holm",
    jonas: "Jonas Berg",
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

## Try it

Type / on an empty line to choose, and @ to mention Anna or Jonas. Open the page in two windows and watch the letters arrive.`,
    budget: "Budget",
    budgetBody: `| Item | Kroner |
| --- | --- |
| Tent | 6,500 |
| Band | 8,000 |
| Food | 12,000 |`,
    music: "Music",
    musicBody: "The band plays from 8 to 10. We still need a plan for sound after 10.",
    welcome: "Welcome! We are in the middle of the summer party, so have a look around.",
    tent: "Who is taking the tent? It has to be ordered by Friday.",
    tentReply: "I'll call the rental place tomorrow.",
    ask: (you: string) =>
      `Could you look at the budget, ${you}? We still have to decide on the tent.`,
    comment: "Shouldn't it say something about rain here?",
    commentReply: "Good point. The tent covers 80, so we need a bigger one.",
  },
} as const;

async function colleague(orgId: string, name: string): Promise<OrgContext> {
  const userId = randomUUID();
  await authDb.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, name, email: `${userId}@demo.facade.invalid` });
    await tx
      .insert(memberships)
      .values({ id: randomUUID(), organizationId: orgId, userId, role: "member" });
  });
  return { orgId, userId };
}

export async function seedDemoWorkspace(
  ctx: OrgContext,
  locale: L,
  visitor: string,
): Promise<void> {
  const t = TEXT[locale];
  const anna = await colleague(ctx.orgId, t.anna);
  const jonas = await colleague(ctx.orgId, t.jonas);
  await ensureGeneralChannel(ctx, t.general);

  const { id: projectId, channelId } = await createProject(anna, {
    name: t.project,
    description: t.description,
    icon: "",
  });
  const plan = await createPage(anna, {
    projectId,
    parentId: null,
    title: t.plan,
    markdown: t.planBody,
  });
  await createPage(jonas, {
    projectId,
    parentId: plan.id,
    title: t.budget,
    markdown: t.budgetBody,
  });
  await createPage(anna, {
    projectId,
    parentId: plan.id,
    title: t.music,
    markdown: t.musicBody,
  });

  const say = (who: OrgContext, channel: string, body: string, parentId: string | null = null) =>
    sendMessage(who, { channelId: channel, parentId, body, fileIds: [] });

  const welcome = await say(anna, channelId, t.welcome);
  await toggleReaction(jonas, { messageId: welcome.id, emoji: "🎉" });
  const tent = await say(anna, channelId, t.tent);
  await say(jonas, channelId, t.tentReply, tent.id);
  await toggleReaction(anna, { messageId: tent.id, emoji: "👍" });
  await say(jonas, channelId, t.ask(`@[${visitor}](${ctx.userId})`));

  const talk = await pageChannelId(anna, plan.id);
  const comment = await say(jonas, talk, t.comment);
  await say(anna, talk, t.commentReply, comment.id);
}
