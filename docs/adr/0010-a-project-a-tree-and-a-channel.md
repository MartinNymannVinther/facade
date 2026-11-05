# ADR 0010: A project is a tree of pages and a channel

Status: accepted · Date: 2026-11-05

## Decision

A workspace holds projects. A project holds a tree of pages of any depth and
gets a channel when it is created. A page is one row for where it hangs and
what it is called, and its words live elsewhere (ADR 0011).

Order in the tree is a floating point `sort`: a move writes one row, between
its new neighbours. Deleting is soft: a subtree goes to the trash under one
shared `deleted_at`, which is how restoring it brings back exactly what went
with it and not what was thrown away on its own before. Only a person who
asks, from the trash, deletes for real.

A page's conversation is an ordinary channel of kind `page`, made the first
time somebody opens it, so a comment is a message and needs no second
mechanism for threads, reactions, files, search or the inbox.

## Trade-offs accepted

- **Floats run out** after some fifty moves into the same gap. Nobody will
  notice at this size; rewriting a level's sort is the remedy.
- **A policy cannot ask its own table.** A page's parent and a reply's parent
  are checked by two small SECURITY DEFINER functions rather than the plain
  EXISTS every other policy uses. They answer one boolean, about the active
  workspace only, and the meta-test names them.
