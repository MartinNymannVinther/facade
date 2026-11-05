# ADR 0011: A page is one Yjs document, and a keystroke is not an audit event

Status: accepted · Date: 2026-11-05

## Context

People must be able to write in the same sentence at the same moment without
one overwriting the other. Locks and last-write-wins cannot give that; a CRDT
does, and Yjs is the one with a mature ProseMirror binding.

## Decision

A page's words are a Yjs document. Every edit is appended to `page_updates`
and relayed to whoever has the page open. Shortly after the typing stops the
page is _settled_: the log is folded into `page_documents`, its plain text is
read out for search, new mentions become notifications, and at most every
ten minutes a row lands in `page_versions`.

The document and its log are read in one statement, so a settle running
beside a reader cannot have moved updates out of what it sees. A settle
deletes exactly the rows it read, so an edit arriving meanwhile stays in the
log. Nothing depends on a settle happening: an unsettled log is still the page.

Everything that reads a page reads this document on the server, through
`modules/pages/document.ts` and one shared list of extensions: search,
Markdown export and import, the AI. Restoring a version is done in the browser
as an ordinary edit, so a colleague writing right now sees it land and it can
be undone; there is no second write path.

## The audit log

The family's rule is an audit trigger on every table. Followed here it would
write a row per keystroke, each holding the document. So:

- `page_updates`, `page_documents`, `message_reactions`, `channel_reads` and
  `notifications` carry no trigger. They are named on the exceptions list in
  the meta-test, with this reason.
- `page_versions` is the row the log follows: who changed a page, at the
  grain a person asks about it.
- `audit_redact` also removes `state`, `bytes`, `body` and `search`, so the
  append-only log never keeps the words of a message somebody deleted.

## Trade-offs accepted

- **The audit log says that a page changed, not what it said.** The versions
  say that, and they are kept for the last 200 per page, not for ever.
- **Yjs bytes are opaque outside this application.** Bounded by the Markdown
  export, which is the format we promise to be readable in ten years.
- **A CRDT does not delete.** A document carries its own history and grows
  with heavy editing. Nothing here garbage collects beyond what Yjs does.
- **A title is last-write-wins.** It lives on the page row, where the tree
  needs it, and two people renaming a page at once is a small problem.
