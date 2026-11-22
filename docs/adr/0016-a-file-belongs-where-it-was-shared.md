# ADR 0016: A file belongs where it was shared

Status: accepted · Date: 2026-11-22

## Decision

A project has a list of its files: everything placed on one of its pages or
sent in one of its conversations, newest first, with who shared it and a link
to where it belongs. There is no folder, no file tree and no second way to
store a file: the list is a view over what was already shared.

`files` gets three nullable columns, `project_id`, `page_id` and `message_id`,
written once, the first time a file lands somewhere. A message writes them when
it is sent. A page writes them when it is created with content and every time
it settles, from the links in its document (`filesOf` in
`modules/pages/document.ts`). A file that is already placed keeps its place,
so a picture copied from one page to the next still belongs to the first. A
file uploaded and never sent has no place, and no project shows it.

Sharing from the list itself sends a message with the files in the project's
channel. A shared file is then a message like any other, and the talk, the
inbox and search see it with nothing new (ADR 0010).

The policy on `files` checks that each of the three ids is in the active
workspace, the way `channels` checks its own. The migration places the files
shared before the columns existed: messages by their attachments, pages by
finding the link in the document's Yjs state, where it is plain UTF-8.

## Trade-offs accepted

- **A file stays listed after it is taken off a page.** The page's history can
  bring it back, so the file is still part of the project. Only deleting the
  message it was sent in, or deleting the page from the trash, removes it.
- **A page's files are known once it settles.** A picture dropped on a page
  shows up in the list a few seconds later, not at the upload.
- **The first place wins.** A file reused in another project is listed only
  where it was shared first.
- **No delete from the list.** A person can remove a file by deleting the
  message it came with; deleting a file on its own, and what that does to the
  pages that show it, is a decision of its own.
- **Still 10 MB a file, in Postgres.** Game assets and builds may want more.
  Raising the limit or moving bytes out of the database needs its own ADR.
