# ADR 0012: One stream per tab, in one process

Status: accepted · Date: 2026-11-05

## Context

Writing together, chat and presence all need the server to speak first.
The obvious tool is a WebSocket, but Next's standalone server has no place for
one: it would take a custom server or a second process and port, and the
family's rule is one app, behind one proxy.

## Decision

Server-Sent Events from an ordinary route (`/api/live`), one stream per tab,
and plain POSTs the other way. Edits travel as binary bodies to a route rather
than through server actions, which cannot carry bytes and run one at a time.
The latency of a POST is well under what a person notices between keystrokes,
and edits are batched for 120 ms.

`modules/live/hub.ts` holds the connections in memory, each bound to one
person in one workspace when it opens. An event is addressed to a workspace, a
page or a person. The stream tells a browser that something happened; the
database stays the truth, and a browser reads again after every reconnect.
A stream re-checks session and membership every 30 seconds.

In the browser a failed send stays queued, in order, and is retried; on leaving
the page what is queued goes out on a request the browser finishes after the
tab is gone.

## Alternatives rejected

- **A WebSocket server beside the app.** A second process to deploy, proxy,
  authenticate and keep in step, for latency nobody can feel here.
- **Postgres LISTEN/NOTIFY as the bus.** It is the way to several processes,
  and a held connection plus an 8 kB payload ceiling to buy nothing with one.
  The hub is one small file with five call sites, so it is the place to change.
- **Polling.** Cursors at a poll interval are not a colleague on the page.

## Trade-offs accepted

- **One process is the installation.** Two app containers would each see half
  a workspace. The same is true of the rate limiter, and it is said out loud.
- **A deploy drops every stream.** Browsers reconnect by themselves and read
  again, and unsent edits wait in their queue.
- **On plain HTTP/1.1 a browser allows six connections per origin,** so six
  tabs would starve each other. Behind the proxy it is HTTP/2.
- **A removed member can listen for up to 30 seconds.**
- **The name on a cursor is the browser's own claim.** Who is on a page comes
  from the hub and can be trusted; the label riding on a cursor cannot.
