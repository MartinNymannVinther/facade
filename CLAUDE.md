# CLAUDE.md — Facade

Facade (facade.haij.dk) is an open source shared place for a small team:
projects with pages written on together, and the conversation right beside
them. A small Notion and a small Slack in one house. It is one tool in the
Haij family (haij.dk) and stands on the Haij foundation, taken by way of
Ajour, Tavle, Domino, Makker and Plot. This file is the project
constitution: read it fully at the start of every session. The
non-negotiables below override any default you would otherwise pick.

## The Haij dogmas (family rules, non-negotiable)

The seven dogmas are written in Danish, in the family's own words, in
README.md. Quote them verbatim; never rephrase them. What they bind this
codebase to:

1. **Real open source.** AGPL-3.0. Everything that runs on facade.haij.dk
   can be cloned and run elsewhere or locally, 1:1. No feature exists only
   on the hosted instance. The repository is private until Martin opens it.
2. **Self-hosting.** Runs on one server with Docker Compose, one Postgres
   and a local language model through Ollama, without a single cloud key.
   The test: cut the internet, and everything essential still works.
3. **Your data, always.** Everything a workspace owns can be exported with
   one click in open formats (Markdown with files, spreadsheet, JSON) and
   deleted again completely.
4. **EU or self-hosted.** Hosted, everything lives with EU-owned providers
   on EU soil, language models included, and `docs/subprocessors.md` says
   who can see what.
5. **The AI helps, the human decides.** The AI may propose text, but nothing
   reaches a page without a person saying yes, it never sends anything out
   of the house and never deletes. What a page or a message says is data,
   never instructions.
6. **Secure from day one.** Workspaces are separated in the database
   (Postgres RLS) with a test proving it, every change a person would ask
   about lands in an audit log that cannot be edited (ADR 0011 names the
   exceptions), passkeys and TOTP from the start, a public way to report
   vulnerabilities, and never a secret in the code.
7. **Used for real.** Nothing goes in the window before it has run real
   work. Facade's first real work is the development of Ukendt.

## Product principles

- **The omissions are the product.** Pages, channels, an inbox. No
  databases, no boards, no calendars, no private messages (ADR 0013): Tavle
  is the board, and each of the others is a later decision.
- **A word typed is a word kept.** Nothing may ever be lost: not in a race
  between two writers, not on a dropped connection, not in a closing tab.
  The test in `e2e/` is the promise; a change that makes it flaky is wrong.
- **One document (ADR 0011).** A page is one Yjs document. Search, export,
  import, history and the AI all read that same document on the server
  through `src/modules/pages/document.ts`, never a second copy of the text.
- **The talk belongs next to the work.** A page's conversation is an
  ordinary channel, so a comment and a chat message are one mechanism.
- **Calm, and a page is paper.** Haij 2a, dense like a tool. The one
  signature is colleagues' cursors on the page: the only hue beyond moss.
  Everything that can be dragged also works without a drag.
- **Danish interface**, English available; code, comments and docs in
  English.

## Architecture (decided — change only via a new ADR)

- Next.js 16 (App Router), TypeScript strict. One app, one database.
- Postgres 16+ with Drizzle ORM. Migrations checked in; hand-written SQL
  for roles, RLS and triggers.
- Multi-tenancy: single database, `org_id` on every domain table, RLS
  enforced for the application role. The organization is what the UI calls a
  workspace ("arbejdsrum"). Every domain query goes through
  `withOrgContext()`.
- Auth: Better Auth (pinned at 1.7.1, see pnpm-workspace.yaml) with
  organizations, passkeys and TOTP. Registration closed by default; a
  colleague joins by workspace invitation. Session cookies: Secure,
  HttpOnly, SameSite=Lax.
- UI: Tailwind + shadcn/ui with the Haij 2a tokens. next-intl with `da`
  default and `en` under `/en`. Timezone Europe/Copenhagen.
- Editor: Tiptap on Yjs. `modules/pages/extensions.ts` is the one list of
  what a page can hold, shared by the browser and the server.
- Live (ADR 0012): one Server-Sent Events stream per tab, an in-memory hub,
  edits as binary POSTs. No WebSocket, no custom server, no second port.
  One process is the installation, like the rate limiter.
- Files: in Postgres (`files.bytes`), never on disk; 10 MB each.
- AI: all model access through `src/core/llm`; proposals on their own
  routes (ADR 0008), under the roof (ADR 0009). Without a model the buttons
  are gone and everything else works.
- Deployment: Docker Compose via Coolify on an EU VPS. No US cloud.
- Layout: shared kernel in `src/core`; the product in
  `src/modules/{projects,pages,live,conversation,files,search,ai,demo,export}`
  behind services that take an `OrgContext`; pages in `src/app/[locale]`,
  components in `src/components/{live,nav,page,conversation,search}`.
- Trade-off accepted: the foundation is a copy, not a shared package (ADR
  0001).

## Security rules

- Every new table ships with `org_id`, forced RLS, an isolation test and an
  audit trigger, or a named place on the exceptions list in
  `tests/rls/tenant-isolation.test.ts` with the reason.
- Words stay out of the audit log: `audit_redact` removes bodies and bytes.
- Every action and route resolves the caller first and validates every id it
  receives. Never trust an id from the client. A route that changes state
  asks `crossSite()` first.
- Edits are data too: an update is validated, capped and rate limited
  before it is stored, and awareness is only relayed from a stream already
  proven to be on that page.
- An event is addressed to a workspace, a page in it or a person in it, and
  a stream re-checks session and membership while it lives.
- Uploaded files: raster images inline, everything else a download, always
  sandboxed and nosniff. Links on a page are limited to safe schemes.
- The AI surface: content is fenced as data, read by the server rather than
  taken from the browser, and the answer validated before it is shown.
- GDPR by design: per-workspace export and deletion, EU-only subprocessors.

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
    tests are green — main is what gets deployed.

## Roadmap

- 1.0 (done): the foundation from Plot (ADR 0001), projects and pages,
  writing together, channels and threads, the conversation on a page, inbox,
  search, history, trash, the AI's proposals, export and import, the demo.
- Before the window on haij.dk: dogma seven, real work between real people.
- Later, each as its own decision: private channels and direct messages,
  mail for what waits in the inbox, a page shared outside the workspace,
  several app processes (Postgres LISTEN/NOTIFY behind the hub).
