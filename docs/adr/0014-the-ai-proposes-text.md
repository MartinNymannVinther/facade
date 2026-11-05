# ADR 0014: The AI proposes text, and a person places it

Status: accepted · Date: 2026-11-05

## Decision

Two proposals, both read-only routes under the family's door and roof (ADR 0008
and 0009): on a page (summarize, find what is missing, keep writing, make a
selection clearer) and on a channel (what happened). The server reads the page
or channel itself, fences it as data, and returns text. Nothing is written.

Placing a proposal is a person's edit in their own browser. First a version
with the reason `ai` is cut, so the history says so and can undo it. A channel
summary becomes a page only if somebody presses the button.

## Trade-offs accepted

- **Text placed from a proposal is not marked inside the document.** The
  version before it is; once it is on the page it is the person's, like
  anything else they chose to write down.
- **A page longer than the input ceiling is cut,** so the AI may not have read
  the end of a very long page.
