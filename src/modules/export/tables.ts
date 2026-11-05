/**
 * What a full export contains, and what it deliberately leaves out.
 *
 * The list is written by hand rather than derived from the schema, because
 * "everything in the database" is the wrong answer twice over: it would
 * carry secrets out of the system, and it would silently start including
 * whatever table someone adds next. A new table appears in the export when
 * a person decides it should, which is the same discipline the tenancy
 * checklist asks for.
 *
 * Order matters: it is the order of the tabs in the spreadsheet, and it
 * runs from the things a person recognizes (the projects and their pages) toward the
 * technical ones (audit trail).
 */

export type ExportTable = {
  /** Database table, from this fixed list and never from user input. */
  table: string;
  /** Tab name in the spreadsheet, and key in the JSON export. */
  sheet: string;
  /** Columns never written out, whatever they contain. */
  redact?: string[];
  /** Column to sort by; falls back to the primary key's insertion order. */
  orderBy?: string;
};

export const EXPORT_TABLES: ExportTable[] = [
  { table: "projects", sheet: "Projekter", orderBy: "sort" },
  { table: "pages", sheet: "Sider", orderBy: "project_id, sort" },
  { table: "page_documents", sheet: "Sidetekster", redact: ["state", "search"] },
  { table: "channels", sheet: "Kanaler", orderBy: "created_at" },
  { table: "messages", sheet: "Beskeder", redact: ["search"], orderBy: "created_at" },
  { table: "message_reactions", sheet: "Reaktioner", orderBy: "created_at" },
  { table: "files", sheet: "Filer", redact: ["bytes"], orderBy: "created_at" },
  { table: "audit_log", sheet: "Revisionsspor", orderBy: "created_at" },
];

/**
 * Left out on purpose:
 *
 * - `page_updates`: edits not yet folded into the document; the text in
 *   `page_documents` and the Markdown export are what a person reads.
 * - `page_versions`: Yjs bytes that mean nothing outside this application.
 * - `channel_reads` and `notifications`: one person's place in the reading.
 * - `ai_calls`: a counter for rate limiting, not something a workspace owns.
 * - `workspace_llm_settings`: the model choice, which holds an encrypted
 *   key; a workspace that leaves gets its data, not its secrets.
 * - Everything Better Auth owns (users, sessions, accounts, passkeys, two
 *   factors, rate limits). Sessions and passkeys are credentials, and the
 *   people are exported as members below rather than as auth rows.
 * - `access_requests` and `access_invitations`: they belong to the
 *   installation, not to any workspace, and describe people who are not
 *   users of it. The application role cannot read them anyway.
 */
export const MEMBERS_SHEET = "Brugere";
