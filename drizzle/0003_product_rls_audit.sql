-- Security for the product tables: grants, forced row-level security, audit
-- triggers, and the one privileged operation the application role is
-- allowed: deleting a whole workspace. See docs/adr/0002, 0003 and 0011.

-- The tree and the threads hang on themselves. Written here rather than in
-- the schema because a self-reference there costs a type annotation on
-- every column around it.
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_fk"
  FOREIGN KEY ("parent_id") REFERENCES "pages"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_fk"
  FOREIGN KEY ("parent_id") REFERENCES "messages"("id") ON DELETE CASCADE;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "projects", "pages", "page_documents", "page_updates", "page_versions", "files",
  "channels", "messages", "message_reactions", "channel_reads", "notifications"
TO facade_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE "page_updates_seq_seq" TO facade_app;
--> statement-breakpoint

ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "page_documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "page_documents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "page_updates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "page_updates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "page_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "page_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channels" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "message_reactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "message_reactions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channel_reads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channel_reads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- A policy cannot ask its own table: Postgres reads that as endless
-- recursion. These two answer "is that row in the active workspace" for the
-- tree and the threads, and for nothing else. SECURITY DEFINER reads past
-- RLS, so the org check sits in the function.
CREATE OR REPLACE FUNCTION app_page_in_org(p_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM pages WHERE id = p_id AND org_id = app_current_org_id())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_message_in_org(p_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM messages WHERE id = p_id AND org_id = app_current_org_id())
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_page_in_org(text), app_message_in_org(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_page_in_org(text), app_message_in_org(text) TO facade_app;
--> statement-breakpoint

-- A row that names another row must name one the caller can see. A foreign
-- key is checked as the table's owner and sees every workspace, so without
-- the EXISTS below an insert carrying this workspace's org_id and another
-- workspace's project id would pass. The subqueries run under the caller's
-- own policies and see only the active workspace.
CREATE POLICY app_tenant_projects ON "projects" FOR ALL TO facade_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_tenant_pages ON "pages" FOR ALL TO facade_app
  USING (org_id = app_current_org_id())
  WITH CHECK (
    org_id = app_current_org_id()
    AND EXISTS (SELECT 1 FROM "projects" p WHERE p.id = project_id)
    AND (parent_id IS NULL OR app_page_in_org(parent_id))
  );
--> statement-breakpoint
CREATE POLICY app_tenant_page_documents ON "page_documents" FOR ALL TO facade_app
  USING (org_id = app_current_org_id())
  WITH CHECK (
    org_id = app_current_org_id()
    AND EXISTS (SELECT 1 FROM "pages" g WHERE g.id = page_id)
  );
--> statement-breakpoint
CREATE POLICY app_tenant_page_updates ON "page_updates" FOR ALL TO facade_app
  USING (org_id = app_current_org_id())
  WITH CHECK (
    org_id = app_current_org_id()
    AND EXISTS (SELECT 1 FROM "pages" g WHERE g.id = page_id)
  );
--> statement-breakpoint
CREATE POLICY app_tenant_page_versions ON "page_versions" FOR ALL TO facade_app
  USING (org_id = app_current_org_id())
  WITH CHECK (
    org_id = app_current_org_id()
    AND EXISTS (SELECT 1 FROM "pages" g WHERE g.id = page_id)
  );
--> statement-breakpoint
CREATE POLICY app_tenant_files ON "files" FOR ALL TO facade_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_tenant_channels ON "channels" FOR ALL TO facade_app
  USING (org_id = app_current_org_id())
  WITH CHECK (
    org_id = app_current_org_id()
    AND (project_id IS NULL OR EXISTS (SELECT 1 FROM "projects" p WHERE p.id = project_id))
    AND (page_id IS NULL OR EXISTS (SELECT 1 FROM "pages" g WHERE g.id = page_id))
  );
--> statement-breakpoint
CREATE POLICY app_tenant_messages ON "messages" FOR ALL TO facade_app
  USING (org_id = app_current_org_id())
  WITH CHECK (
    org_id = app_current_org_id()
    AND EXISTS (SELECT 1 FROM "channels" c WHERE c.id = channel_id)
    AND (parent_id IS NULL OR app_message_in_org(parent_id))
  );
--> statement-breakpoint

-- Everybody reads the reactions; a person only ever adds and removes their
-- own. Reads are one's own in both directions, and so is the inbox, except
-- that writing to it is what the person who mentions you does.
CREATE POLICY app_read_message_reactions ON "message_reactions" FOR SELECT TO facade_app
  USING (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_own_message_reactions_insert ON "message_reactions" FOR INSERT TO facade_app
  WITH CHECK (
    org_id = app_current_org_id()
    AND user_id = app_current_user_id()
    AND EXISTS (SELECT 1 FROM "messages" m WHERE m.id = message_id)
  );
--> statement-breakpoint
CREATE POLICY app_own_message_reactions_delete ON "message_reactions" FOR DELETE TO facade_app
  USING (org_id = app_current_org_id() AND user_id = app_current_user_id());
--> statement-breakpoint
CREATE POLICY app_own_channel_reads ON "channel_reads" FOR ALL TO facade_app
  USING (org_id = app_current_org_id() AND user_id = app_current_user_id())
  WITH CHECK (
    org_id = app_current_org_id()
    AND user_id = app_current_user_id()
    AND EXISTS (SELECT 1 FROM "channels" c WHERE c.id = channel_id)
  );
--> statement-breakpoint
CREATE POLICY app_own_notifications_select ON "notifications" FOR SELECT TO facade_app
  USING (org_id = app_current_org_id() AND user_id = app_current_user_id());
--> statement-breakpoint
CREATE POLICY app_own_notifications_update ON "notifications" FOR UPDATE TO facade_app
  USING (org_id = app_current_org_id() AND user_id = app_current_user_id())
  WITH CHECK (org_id = app_current_org_id() AND user_id = app_current_user_id());
--> statement-breakpoint
CREATE POLICY app_own_notifications_delete ON "notifications" FOR DELETE TO facade_app
  USING (org_id = app_current_org_id() AND user_id = app_current_user_id());
--> statement-breakpoint
CREATE POLICY app_tenant_notifications_insert ON "notifications" FOR INSERT TO facade_app
  WITH CHECK (
    org_id = app_current_org_id()
    AND actor_id = app_current_user_id()
    AND EXISTS (
      SELECT 1 FROM "memberships" m
      WHERE m.organization_id = org_id AND m.user_id = "notifications".user_id
    )
  );
--> statement-breakpoint

-- The audit log records who did what, not the content itself: a document's
-- bytes would swell it past use, and a message a person deleted must not
-- live on in a table nobody can change (docs/adr/0011). Replaces the
-- foundation's list with the same list plus these.
CREATE OR REPLACE FUNCTION audit_redact(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN data IS NULL THEN NULL
    ELSE data - ARRAY[
      'password', 'token', 'secret', 'backup_codes',
      'access_token', 'refresh_token', 'id_token', 'value',
      'key_hash', 'token_hash', 'api_key_cipher',
      'state', 'bytes', 'body', 'search', 'title', 'topic', 'attachments'
    ]
  END
$$;
--> statement-breakpoint

-- Audit triggers on every table whose rows a person would ask about.
-- page_documents, page_updates, channel_reads, message_reactions and
-- notifications are technical and high-churn; the trade-off is ADR 0011,
-- and tests/rls/product-isolation.test.ts holds the list to this.
CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON "projects"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_pages
  AFTER INSERT OR UPDATE OR DELETE ON "pages"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_page_versions
  AFTER INSERT OR UPDATE OR DELETE ON "page_versions"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_files
  AFTER INSERT OR UPDATE OR DELETE ON "files"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_channels
  AFTER INSERT OR UPDATE OR DELETE ON "channels"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_messages
  AFTER INSERT OR UPDATE OR DELETE ON "messages"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint

-- Deleting a workspace: the one thing the application role may do that RLS
-- and grants would otherwise forbid, wrapped in a function that checks the
-- caller itself. Dogma 3 says everything a workspace owns can be deleted
-- again completely, and that includes the audit rows about it. The
-- append-only guard is stepped around for exactly this transaction, and
-- one context-free row records that the deletion happened.
--
-- The owner check raises with ERRCODE 42501 (insufficient_privilege), which
-- is what src/modules/export/workspace.ts matches; the wording is free to
-- change. The active-workspace check keeps plpgsql's default P0001 on
-- purpose: it is a backstop against a call the application cannot make.
CREATE OR REPLACE FUNCTION delete_workspace(p_org_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user text := nullif(current_setting('app.user_id', true), '');
  v_role text;
BEGIN
  IF p_org_id IS NULL OR p_org_id <> nullif(current_setting('app.org_id', true), '') THEN
    RAISE EXCEPTION 'delete_workspace: not the active workspace';
  END IF;
  SELECT role INTO v_role FROM memberships WHERE organization_id = p_org_id AND user_id = v_user;
  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'delete_workspace: only the workspace owner may delete it'
      USING ERRCODE = '42501';
  END IF;

  -- Domain rows, memberships and invitations follow the organization
  -- through cascading foreign keys; their audit rows are written by the
  -- triggers on the way out and purged just below.
  DELETE FROM organizations WHERE id = p_org_id;

  PERFORM set_config('session_replication_role', 'replica', true);
  DELETE FROM audit_log WHERE org_id = p_org_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  INSERT INTO audit_log (org_id, actor_user_id, actor_type, action, entity_type, entity_id)
  VALUES (NULL, v_user, 'user', 'workspace.deleted', 'organizations', p_org_id);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION delete_workspace(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION delete_workspace(text) TO facade_app;
