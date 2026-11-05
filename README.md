# Facade

Facade ([facade.haij.dk](https://facade.haij.dk)) is one shared place for a
small team: projects with pages you write on at the same time, and the
conversation right beside them. Think of a small Notion and a small Slack
that have agreed to live in the same house, on your own server or in the EU.

It is one tool in the Haij family ([haij.dk](https://haij.dk)) and stands on
the family's foundation, taken by way of Ajour, Tavle, Domino, Makker and
[Plot](https://github.com/MartinNymannVinther/plot): Danish-first, EU or
self-hosted, your data always yours, the AI helps and the human decides.

## Status

1.0. Everything below is built, tested and proven by a test that puts two
real browsers on one page. It has not yet carried real work between real
people; that is the first thing it is for, and dogma seven decides when it
goes in the window on haij.dk (docs/haij-tool-card.md).

## What it is

**Projects and pages.** A project holds a tree of pages as deep as you like,
and a channel of its own. Drag a page to move it, or use its menu.

**Writing together.** Several people write on one page at the same moment
and see each other's cursors. Nothing is lost when two people type in the
same sentence, when the connection drops, or when a tab closes mid-word.
Type `/` for headings, task lists, tables, images and links to other pages,
and `@` to name a colleague.

**Talking beside the work.** Channels with threads, reactions and files.
Every project has one, and every page has its own conversation next to it.

**What waits for you.** An inbox for what is aimed at you, unread marks on
channels, and who is here right now. ⌘K searches every page and message.

**Nothing is gone for good by accident.** Every page keeps its history and
can be restored; a deleted page sits in the trash with everything under it;
an archived project waits there too.

**An AI that proposes.** It can summarize a page, find what is missing, keep
writing, make a selection clearer, or catch you up on a channel. Nothing
reaches a page until a person says yes, and the history can undo it. Runs at
Mistral in the EU or on your own machine with Ollama, and without a model
everything else works.

**Your way out.** The whole workspace as Markdown with its files, as a
spreadsheet and as JSON, and a folder of Markdown goes in again with
`scripts/import-markdown.ts`.

## Haij-dogmerne

Facade lever efter familiens syv dogmer. De står her i Haijs egne ord.

1. **Ægte open source.** Al kode ligger offentligt under AGPL-3.0. Alt vi driver, kan hentes 1:1 og køres et andet sted eller lokalt, og der findes ingen funktioner der kun kan fås på haij.dk. En betalt udgave er i orden, men den bygger på den samme kode. Kloner man repoet, får man præcis det der kører på haij.dk.

2. **Egen drift.** Hvert værktøj kan køre i eget driftsmiljø på én server med Docker Compose, en Postgres og en lokal sprogmodel gennem Ollama, uden en eneste nøgle til en sky. Funktioner der forudsætter en ekstern tjeneste, som CVR-opslag eller e-faktura, siger det direkte og lader resten virke i stedet for at gå i stykker. Testen er enkel: afbryd forbindelsen til internettet, og alt væsentligt skal stadig virke.

3. **Dine data, altid.** Alt en organisation ejer kan hentes ud med ét klik i åbne formater (regneark, JSON, PDF) uden at spørge nogen, og slettes helt igen. At forlade Haij skal kunne gøres med få klik uden unødvendig friktion, og vi hjælper gerne med flytningen frem for at gøre den besværlig.

4. **EU eller egen drift.** Når vi hoster, ligger alt hos EU-ejede leverandører på EU-jord, sprogmodeller inklusive, og hvert værktøj har en offentlig liste over hvem der kan se hvad. Ingen amerikansk sky i driften. Koden ligger på GitHub, som er kodehosting og ikke kundedata; et spejl hos en europæisk forge kommer den dag det giver mening.

5. **AI'en hjælper, mennesket bestemmer.** AI må foreslå, skrive udkast og rette i planer, men aldrig sende noget ud af ”huset”, slette noget eller forpligte nogen uden at et menneske har sagt ja. Alt AI gør, kan fortrydes. Indhold hentet udefra behandles som data, aldrig som instruktioner.

6. **Sikkerhed fra første dag.** Organisationers data er adskilt i databasen, ikke kun i koden, og der skal være en test der beviser det. Alle ændringer registreres i en log der ikke kan redigeres. Passkeys og totrinslogin er der fra start, der er en offentlig vej til at melde sikkerhedshuller, og der ligger aldrig hemmeligheder i koden.

7. **Brugt i virkeligheden.** Intet af det vi selv har bygget kommer i vinduet før det har kørt rigtigt arbejde, hos os selv eller hos en kunde vi sidder tæt på. Værktøjer fra andre skal have et rigtigt brugssted vi kan pege på. Vi skal ikke have værktøjer liggende som ikke har skabt reel værdi i virkeligheden.

## Quickstart

Requirements: Node 22+, pnpm 10+ (`brew install pnpm`; newer Node builds no longer bundle corepack), Docker.

```bash
git clone https://github.com/MartinNymannVinther/facade.git && cd facade
pnpm install
cp .env.example .env                            # defaults work for local dev
docker compose -f docker-compose.dev.yml up -d --wait  # Postgres 16 + runtime roles, ready
pnpm db:migrate                                 # tables, RLS, audit triggers
pnpm dev                                        # http://localhost:3000
```

Register at `/register` — signup creates your user and your workspace —
then add a passkey under Indstillinger → Sikkerhed. Registration is closed
by default (`SIGNUP=closed`): an empty installation always lets the first
person in, the door shuts by itself once that account exists, and everyone
after that applies at `/register` and is admitted by the installation's
owner with a single-use link (Indstillinger → Adgang). Colleagues do not
apply: a member of a workspace invites them with a link from Indstillinger
→ Arbejdsrum.

```bash
pnpm test        # RLS isolation, the document, the tree, channels, the hub, the export
pnpm lint && pnpm typecheck
pnpm e2e         # two real browsers on one page, against a dev server on an empty database
```

The tests run against the database from the compose file and never call
an AI model, so they pass offline and without keys.

Two things the first run can trip over, both of which `pnpm db:migrate`
names when they happen. The Postgres image has to be pulled and the
cluster initialised the first time, so `--wait` matters; a migrate fired
before that is done fails and leaves an empty database behind. And
Facade's dev database listens on port 5439, beside the family's other dev
databases (Haij 5432, Tavle 5433, Domino 5434, Makker 5435, Plot 5436, Kladde 5437, Kadence 5438); if something
else already holds 5439, set another `POSTGRES_PORT` in `.env` and change
the three URLs to match, or the migration talks to the wrong server.

## Running it for real

[docs/launch.md](docs/launch.md) is the ordered checklist for taking an
installation live the first time, including the two steps that are painful
to get wrong: the public URL passkeys bind to, and creating the first
account before anybody else finds the address.
[docs/deploy.md](docs/deploy.md) is the deployment guide behind it: Docker
Compose on an EU VPS, with Coolify doing the plumbing. Which third parties can
see data, and what, is listed in
[docs/subprocessors.md](docs/subprocessors.md) — today that is the
hosting provider and the AI provider you choose. With `LLM_PROVIDER=ollama`
nothing leaves the server at all.

## Contributing and security

[CONTRIBUTING.md](CONTRIBUTING.md) explains how changes are made here:
plan first, vertical slices, tests where they matter, an ADR for every
decision worth arguing about later.
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) covers how we talk to each
other. Found a security problem? Please report it privately as described
in [SECURITY.md](SECURITY.md) rather than in a public issue.

What we know is not right yet is written down rather than hoped away:
[TECH-DEBT.md](TECH-DEBT.md) lists it, with the reason it is still there
and what fixing it would take.

License: [AGPL-3.0](LICENSE). The two typefaces the interface is set in ship in `public/fonts`, both under the SIL Open Font License 1.1: Archivo by the Archivo Project Authors ([OFL.txt](public/fonts/OFL.txt)) and Geist Mono by the Geist Project Authors ([OFL-Geist.txt](public/fonts/OFL-Geist.txt)). The `.woff2` files are Google Fonts' own subsets, copied in so that a build needs no network.
