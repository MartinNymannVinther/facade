# Tech debt

What we know is not right yet, why it is not right, and what fixing it
would take. A debt item is written down when it is discovered and moved
to **Paid** when it is done — an item nobody can find is an item nobody
pays. **Check an item against the code before acting on it.**

## The inherited ADRs speak of siblings

ADR 0002 to 0009 came with the foundation. Where they name a flow, a brick, a
conversation or an initiative, it is a sibling's example.

## No mail

An invitation is a link the inviter passes on, and the inbox is only seen in
the app. A mention waits until somebody looks. Mail needs a provider on the
subprocessor list, so it is a decision of its own.

## The page document only grows

A Yjs document keeps tombstones. A page rewritten for years gets heavier
without looking longer. Fixing it means rebuilding a page's document from its
JSON at a quiet moment, which breaks undo for anybody who has it open.

## Files nobody points at

A file removed from a page or left behind by an unsent message stays in
`files`, counted against the workspace's 2 GB. Finding orphans means reading
every document.

## Filling the workspace

One member can use up the workspace's 2 GB in minutes, and there is no way to
delete a single file from the interface. At three colleagues that is a
conversation, not a threat; a larger workspace needs a quota per person.

## The Markdown export is built in memory

`exportMarkdownZip` holds every file at once on the one process. It is rate
limited and files are stored uncompressed, but a workspace near its 2 GB needs
a streaming zip.

## A bad update reaches open editors first

Reads repair a document (ADR 0011), but a browser already on the page gets the
update live and may have to reload. Comes with trusting members; a server that
inspected the merged document on every edit would close it.

## Text in the outbox

What could not be sent stays in the browser's localStorage until the server
takes it, for at most 14 days, also after signing out. On a shared computer
that is somebody's half-written paragraph.

## The sidebar redraws on the server

A new message or a moved page asks the server to draw the shell again, at most
every 300 ms. Right at this size; a large workspace would want the tree and the
unread counts in client state.

## Tests

`e2e/collaboration.mjs` needs a dev server on an empty database, so it is not
in CI, and the keyboard paths through the tree have no automated test.
