# Facade

Facade ([facade.haij.dk](https://facade.haij.dk)) is open source portfolio
management for small and mid-sized organizations: the municipality's
digitalization unit, the housing association's administration, the
mid-sized company with more ideas than people. Write the development
initiatives down — projects, tasks and experiments — and describe them
well enough to be weighed against each other. Put them in one order.
Plan the quarter: take initiatives in, break them into deliverables the
teams can finish, and set them against the capacity the teams have free
once operations have taken theirs. Show the road ahead on a roadmap that
looks nine months out. Keep status and a decision log, so the portfolio
remembers what it meant.

Facade is one tool in the [Haij](https://haij.dk) family and stands on
the Haij foundation, taken by way of
[Ajour](https://github.com/MartinNymannVinther/ajour),
[Tavle](https://github.com/MartinNymannVinther/tavle),
[Domino](https://github.com/MartinNymannVinther/domino) and
[Makker](https://github.com/MartinNymannVinther/makker): Danish-first,
EU-sovereign, secure by design. The project constitution — dogmas,
principles, architecture and rules — lives in [CLAUDE.md](CLAUDE.md).
Decisions and their trade-offs live in [docs/adr](docs/adr/).

## Status

0.9, waves 0 to 3 built: the foundation from Makker (auth with passkeys
and TOTP, workspaces separated in the database, admission by invitation,
the audit log, CI, Docker), the ten product tables with isolation tests
that also prove a row cannot point into another workspace, initiatives
with scores and one backlog order, quarter plans with deliverables and
capacity, the roadmap, status and the decision log, the AI's two
proposals, the overview, the demo, export and help. Nothing here has run
a real portfolio yet. Dogma seven is what 1.0 waits for — one real
quarter — and [docs/launch.md](docs/launch.md) is the road to it.

Much of the code is written together with Claude Code, under the rules
in [CLAUDE.md](CLAUDE.md). Every change is reviewed, tested and deployed
by a person; the tests for tenancy isolation are the part of the
codebase that is trusted least to good intentions.

## What it is

**Initiatives, three kinds.** A project spans teams or quarters, a task
is one team in one quarter, an experiment tests an assumption cheaply.
All three are described the same way — problem, benefit, success
criteria, risks — and belong to at most one strategic goal.

**One backlog, one order.** Every open initiative stands in one order,
the same on every page. Each is weighed 1–5 on value, time criticality,
risk and size; the workspace chooses WSJF, value/effort or no score at
all. The scores can propose an order; a person decides it.

**The quarter.** A quarter's plan takes initiatives in with an objective
each and breaks them into deliverables, each on a team with its days.
Each team's capacity, minus operations, is what is free; the plan shows
what is allocated and who is over. The plan is a draft until it is
committed, and history once it is closed.

**The roadmap.** The planned quarters as the plans say, the expected
quarters after them as the initiatives expect, drawn differently so
nobody reads an expectation as a promise. How far it looks is a setting;
by default nine months. Grouped by goal, team or kind, and it prints.

**Status and decisions.** The person closest to the work says how it is
going, and the history stays. The decision log says what the portfolio
decided and why.

**AI that proposes.** With a model set up, the AI can sharpen an
initiative's description or propose deliverables for a quarter. It is
always a proposal a person takes or leaves. Mistral at the EU endpoint,
or Ollama on your own machine; without either, everything else works.

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
pnpm test        # RLS isolation, quarters, scores, capacity, the export, the gates
pnpm lint && pnpm typecheck
```

The tests run against the database from the compose file and never call
an AI model, so they pass offline and without keys.

Two things the first run can trip over, both of which `pnpm db:migrate`
names when they happen. The Postgres image has to be pulled and the
cluster initialised the first time, so `--wait` matters; a migrate fired
before that is done fails and leaves an empty database behind. And
Facade's dev database listens on port 5439, beside the family's other dev
databases (Haij 5432, Tavle 5433, Domino 5434, Makker 5435); if something
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
