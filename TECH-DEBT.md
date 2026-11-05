# Tech debt

What we know is not right yet, why it is not right, and what fixing it
would take. A debt item is written down when it is discovered and moved
to **Paid** when it is done — an item nobody can find is an item nobody
pays.

CLAUDE.md's ways of working point at this file; this is it.

Opened at wave 0, September 2026, when the foundation was taken from
Makker and the product did not yet exist, and brought up to date at the
end of wave 3. What is here was inherited with
the foundation, checked against this repository's code, and kept only
where it still applies. **Check an item against the code before acting
on it.** A debt file that is trusted without being checked is worse than
no file.

Three kinds of item live here, and they are kept apart on purpose. What
is **open** is wrong and worth fixing. What is **accepted** is a
boundary we chose, written down so nobody re-discovers it as a bug. What
is **waiting for real use** is a product question we refuse to answer
from the armchair (dogma seven).

## Open

### Files over 300 lines

One responsibility per file and no file over roughly 300 lines. Five
inherited files are over it, and one of Facade's:

| lines | file                                                           | the seam                                             |
| ----- | -------------------------------------------------------------- | ---------------------------------------------------- |
| 377   | `modules/demo/seed-data.ts`                                    | data only: the portfolio, the quarters, the words    |
| 371   | `tests/access/admission.test.ts`                               | the application, the invitation, the registration    |
| 366   | `tests/rls/tenant-isolation.test.ts`                           | the roles' reach vs. the coverage meta-tests         |
| 332   | `app/[locale]/(app)/(narrow)/settings/access/access-admin.tsx` | the applications list vs. the invitation form        |
| 318   | `core/access/service.ts`                                       | applications vs. invitations                         |
| 304   | `core/db/schema/foundation.ts`                                 | Better Auth's tables vs. the audit log and admission |

The inherited ones are the family's; a split there is better made once
and carried across. The seed data is a list of Danish and English
sentences, and splitting it would only scatter the demo's story.

### The inherited ADRs speak of flows and conversations

ADR 0002 to 0009 came with the foundation and were written for Domino
and Makker. Where they explain the foundation — tenancy, audit,
admission, demos, the workspace's model, the tokens, the AI door and
roof — they hold here word for word. Where an example names a flow, a
brick, a run or a conversation, it is a sibling's example. Each carries a
line at the top saying so.

### The streaming half of the adapter is unused

`src/core/llm` has `stream()` beside `complete()`, and `streamAnswer` in
`src/modules/ai/service.ts` wraps it. Facade asks for JSON only. It stays
because the adapter is the family's and is kept in step across the
tools; it is tested and costs nothing but lines.

### Rewriting the order is a query per moved row

`src/modules/portfolio/ranking.ts` rewrites ranks as 1..n and updates
only the rows whose rank changed, one statement each. For a backlog of
the size Facade is for (tens, a few hundred) that is nothing. A portfolio
with thousands of open initiatives would want one `UPDATE … FROM
(VALUES …)`.

### The roadmap reads every deliverable

`src/modules/planning/roadmap-service.ts` loads all of the workspace's
deliverables and filters them in memory, rather than joining on the
plan items in range. Fine for years of quarters in a small organization;
a join is the fix when it is not.

## Accepted, with the reason written down

### The content policy still allows inline scripts

`next.config.ts` sends a Content-Security-Policy, and it blocks
everything Facade never uses: no external scripts, no framing, no
`<base>`, no form posting off-site. But `script-src` keeps
`'unsafe-inline'`, because Next.js writes its own bootstrap inline and
next-themes writes the one that sets the theme before first paint.

Closing it means a per-request nonce, set on the _request_ headers in
`src/proxy.ts` so Next stamps it onto its own scripts — and composed with
`next-intl`'s middleware, which builds its own response and will not
carry modified request headers by itself. It also forces every page to
render dynamically, which `src/app/[locale]/layout.tsx` currently avoids
with `generateStaticParams` and `setRequestLocale`.

That is a real trade with a real cost. It deserves its own change, with a
test, not a line in a hardening pass.

### Rate limiting is per process

`src/core/rate-limit.ts` counts in memory, which is correct for one
container behind one proxy and says so. An installation scaled to several
instances gets a limit per instance rather than a limit. The file is
written so that it is the only one to replace; the call sites do not
change.

### The workspace model key is bound to its workspace, but old ciphertexts are not

`src/core/crypto/secret-box.ts` seals as `v2` with the workspace id as
additional authenticated data, so a stored key only opens for the
workspace it was stored for. `v1` values are still read, without that
binding, for installations upgraded from an older foundation. Facade has
never written a `v1` value; the read path can go the day the family's
other tools no longer need it.

### The date helpers are wider than the product

`src/core/dates.ts` carries week numbers, plan-date arithmetic and three
formatters, all inherited and all tested. Facade uses the date and stamp
formatters and none of the week arithmetic. The rest stays because it is the family's one calendar; it
costs nothing while it waits.

## Waiting for real use

### Unfinished deliverables do not carry over

When a quarter closes, what was not done stays in it. The next quarter's
plan takes the initiative in again and the deliverables are written
anew (ADR 0011). A "carry the unfinished ones over" button is easy to
build and hard to get right — which ones, with how many days left — and
the answer should come from a real quarter's close.

### Four scores, equal weight, 1–5

WSJF and value/effort on four coarse scales (ADR 0012). Whether a
portfolio wants weights, a fifth axis (strategic fit) or finer scales is
a question for the first real prioritization meeting.

### Capacity in person-days per team

No hours, no people, no FTE (ADR 0011). If real planning keeps
converting in the margin, a unit per workspace is the likeliest next
step.

### Nobody is told anything

No mail, no notifications: status that goes stale shows on the
overview, and that is all. Whether owners need a nudge is for real use to
say.

### Sixty calls an hour per person

The AI ceilings (ADR 0009) were set for Tavle's cards and kept as
inherited. Facade's calls are rarer and larger; the numbers should be
reset from what a real quarter uses.

## Paid

Nothing yet.
