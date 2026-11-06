# Changelog

## 1.1.1 — 2026-11-06

A page born with content failed in the production build: `create_page` from an
agent, a summary kept as a page, and the demo's pages. Two copies of
prosemirror-model met in one call. The browser test now writes one as an agent.

## 1.1.0 — 2026-11-06

Agents: invite an AI agent such as Claude Code as a named member, with a key and
read or read-write access, through MCP at `/api/mcp`. It cannot delete, invite
or export, and a version is kept before every change it makes (ADR 0015).

## 1.0.0 — 2026-11-05

The first version: projects and pages in a tree, several people writing on one
page at once with each other's cursors, channels with threads, reactions and
files, a conversation beside every page, an inbox, search, history, trash,
the AI's proposals, export as Markdown, spreadsheet and JSON, import of
Markdown, and a demo. On the Haij foundation, taken from Plot.
