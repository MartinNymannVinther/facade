# CLAUDE.md — Facade

Facade (facade.haij.dk) is open source portfolio management for small and
mid-sized organizations: the development initiatives an organization
could take on — projects, tasks and experiments — described well enough
to be weighed, ordered in one backlog, planned quarter by quarter against
the capacity the teams have free, and shown on a roadmap nine months
ahead. It is one tool in the Haij family (haij.dk) and stands on the Haij
foundation, taken by way of Ajour, Tavle, Domino and Makker. This file is
the project constitution: read it fully at the start of every session.
The non-negotiables below override any default you would otherwise pick.

## The Haij dogmas (family rules, non-negotiable)

The seven dogmas are written in Danish, in the family's own words, in
README.md. Quote them verbatim; never rephrase them. What they bind this
codebase to:

1. **Real open source.** AGPL-3.0. Everything that runs on facade.haij.dk
   can be cloned and run elsewhere or locally, 1:1. No feature exists only
   on the hosted instance. A paid edition is fine, but it is the same code.
2. **Self-hosting.** Runs on one server with Docker Compose, one Postgres
   and a local language model through Ollama, without a single cloud key.
   Features that need an external service say so and let the rest work.
   The test: cut the internet, and everything essential still works.
3. **Your data, always.** Everything a workspace owns can be exported with
   one click in open formats (spreadsheet, JSON) and deleted again
   completely. Leaving must take a few clicks and no friction.
4. **EU or self-hosted.** Hosted, everything lives with EU-owned providers
   on EU soil, language models included, and `docs/subprocessors.md` says
   who can see what. Code lives on GitHub, which hosts code, not customer
   data.
5. **The AI helps, the human decides.** The AI may propose a description
   or a breakdown, but nothing is written without a person saying yes; it
   never sends anything out of the house, never deletes, never reorders
   the backlog and never commits a quarter. Everything a person wrote is
   data in a prompt, never instructions.
6. **Secure from day one.** Workspaces are separated in the database
   (Postgres RLS) with a test proving it, every change lands in an audit
   log that cannot be edited, passkeys and TOTP from the start, a public
   way to report vulnerabilities, and never a secret in the code.
7. **Used for real.** Nothing goes in the window before it has run real
   work. Facade runs one real quarter of a real portfolio before it is shown.

## Product principles

- **As few concepts as possible; each must earn its place.** Eight:
  initiative, goal, team, quarter plan, deliverable, status, decision and
  the portfolio settings. The backlog, the prioritization, capacity, the
  roadmap and the overview are derived views.
- **One initiative, three kinds** (ADR 0010): project, task, experiment.
  The kind changes a word, a symbol and one field, never the screens.
  One lifecycle: idea → assessed → planned → active → done, or stopped,
  or parked.
- **One backlog in one order** (ADR 0010), the same everywhere: the list,
  the prioritization, the overview and the roadmap's rows.
- **The scores propose; people order** (ADR 0012). Four 1–5 scores, a
  method per workspace (WSJF, value/effort, manual), and an order that
  only a person changes. A half-weighed initiative has no score.
- **The quarter is the rhythm** (ADR 0011). A quarter is its first day;
  its plan is draft, committed or closed; initiatives are broken into
  deliverables one team can finish; capacity is person-days per team,
  minus operations, and over-allocation is shown, never forbidden.
- **The roadmap tells planned from expected** (ADR 0014): planned quarters
  from the plans, expected quarters from the initiatives, the horizon a
  setting (default one planned and two expected — nine months).
- **Members describe and report; managers decide** (ADR 0013). Owners and
  admins order the backlog, plan quarters, set capacity, keep the
  decision log and the settings. The check lives in the service.
- **Deliberately not built in v1:** hierarchies of programmes, people as
  resources, hours or budgets in money, dependencies as a graph,
  milestones and dates inside a quarter, custom fields, notifications and
  mail, a read-only role, sharing links, integrations. The omissions are
  the product; each is a later decision, not an oversight.
- **Danish interface**, English available; code, comments and docs in
  English.

## Architecture (decided — change only via a new ADR)

- Next.js 16 (App Router), TypeScript strict. One app, one database.
- Postgres 16+ with Drizzle ORM. Migrations checked in; hand-written SQL
  for roles, RLS and triggers (`drizzle/0001`, `drizzle/0003`).
- Multi-tenancy: single database, `org_id` on every domain table, RLS
  policies enforced for the application role. The organization is what
  the UI calls a workspace ("arbejdsrum"). App code never uses a
  superuser/bypass role for domain queries; every domain query goes
  through `withOrgContext()`. A row that names another row (a goal, an
  initiative, a team, a plan item) can only name one the caller can see:
  the policies' `WITH CHECK` says so, because a foreign key alone would
  not (drizzle/0003).
- Auth: Better Auth (pinned at 1.7.1, see pnpm-workspace.yaml) with
  organizations, passkeys (WebAuthn) and TOTP. Registration closed by
  default; admission by application and invitation (a stranger gets a
  workspace) and by workspace invitation (a colleague joins an existing
  one). Session cookies: Secure, HttpOnly, SameSite=Lax.
- UI: Tailwind + shadcn/ui with the Haij 2a design tokens (warm paper,
  moss green, Archivo). One palette for the whole family. next-intl with
  `da` default (no URL prefix) and `en` under `/en`. Timezone
  Europe/Copenhagen.
