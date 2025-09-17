-- Enums
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'invited');
CREATE TYPE tenant_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE provider AS ENUM ('google', 'microsoft', 'imap');
CREATE TYPE processing_status AS ENUM ('queued', 'processed', 'failed', 'skipped');
CREATE TYPE tasklist_purpose AS ENUM ('personal', 'work', 'ap', 'ar', 'sales', 'support', 'ops', 'exec', 'other');

-- Updated at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tenants
CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  status tenant_status NOT NULL DEFAULT 'active',
  plan text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tenants_slug_unique ON tenants(slug);

-- Users
CREATE TABLE users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  role user_role NOT NULL DEFAULT 'member',
  status user_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_tenant_email_unique ON users(tenant_id, email);
CREATE INDEX users_by_tenant ON users(tenant_id);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auth accounts
CREATE TABLE auth_accounts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider provider NOT NULL,
  provider_account_id text NOT NULL,
  refresh_token_enc text,
  access_token_enc text,
  token_expires_at timestamptz,
  scopes text,
  key_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auth_accounts_provider_account_unique ON auth_accounts(provider, provider_account_id);
CREATE INDEX auth_accounts_by_tenant ON auth_accounts(tenant_id);
CREATE INDEX auth_accounts_by_user ON auth_accounts(user_id);
CREATE TRIGGER auth_accounts_set_updated_at BEFORE UPDATE ON auth_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Mailboxes
CREATE TABLE mailboxes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  provider provider NOT NULL,
  email_address text NOT NULL,
  refresh_token_enc text,
  last_history_id bigint,
  watch_expiration timestamptz,
  label_cache jsonb,
  is_primary boolean NOT NULL DEFAULT false,
  is_service_account boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mailboxes_tenant_email_unique ON mailboxes(tenant_id, email_address);
CREATE INDEX mailboxes_by_tenant ON mailboxes(tenant_id);
CREATE INDEX mailboxes_by_user ON mailboxes(user_id);
CREATE TRIGGER mailboxes_set_updated_at BEFORE UPDATE ON mailboxes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tasklists
CREATE TABLE tasklists (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purpose tasklist_purpose NOT NULL,
  google_tasklist_id text NOT NULL,
  display_name text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tasklists_tenant_purpose_unique ON tasklists(tenant_id, purpose);
CREATE UNIQUE INDEX tasklists_tenant_list_unique ON tasklists(tenant_id, google_tasklist_id);
CREATE INDEX tasklists_by_tenant ON tasklists(tenant_id);
CREATE TRIGGER tasklists_set_updated_at BEFORE UPDATE ON tasklists FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Messages
CREATE TABLE messages (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mailbox_id uuid NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  label_applied text,
  confidence numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  created_task_id text,
  sms_sid text,
  processing_status processing_status NOT NULL DEFAULT 'queued',
  idempotency_key text,
  processed_at timestamptz,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messages_tenant_gmail_unique ON messages(tenant_id, gmail_message_id);
CREATE UNIQUE INDEX messages_tenant_idem_unique ON messages(tenant_id, idempotency_key);
CREATE INDEX messages_by_status_created ON messages(tenant_id, processing_status, created_at DESC);
CREATE INDEX messages_by_mailbox_created ON messages(tenant_id, mailbox_id, created_at DESC);
CREATE TRIGGER messages_set_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Routing rules
CREATE TABLE routing_rules (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mailbox_id uuid REFERENCES mailboxes(id) ON DELETE SET NULL,
  threshold numeric(3,2),
  label_overrides jsonb,
  matchers jsonb,
  precedence smallint NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX routing_rules_by_tenant ON routing_rules(tenant_id);
CREATE TRIGGER routing_rules_set_updated_at BEFORE UPDATE ON routing_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Onboarding sessions
CREATE TABLE onboarding_sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress',
  step smallint NOT NULL DEFAULT 0,
  answers jsonb,
  inbox_descriptions jsonb,
  bio_sources jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_sessions_by_tenant ON onboarding_sessions(tenant_id);
CREATE TRIGGER onboarding_sessions_set_updated_at BEFORE UPDATE ON onboarding_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Activity logs (no updated_at)
CREATE TABLE activity_logs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_fields jsonb,
  after_fields jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_by_tenant ON activity_logs(tenant_id);

-- RLS: enable globally
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Default deny
CREATE POLICY deny_all_tenants ON tenants FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_users ON users FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_auth_accounts ON auth_accounts FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_mailboxes ON mailboxes FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_tasklists ON tasklists FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_messages ON messages FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_routing_rules ON routing_rules FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_onboarding_sessions ON onboarding_sessions FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY deny_all_activity_logs ON activity_logs FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- Tenant policies
CREATE POLICY tenant_access_tenants ON tenants USING (id = current_setting('app.tenant_id')::uuid) WITH CHECK (id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_access_users ON users USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_access_auth_accounts ON auth_accounts USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_access_mailboxes ON mailboxes USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_access_tasklists ON tasklists USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_access_messages ON messages USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_access_routing_rules ON routing_rules USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_access_onboarding_sessions ON onboarding_sessions USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_access_activity_logs ON activity_logs USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Retention policy helper: Function to prune old activity_logs
CREATE OR REPLACE FUNCTION prune_activity_logs(p_retention_days integer)
RETURNS void AS $$
BEGIN
  DELETE FROM activity_logs
  WHERE created_at < (now() - make_interval(days => p_retention_days));
END;
$$ LANGUAGE plpgsql;


