# ADR 0013: Everybody in a workspace reads everything

Status: accepted · Date: 2026-11-05

## Decision

Every member can read and write every project, page and channel in the
workspace. There are no private channels and no direct messages. Roles decide
who may invite and remove people, not who may read. A message can be changed
or deleted by its author alone. What is one person's is one person's in the
database too: the inbox and the read marks are held to their owner by RLS.

## Why

A team of three working on one thing does not need a permission model, and
one built early would be the most expensive thing in the product. RLS then
has one simple question to answer, and it is the one with a test behind it.

## Trade-offs accepted

- **A workspace is the unit of secrecy.** Something some members must not see
  belongs in another workspace.
- **No direct messages,** which is the one thing a person coming from Slack
  will reach for. They need a per-person policy on `channels` and `messages`
  and a new promise about who can read what, exported and audited included,
  so they are a decision of their own.
