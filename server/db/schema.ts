import { pgEnum, pgTable, uuid, text, jsonb, timestamp, boolean, numeric, bigint, smallint, index, uniqueIndex } from 'drizzle-orm/pg-core'

// Enums
export const userRole = pgEnum('user_role', ['owner', 'admin', 'member', 'viewer'])
export const userStatus = pgEnum('user_status', ['active', 'suspended', 'invited'])
export const tenantStatus = pgEnum('tenant_status', ['active', 'paused', 'archived'])
export const provider = pgEnum('provider', ['google', 'microsoft', 'imap'])
export const processingStatus = pgEnum('processing_status', ['queued', 'processed', 'failed', 'skipped'])
export const tasklistPurpose = pgEnum('tasklist_purpose', ['personal', 'work', 'ap', 'ar', 'sales', 'support', 'ops', 'exec', 'other'])

// Base columns
export const columns = {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const tenants = pgTable(
  'tenants',
  {
    id: columns.id,
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: tenantStatus('status').notNull().default('active'),
    plan: text('plan'),
    createdAt: columns.createdAt,
    updatedAt: columns.updatedAt,
  },
  (t) => ({
    slugUnique: uniqueIndex('tenants_slug_unique').on(t.slug),
  }),
)

export const users = pgTable(
  'users',
  {
    id: columns.id,
    tenantId: columns.tenantId,
    email: text('email').notNull(),
    name: text('name'),
    role: userRole('role').notNull().default('member'),
    status: userStatus('status').notNull().default('active'),
    createdAt: columns.createdAt,
    updatedAt: columns.updatedAt,
  },
  (t) => ({
    byTenantEmail: uniqueIndex('users_tenant_email_unique').on(t.tenantId, t.email),
    byTenant: index('users_by_tenant').on(t.tenantId),
  }),
)

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: columns.id,
    tenantId: columns.tenantId,
    userId: uuid('user_id').notNull(),
    provider: provider('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshTokenEnc: text('refresh_token_enc'),
    accessTokenEnc: text('access_token_enc'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    scopes: text('scopes'),
    keyId: text('key_id'),
    createdAt: columns.createdAt,
    updatedAt: columns.updatedAt,
  },
  (t) => ({
    byProviderAccount: uniqueIndex('auth_accounts_provider_account_unique').on(t.provider, t.providerAccountId),
    byTenant: index('auth_accounts_by_tenant').on(t.tenantId),
    byUser: index('auth_accounts_by_user').on(t.userId),
  }),
)

export const mailboxes = pgTable(
  'mailboxes',
  {
    id: columns.id,
    tenantId: columns.tenantId,
    userId: uuid('user_id'),
    provider: provider('provider').notNull(),
    emailAddress: text('email_address').notNull(),
    refreshTokenEnc: text('refresh_token_enc'),
    lastHistoryId: bigint('last_history_id', { mode: 'number' }),
    watchExpiration: timestamp('watch_expiration', { withTimezone: true }),
    labelCache: jsonb('label_cache'),
    isPrimary: boolean('is_primary').notNull().default(false),
    isServiceAccount: boolean('is_service_account').notNull().default(false),
    status: text('status').notNull().default('active'),
    createdAt: columns.createdAt,
    updatedAt: columns.updatedAt,
  },
  (t) => ({
    byTenantEmail: uniqueIndex('mailboxes_tenant_email_unique').on(t.tenantId, t.emailAddress),
    byTenant: index('mailboxes_by_tenant').on(t.tenantId),
    byUser: index('mailboxes_by_user').on(t.userId),
  }),
)

export const tasklists = pgTable(
  'tasklists',
  {
    id: columns.id,
    tenantId: columns.tenantId,
    purpose: tasklistPurpose('purpose').notNull(),
    googleTasklistId: text('google_tasklist_id').notNull(),
    displayName: text('display_name'),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    createdAt: columns.createdAt,
    updatedAt: columns.updatedAt,
  },
  (t) => ({
    byTenantPurpose: uniqueIndex('tasklists_tenant_purpose_unique').on(t.tenantId, t.purpose),
    byTenantList: uniqueIndex('tasklists_tenant_list_unique').on(t.tenantId, t.googleTasklistId),
    byTenant: index('tasklists_by_tenant').on(t.tenantId),
  }),
)

export const messages = pgTable(
  'messages',
  {
    id: columns.id,
    tenantId: columns.tenantId,
    mailboxId: uuid('mailbox_id').notNull(),
    gmailMessageId: text('gmail_message_id').notNull(),
    gmailThreadId: text('gmail_thread_id'),
    labelApplied: text('label_applied'),
    confidence: numeric('confidence', { precision: 3, scale: 2 }),
    createdTaskId: text('created_task_id'),
    smsSid: text('sms_sid'),
    processingStatus: processingStatus('processing_status').notNull().default('queued'),
    idempotencyKey: text('idempotency_key'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    metadata: jsonb('metadata'),
    createdAt: columns.createdAt,
    updatedAt: columns.updatedAt,
  },
  (t) => ({
    byTenantMessage: uniqueIndex('messages_tenant_gmail_unique').on(t.tenantId, t.gmailMessageId),
    byTenantIdem: uniqueIndex('messages_tenant_idem_unique').on(t.tenantId, t.idempotencyKey),
    byStatusCreated: index('messages_by_status_created').on(t.tenantId, t.processingStatus, t.createdAt),
    byMailboxCreated: index('messages_by_mailbox_created').on(t.tenantId, t.mailboxId, t.createdAt),
  }),
)

export const routingRules = pgTable(
  'routing_rules',
  {
    id: columns.id,
    tenantId: columns.tenantId,
    mailboxId: uuid('mailbox_id'),
    threshold: numeric('threshold', { precision: 3, scale: 2 }),
    labelOverrides: jsonb('label_overrides'),
    matchers: jsonb('matchers'),
    precedence: smallint('precedence').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: columns.createdAt,
    updatedAt: columns.updatedAt,
  },
  (t) => ({ byTenant: index('routing_rules_by_tenant').on(t.tenantId) }),
)

export const onboardingSessions = pgTable(
  'onboarding_sessions',
  {
    id: columns.id,
    tenantId: columns.tenantId,
    userId: uuid('user_id').notNull(),
    status: text('status').notNull().default('in_progress'),
    step: smallint('step').notNull().default(0),
    answers: jsonb('answers'),
    inboxDescriptions: jsonb('inbox_descriptions'),
    bioSources: jsonb('bio_sources'),
    createdAt: columns.createdAt,
    updatedAt: columns.updatedAt,
  },
  (t) => ({ byTenant: index('onboarding_sessions_by_tenant').on(t.tenantId) }),
)

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    beforeFields: jsonb('before_fields'),
    afterFields: jsonb('after_fields'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byTenant: index('activity_logs_by_tenant').on(t.tenantId) }),
)


