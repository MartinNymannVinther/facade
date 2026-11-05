# Contributing to Facade

Thanks for considering it. Facade is early; the most valuable contributions
are focused ones.

## Ground rules

Read [CLAUDE.md](CLAUDE.md) first — it is the project constitution and its
non-negotiables (the Haij dogmas, security by design, the human deciding
over the AI, AGPL-3.0) are not up for debate in PRs. Significant decisions
are recorded as ADRs in `docs/adr/`; if your change alters a decision, it
needs a new ADR that names the trade-off.

## Practicalities

- Node 22+, pnpm. `pnpm install`, dev database via
  `docker compose -f docker-compose.dev.yml up -d --wait`, then `pnpm db:migrate`.
- Conventional commits (`feat(scope): ...`, `fix: ...`, `test: ...`).
- Code, comments and docs in English. UI copy in Danish first
  (`messages/da.json`) with an English translation (`messages/en.json`);
  never hardcode UI strings. `poc/` is the Python proof of concept the
  product grew out of; it is a reference, never linted or run here. The
  organization is called a workspace
  ("arbejdsrum") in the UI and an organization in the code, because that
  is Better Auth's name for it.
- One responsibility per file; keep files under roughly 300 lines.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` and `pnpm test` must
  all pass; CI enforces them plus a dependency audit and secrets scan. Run
  `pnpm format` before committing anything written by a script.
- `pnpm test` drops and rebuilds the whole schema, which is how a fresh
  checkout is proven to migrate from zero. It never touches the database
  in your `.env`: every connection URL is rewritten to a `_test` sibling
  (`facade` becomes `facade_test`), created on first run, and the suite
  refuses to start if the target is not clearly a test database. Point it
  somewhere else with `TEST_MIGRATION_DATABASE_URL`,
  `TEST_APP_DATABASE_URL` and `TEST_AUTH_DATABASE_URL` — the same guard
  applies to those.

## Versions

The running app names itself in the foot of the sidebar and in full under
Indstillinger → Om, as `<version>+<commit>`: the semver from `package.json`
and the commit it was built from. Both are resolved in `next.config.ts` and
inlined at build time, because a container has no git checkout and a version
looked up at runtime is a version that can lie.

- Raise `version` in `package.json` by hand when a step is worth naming.
  Nothing else needs touching.
- Container builds must pass `FACADE_COMMIT` (and ideally `FACADE_BUILT_AT`)
  as build arguments — `.dockerignore` excludes `.git`, so without them the
  app honestly reports `unknown` rather than guessing. `docker-compose.yml`
  forwards both from the environment.
- `GET /api/version` answers the same release without a login, so a deploy
  can be verified from outside. It deliberately says nothing about _this_
  installation; `/api/health` still answers only `ok`.

## The tenancy checklist (every new table)

1. `org_id` column on every domain table, RLS **enabled and forced**, with
   policies for `facade_app` scoped by `app_current_org_id()`.
2. Least-privilege grants — nothing gets broad access by default. A table
   that holds one person's things (a conversation, its messages, its
   files) carries `user_id` too and a policy that reads it (ADR 0010),
   and its name goes into the audit log's policy (ADR 0014), or its
   audit rows are the workspace's.
3. An `audit_row_change()` trigger unless the table is technical/high-churn
   (document the exception in an ADR).
4. Isolation tests in `tests/rls/` proving workspace A cannot read or write
   workspace B's rows. The meta-test fails any table that forgets RLS, but
   write the explicit tests anyway.
5. Every server action resolves the caller's workspace first and checks
   that every id it received belongs to it.
6. Never weaken tenancy, auth or audit logging to make a feature easier.

## The AI checklist (every feature that calls a model)

1. Every feature that asks a model to do work goes through
   `src/modules/ai/service.ts`, the one door to `src/core/llm` —
   `askForJson()` for a structured answer, `streamAnswer()` for the
   conversation: it picks the workspace's provider, counts the call
   against the ceilings, bounds the wait and parses the answer. The feature says so, plainly,
   when the provider is `none` or fails, and everything else keeps
   working. There is one exception, and it should stay the only one: the
   connection test under Settings → AI
   (`src/app/[locale]/(app)/settings/ai/actions.ts`) takes the provider
   straight from `workspaceLlmProvider()`, because it tests the door
   rather than using it — a token-free health check, then one plain-text
   word back instead of JSON. It still counts its call with
   `reserveAiCall`, as the `test` kind.
2. User-written content goes into the prompt fenced as data
   (`fenceUntrusted`), never as instructions.
3. Model output that is more than a line of text — a title, a document's
   JSON — is cut to shape next to the feature that asked for it, built
   from the readers in `src/modules/ai/sanitize-helpers.ts`, before it
   is shown or laid out.
4. The AI writes nothing but its own line in the conversation. It never
   deletes, never sends, never changes the library.
5. Prompt length and call frequency have a ceiling (`src/modules/ai/limits.ts`).
6. `docs/subprocessors.md` says what the prompt contains. A feature that
   sends something new updates that page in the same PR.

## Security

Vulnerabilities go to [SECURITY.md](SECURITY.md), not the issue tracker.
