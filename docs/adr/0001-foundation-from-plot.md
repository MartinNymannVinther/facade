# ADR 0001: Facade becomes a Haij app on a copy of the Makker foundation

Status: accepted · Date: 2026-09-24

## Context

Facade is portfolio management for small and mid-sized organizations: the
development initiatives an organization could take on, described well
enough to be weighed, ordered in one backlog, planned quarter by quarter
against the capacity the teams have free, and shown on a roadmap. haij.dk
already names the tool as coming ("Portefølje"): a portfolio tool built
for and used at one customer, to be made generic before it goes in the
window. Facade is the generic one, started from a clean repository.

The family has a foundation proven five times over. Haij built it —
Better Auth with passkeys and TOTP, organizations with Postgres RLS
enforced through two confined database roles, an append-only audit log
written by triggers, admission by application and invitation, CI with
dependency audit and secrets scanning, Docker Compose deployed through
Coolify, the 2a design system. Ajour, Tavle, Domino and Makker each took
a copy of the one before and hardened it. Makker's (commit `54008b3`) is
the newest.

## Decision

Facade is a Next.js application on a copy of Makker's foundation, taken at
Makker commit `54008b3` with `git archive` and adapted: the same stack
(Next.js 16, Postgres 16, Drizzle, Better Auth, Tailwind + shadcn/ui,
next-intl, pnpm, Vitest), the same tenancy model, the same audit model,
the same admission model, the same demo mechanics, the same
workspace-chosen models, the same design tokens and shell, the same AI
door and roof, the same CI gates and deployment shape.

Every Makker-specific module is removed rather than disabled: the
conversation and its streaming route, files, the library of prompt,
roles and tasks, the Word and PowerPoint export, the browser's PII
filter. Their migrations are removed too; Facade's own start at 0002 on top
of the untouched foundation migrations 0000 and 0001. The streaming half
of the LLM adapter stays, unused, because the adapter is the family's
and the siblings keep it in step.

The runtime roles are `facade_app` and `facade_auth`, the environment
variables `FACADE_*`, the cookie `facade-sidebar`, the dev database port 5436
(Haij 5432, Tavle 5433, Domino 5434, Makker 5435), so the family's tools
can share one Postgres cluster, one machine and one browser without
colliding.

The name is Facade, the folder the tool was started in. haij.dk's coming
entry reads "Portefølje"; the tool card (docs/haij-tool-card.md) proposes
the change, and it is Martin's to make in the site's repository.

## Alternatives rejected

- **Copy Tavle instead.** Tavle is closest in domain — a backlog, a
  roadmap, releases — and would have brought more product code along.
  But it is also the largest sibling and carries eleven concepts Facade does
  not want; removing a product is harder than removing a chat, and
  Makker's foundation is newer.
- **A module inside Tavle.** A portfolio is not a team's board. The
  people at the door are different (a portfolio board and a leadership
  team, not a scrum team), and the unit of planning is the quarter and
  the team's capacity, not the sprint and the card. Sharing a repository
  would make the smaller product bend to the larger.
- **Port the customer's tool.** It was built for one organization's
  words and one organization's process. Generic means starting from the
  concepts, not from the screens.

## Trade-offs accepted

- **Six copies of the foundation.** A fix in any sibling's auth, tenancy
  or audit code does not reach Facade by itself. Bounded, as before, by
  keeping the copied code unchanged where possible and naming the commit
  it came from.
- **Six accounts for one person.** A shared identity across the family is
  a later decision that must not be forced by a shortcut.
