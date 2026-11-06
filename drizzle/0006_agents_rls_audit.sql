-- Security for agent keys (docs/adr/0015). The application role manages them
-- inside a workspace. The auth role finds one by its hash, because a request
-- with a key has no workspace yet: the same reason it reads sessions.
GRANT SELECT, INSERT, UPDATE, DELETE ON "agent_tokens" TO facade_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON "agent_tokens" TO facade_auth;
--> statement-breakpoint
ALTER TABLE "agent_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_tokens" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_tenant_agent_tokens ON "agent_tokens" FOR ALL TO facade_app
  USING (org_id = app_current_org_id())
  WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY auth_read_agent_tokens ON "agent_tokens" FOR SELECT TO facade_auth USING (true);
--> statement-breakpoint
CREATE POLICY auth_touch_agent_tokens ON "agent_tokens" FOR UPDATE TO facade_auth
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Who made a key, who revoked it. Not every use: last_used_at would write a
-- row per call.
CREATE TRIGGER audit_agent_tokens
  AFTER INSERT OR DELETE OR UPDATE OF revoked_at, access ON "agent_tokens"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint

-- An agent belongs to one workspace and goes with it. Replaces the function
-- from 0003 with the same function plus the first DELETE.
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

  DELETE FROM users WHERE id IN (SELECT user_id FROM agent_tokens WHERE org_id = p_org_id);

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
