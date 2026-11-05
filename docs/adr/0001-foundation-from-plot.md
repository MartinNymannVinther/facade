# ADR 0001: Facade stands on a copy of the Plot foundation

Status: accepted · Date: 2026-11-05

## Context

Facade is a small Notion and a small Slack in one: projects with pages
written on together, and channels beside them. It was asked for to work
with two colleagues on the game Ukendt, as part of the Haij family and on
the family's foundation.

The foundation has been copied five times: Haij, Ajour, Tavle, Domino,
Makker, Plot. Kadence and Kladde took theirs later but have each grown far
past it; Plot's copy (commit `964b352`) is the newest clean one, the same
reason Kadence gave for choosing it.

## Decision

Facade is a Next.js application on a copy of Plot's foundation, taken at
Plot commit `964b352` with `git archive`, so no `.env` came along. The same
stack, tenancy, audit, admission, demo mechanics, workspace-chosen models,
design tokens, AI door and roof, CI gates and deployment shape. Every
Plot-specific module was removed rather than disabled. Facade's own
migrations start at 0002 on the untouched foundation migrations 0000 and 0001.

The runtime roles are `facade_app` and `facade_auth`, the environment
variables `FACADE_*`, the cookie `facade-sidebar`, the dev database port 5439.

The name is the folder the tool was started in, and it says what the tool is
for: the work behind the facade.

## Alternatives rejected

- **Inside Ukendt.** The collaboration is about Ukendt but is not Ukendt, and
  the next project should not need a game engine to have a page.
- **Inside Tavle or Plot.** A page and a channel are not a card or an
  initiative; the concepts overlap in nothing but the foundation.
- **An existing tool.** Good ones exist. None keeps the dogmas.

## Trade-offs accepted

- **Another copy of the foundation.** A fix elsewhere does not reach Facade
  by itself. Bounded by the named commit, which makes drift reviewable.
- **A sixth account for the same person.** A shared identity stays a later
  decision.
