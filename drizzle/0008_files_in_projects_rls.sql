-- Where a file was shared (docs/adr/0016). The places it names must be in
-- the same workspace: replaces the policy from 0003 with the same rule plus
-- the three references, checked the way channels check theirs.
DROP POLICY app_tenant_files ON "files";
--> statement-breakpoint
CREATE POLICY app_tenant_files ON "files" FOR ALL TO facade_app
  USING (org_id = app_current_org_id())
  WITH CHECK (
    org_id = app_current_org_id()
    AND (project_id IS NULL OR EXISTS (SELECT 1 FROM "projects" p WHERE p.id = project_id))
    AND (page_id IS NULL OR EXISTS (SELECT 1 FROM "pages" g WHERE g.id = page_id))
    AND (message_id IS NULL OR EXISTS (SELECT 1 FROM "messages" m WHERE m.id = message_id))
  );
--> statement-breakpoint

-- What was shared before the columns existed. A message names its files in
-- its attachments; the first message to name one is where it went out.
UPDATE "files" f
SET message_id = s.message_id, project_id = s.project_id, page_id = s.page_id
FROM (
  SELECT DISTINCT ON (a.id) a.id, m.id AS message_id, c.project_id, c.page_id
  FROM "messages" m
  JOIN "channels" c ON c.id = m.channel_id
  CROSS JOIN LATERAL jsonb_to_recordset(m.attachments) AS a(id text)
  WHERE m.deleted_at IS NULL
  ORDER BY a.id, m.created_at
) s
WHERE f.id = s.id;
--> statement-breakpoint

-- A page holds its files as links in its Yjs state, where the link is
-- plain UTF-8: the first page whose document names a file is its place.
UPDATE "files" f
SET page_id = s.page_id, project_id = s.project_id
FROM (
  SELECT DISTINCT ON (f2.id) f2.id, g.id AS page_id, g.project_id
  FROM "files" f2
  JOIN "page_documents" d ON d.org_id = f2.org_id AND d.state IS NOT NULL
  JOIN "pages" g ON g.id = d.page_id
  WHERE f2.message_id IS NULL
    AND position(convert_to('/api/files/' || f2.id, 'UTF8') in d.state) > 0
  ORDER BY f2.id, g.created_at
) s
WHERE f.id = s.id AND f.page_id IS NULL AND f.message_id IS NULL;
