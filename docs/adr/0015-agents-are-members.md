# ADR 0015: An agent is a member, and comes in through MCP

Status: accepted · Date: 2026-11-06 · Amends ADR 0014 and CLAUDE.md on dogma 5

## Context

A person working with an AI agent in Claude Code wants that agent to read and
write in the workspace, the way an integration can be given access to Notion.
ADR 0014 lets a model propose text for a person to place. An agent acting on
its own is a different thing, and dogma five has to be met in a different way.

## Decision

**An agent is a member who cannot log in.** A users row with no account, in
one workspace, with the role `agent`. Its name stands on what it writes, a
colleague can name it with @, and it passes through the same services and RLS
as a person. There is no second path into the data. Revoking keeps the row as
`former_agent`, so its words keep their author.

**It comes in with a key, through MCP.** Owners and admins make one under
Settings → Agents. Only the SHA-256 is stored, and the key is shown once. It
arrives as a bearer token at `/api/mcp`, which is stateless JSON-RPC over POST:
a subset of the Streamable HTTP transport, small enough to hold without the SDK
as a dependency. Finding a key is the auth role's job, as finding a session is,
because a request with a key has no workspace yet.

**What it can do is a fixed list of tools,** and a key is read-only or
read-write. Reading covers projects, pages, search, channels and its inbox.
Writing covers creating, appending to, replacing and renaming pages, and
sending messages. A read key is not offered the writing tools and is refused
them if it calls them anyway.

**Dogma five, kept this way.** The human decision moves from each sentence to
the invitation: a person chose this agent, gave it this access, and can take it
back at once. In return every write stands under the agent's name, a version
is cut before every change to a page, and the agent has no tool to delete,
invite, export or change a setting, whatever it is told. A page is written as
an ordinary Yjs update, so people on the page see it land and keep typing.

## Alternatives rejected

- **A personal access token acting as the person.** Simpler, but what the agent
  wrote would look like the person wrote it, and "everything the AI did is
  marked" would be gone.
- **Proposals only, accepted in the interface.** Truest to ADR 0014, and useless
  for an agent meant to work alongside the team.
- **The MCP SDK.** Sessions and streaming Facade does not use, for four methods.

## Trade-offs accepted

- **Dogma four does not stretch this far.** What the agent reads goes to the
  model it runs on, and for Claude Code that is Anthropic in the US. It is the
  person's own tool and not a subprocessor of Facade, but colleagues' words go
  with it. The settings page says so, and so does docs/subprocessors.md.
- **An agent can be fooled.** Pages are declared data, not instructions, but
  that is a request to a model and not a wall. The limit is what the tools allow.
  A write key can still make a mess, and the mess can be undone.
- **A key opens the whole workspace** (ADR 0013). Access per project is a later
  decision.
- **A version per write.** A chatty agent uses up the 200 kept per page quickly.
- **Messages are not undoable by anybody else.** An agent's message can only be
  edited or deleted by its author, and the agent has no tool for it. A person
  with access to the database is the remedy, for now.