- AI: all model access through `src/core/llm` (Mistral at the EU
  endpoint, Ollama for self-hosting), behind an adapter. The installation
  sets the default in `.env` and a workspace may choose its own provider,
  model and key in Settings → AI, encrypted at rest; the Ollama address
  stays with the installation (ADR 0006). The two proposals are reads on
  their own routes under `/api/ai` (ADR 0008, 0015). Without a model the
  buttons say so and everything else works.
- Deployment: Docker Compose run via Coolify on an EU VPS (Hetzner
  initially; the provider must stay replaceable). Nightly encrypted
  backups to EU object storage. No Vercel, no Neon, no US cloud.
- Layout: shared kernel (auth, tenancy, audit, llm, team, env, the
  action runner) in `src/core`; the product in
  `src/modules/{portfolio,planning,overview,assist,ai,demo,export}`
  behind services that take an `OrgContext`; server actions as
  `actions.ts` beside them, all through `runAction` (`src/core/action.ts`);
  pure logic — quarters, scores, capacity, the roadmap — in files that
  import nothing from the database, tested on their own. Pages in
  `src/app/[locale]`, components in
  `src/components/{portfolio,initiatives,prioritize,planning,roadmap,decisions,settings}`.
- Trade-off accepted: the foundation is a copy of Makker's copy of
  Domino's, Tavle's, Ajour's and Haij's, not a shared package. Six
  products, six lifecycles, one set of rules (ADR 0001).

## Security rules

- Every new table ships with `org_id`, forced RLS, an audit trigger and an
  automated test proving workspace A cannot read or write workspace B's
  rows, nor point a row at one of B's (`tests/rls/product-isolation`).
  The meta-test in `tests/rls` fails any table without forced RLS.
- Every server action resolves the caller's session and workspace first,
  validates its input with zod, and the service checks that every id it
  receives belongs to that workspace and that the caller's role allows
  the change (`src/modules/portfolio/access.ts`). Never trust an id or a
  role from the client.
- Parameterized queries only.
- Rate limiting on auth and all public endpoints, ceilings on AI calls —
  per user, per workspace and over the whole installation (ADR 0009).
  Generic auth error messages, no stack traces and nothing in a response
  that is about this installation. `GET /api/version` names the release
  without a login so a deploy can be verified; `/api/health` answers `ok`.
- The AI surface: everything a person wrote is fenced as data in every
  prompt, never as instructions; the model's answer is sanitized and
  capped before it is shown, and a team id it invents is dropped. The AI
  writes nothing; a person's press does.
- Invitation links are Better Auth invitation ids: single-purpose, bound
  to one address, expiring after 48 hours, revocable.
- GDPR by design: per-workspace export and deletion, record of
  processing, EU-only subprocessors listed in `docs/subprocessors.md`.
- `SECURITY.md` with responsible disclosure. CI runs dependency audit and
  secrets scanning on every push.

## Ways of working (how Claude Code operates here)

1. Plan first. For every wave: present the plan, the schema changes and
   the API surface, get a yes, then work independently inside that one
   wave without asking on the way. End the wave with a green build, green
   tests and a commit on main; report back briefly; wait for the next yes.
2. Vertical slices. Ship end-to-end features; keep the app deployable at
   every commit.
3. Run `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm format` after
   code changes and keep them green. Tests where they matter: RLS
   isolation including the cross-workspace references, the quarter
   arithmetic, the scores and the proposed order, capacity, the roles'
   checks in the services, the AI answers' sanitizers, the export.
4. One responsibility per file; no file over roughly 300 lines.
5. Conventional commits. Every significant decision gets an ADR in
   `docs/adr/` that names the trade-off accepted, not just the choice.
6. Never weaken tenancy, auth or audit logging to make a feature easier.
7. Never delete files without explicit approval.
8. Code, comments and docs in English. UI copy in Danish first through
   i18n (`messages/da.json`) with an English translation; never hardcode
   UI strings.
9. Ask before adding any dependency not implied by this file.
10. **Claude delivers to main; Martin delivers to production.** Pushing
    to main deploys nothing: deployment is a manual step Martin performs
    in Coolify with Auto Deploy off. Still, only push when build and
    tests are green — main is what gets deployed. Facade runs locally on
    Martin's machine until then; do not set up hosting or deploy.

## Roadmap

- Wave 0 (done): the foundation from Makker (ADR 0001), cut to what a
  portfolio needs; the ten product tables with RLS, cross-workspace
  reference checks, audit triggers and isolation tests; this file; the
  repository.
- Wave 1 (done): the portfolio — initiatives of three kinds, goals,
  scores and the three methods, the backlog's order, status and the
  decision log, with the roles' checks in the services.
- Wave 2 (done): the quarter — teams and capacity, quarter plans, plan
  items and deliverables, commit and close, and the roadmap with its
  horizon as a setting.
- Wave 3 (done): the AI's two proposals, the overview, the demo with a
  portfolio in full swing, export, help and the docs.
- Before 1.0: dogma seven — one real quarter of one real portfolio
  (docs/launch.md).
- Later, each as its own decision: carrying unfinished deliverables into
  the next quarter, a read-only role, a roadmap share link, AI summaries
  for the portfolio meeting, weights on the scores, dependencies between
  initiatives.
