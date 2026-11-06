# Subprocessors

Per the Haij dogmas, every subprocessor must be EU-owned and EU-hosted,
and must be listed here **before** it is taken into use. This is the
public list of who can see what for the installation at facade.haij.dk. A
self-hosted Facade with `LLM_PROVIDER=ollama` or `none` has no
subprocessor at all beyond the machine it runs on.

| Subprocessor        | Purpose                                                                                                                                | Data                                                                                                                                                                      | Location                                      | Added      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------- |
| Hetzner Online GmbH | Hosting: the VPS running Docker and the database                                                                                       | Everything the installation holds                                                                                                                                         | Nuremberg, DE                                 | 2026-09-18 |
| Mistral AI          | LLM adapter: the proposals a person asks for — a sharper description of an initiative, and deliverables for an initiative in a quarter | What a prompt contains: the initiative's text, the quarter's objective for it, the names of its existing deliverables, and the workspace's team names. Written out below. | EU/EFTA data centres, via `api.eu.mistral.ai` | 2026-09-24 |

Facade sends no mail, so there is no mail provider on this list and there
will not be one without a row here first.

## What each one does and does not see

**Hetzner** hosts the machine, so it holds everything by definition: the
database, the backups on their way out, the logs. That is unavoidable for
any hosted deployment and is why the choice of provider matters and why
the exit plan in `docs/deploy.md` is a design requirement rather than a
nicety.

**Mistral** is a French company, and that is not by itself the answer to
where the data goes. Mistral runs three endpoints: `api.mistral.ai`,
`api.eu.mistral.ai` and `api.us.mistral.ai`, and they state that they do
not commit to any particular inference location for the first of them.
Facade calls the EU one, and `MISTRAL_BASE_URL` in the environment is what
decides it, so it is an installation's choice and not a workspace's. The
regional endpoints cost 1.1x list price; that is what this row costs.

Mistral receives what a prompt contains and nothing else, and only when
a person presses a button that asks for a proposal (docs/adr/0014):

- **A suggestion on a page**: the page's text and whatever is selected.
- **What happened in a channel**: the channel's latest messages with the
  names of the people who wrote them.
- **The connection test** under Settings → AI carries nothing from the
  workspace: one fixed sentence — "Svar med præcis ét ord: OK" — so that
  "configured" and "working" can be told apart.

No prompt carries an e-mail address. Names appear only where they are part of
the conversation being summarized. Nothing is sent in the background:
without a press, no call.

## A workspace can choose a different one

Since ADR 0006, a workspace may set its own provider, model and API key in
Settings → AI. Mistral is the default on facade.haij.dk and the one this
list covers, and it is what every workspace uses until it says otherwise.
A workspace that chooses differently has chosen its own processor: its
text then goes to the provider named on its own settings page, under
whatever agreement it has with them, and this list no longer describes
it. A workspace that sets the provider to "none" sends nothing to any
model at all; every AI surface says so and everything else works.

The Ollama address is not part of that choice — it belongs to the
installation — so on the hosted instance the real options are Mistral or
no model. The key a workspace stores is encrypted at rest and is never
readable from the interface; the settings page says which key is in force,
the installation's or the workspace's own.

Passwords, passkeys, session tokens, the audit log, invitation ids,
and anything belonging to another workspace are never sent. Everything a
person has written is placed in the prompt as data, never as instructions,
which is the prompt-injection defence rather than a privacy measure —
both matter, for different reasons.

## Not subprocessors, but worth naming

**An agent somebody invites.** What an agent reads through a key leaves Facade
for the model it runs on, and for Claude Code that is Anthropic in the US. The
workspace's owner or admin makes that choice under Settings → Agents, Facade does
not send anything by itself, and without a key nothing goes there (ADR 0015).

**GitHub** holds the source repository. It processes no installation
data, so it is a development dependency rather than a subprocessor, but
it is US-owned and that is worth stating plainly rather than leaving for
a reader to discover. Nothing about the installation's operation depends
on it: the deployment runs from a Docker image, and the repository can be
mirrored or moved without touching production.

**Let's Encrypt** issues the TLS certificate and therefore learns the
hostname, which is public in DNS anyway.

Adding anything to this list is a decision, not a formality. Before a new
row goes in: what data does it receive, could the feature work without
sending it, and what happens to the installation the day that provider
disappears.
