import {
  pgTable,
  pgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Enums ───────────────────────────────────────────────────────────

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "manager",
  "operator",
  "viewer",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "active",
  "invited",
  "suspended",
]);

export const billingIntervalEnum = pgEnum("billing_interval", [
  "month",
  "year",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "open",
  "paid",
  "uncollectible",
  "void",
]);

export const nfeStatusEnum = pgEnum("nfe_status", [
  "pending",
  "processing",
  "authorized",
  "denied",
  "cancelled",
  "error",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "card",
  "pix",
  "boleto",
]);

export const webhookProviderEnum = pgEnum("webhook_provider", ["stripe"]);

export const nfeJobStatusEnum = pgEnum("nfe_job_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);

// ── Organizations (root de tenancy — ver ADR 0003) ─────────────────

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 63 }).notNull().unique(),
    cnpj: varchar("cnpj", { length: 14 }),
    billingEmail: varchar("billing_email", { length: 255 }),
    billingAddress: jsonb("billing_address").$type<{
      street?: string;
      number?: string;
      complement?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("organizations_slug_idx").on(table.slug),
  })
);

// ── Users (identidade global — ver ADR 0004) ───────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  })
);

// ── Memberships (user ↔ org com role — ver ADR 0004) ───────────────

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("operator"),
    status: membershipStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userOrgIdx: uniqueIndex("memberships_user_org_idx").on(
      table.userId,
      table.organizationId
    ),
    orgIdx: index("memberships_org_idx").on(table.organizationId),
  })
);

// ── Sessions (single-session enforcement — ver ADR 0007) ───────────

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userOrgIdx: index("sessions_user_org_idx").on(
      table.userId,
      table.organizationId
    ),
  })
);

// ── Refresh Tokens (rotação a cada uso — ver ADR 0004) ─────────────

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("refresh_tokens_token_hash_idx").on(
      table.tokenHash
    ),
    sessionIdx: index("refresh_tokens_session_idx").on(table.sessionId),
  })
);

// ── Invites (convites pendentes — ver PRODUCT.md §2.2) ─────────────

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: membershipRoleEnum("role").notNull().default("operator"),
    token: varchar("token", { length: 255 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("invites_token_idx").on(table.token),
    orgIdx: index("invites_org_idx").on(table.organizationId),
  })
);

// ── Products (catálogo dinâmico — ver ADR 0005) ────────────────────

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("products_key_idx").on(table.key),
  })
);

// ── Plans (modelo comercial — ver ADR 0006) ────────────────────────

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    billingInterval: billingIntervalEnum("billing_interval")
      .notNull()
      .default("month"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("plans_key_idx").on(table.key),
  })
);

// ── Plan Products (M:N plano ↔ produto com limites — ver ADR 0006) ─

export const planProducts = pgTable(
  "plan_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    limits: jsonb("limits").$type<Record<string, number>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    planProductIdx: uniqueIndex("plan_products_plan_product_idx").on(
      table.planId,
      table.productId
    ),
  })
);

// ── Subscriptions (org ↔ plan — ver ADR 0009) ──────────────────────

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 })
      .notNull()
      .unique(),
    status: subscriptionStatusEnum("status").notNull().default("trialing"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("subscriptions_org_idx").on(table.organizationId),
    stripeSubIdx: uniqueIndex("subscriptions_stripe_sub_idx").on(
      table.stripeSubscriptionId
    ),
    // Nota: a garantia de "no máximo uma assinatura ativa por org" (ADR 0006)
    // exige um partial unique index (WHERE status IN ('trialing','active',
    // 'past_due')), que o `drizzle-kit generate` não expressa diretamente —
    // será adicionado via SQL customizado na primeira migration.
  })
);

// ── Invoices (cache de invoices Stripe + NF-e — ver ADR 0009, 0010) ─

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 })
      .notNull()
      .unique(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    amountCents: integer("amount_cents").notNull(),
    invoiceUrl: text("invoice_url"),
    nfeIoId: varchar("nfe_io_id", { length: 255 }),
    nfeStatus: nfeStatusEnum("nfe_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdx: index("invoices_org_idx").on(table.organizationId),
    stripeInvoiceIdx: uniqueIndex("invoices_stripe_invoice_idx").on(
      table.stripeInvoiceId
    ),
    subscriptionIdx: index("invoices_subscription_idx").on(
      table.subscriptionId
    ),
  })
);

// ── Payments (cache do Stripe PaymentIntent — ver ADR 0009) ────────

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    method: paymentMethodEnum("method").notNull(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 255,
    })
      .notNull()
      .unique(),
    status: varchar("status", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    invoiceIdx: index("payments_invoice_idx").on(table.invoiceId),
    paymentIntentIdx: uniqueIndex("payments_payment_intent_idx").on(
      table.stripePaymentIntentId
    ),
  })
);

// ── Audit Events (auditoria cross-módulo — ver ADR 0008) ───────────

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" }
    ),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    impersonatedBy: uuid("impersonated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    product: varchar("product", { length: 64 }).notNull(),
    action: varchar("action", { length: 128 }).notNull(),
    target: varchar("target", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgCreatedIdx: index("audit_events_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
  })
);

// ── Feature Flags (por org — ver PRODUCT.md §7 #23) ────────────────

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 128 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgKeyIdx: uniqueIndex("feature_flags_org_key_idx").on(
      table.organizationId,
      table.key
    ),
  })
);

// ── Webhook Events (idempotência — ver ADR 0009) ───────────────────

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: webhookProviderEnum("provider").notNull(),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerExternalIdx: uniqueIndex("webhook_events_provider_external_idx").on(
      table.provider,
      table.externalId
    ),
  })
);

// ── Worker schema (compartilha o mesmo Postgres — ver ADR 0011) ────
//
// Tabelas do worker (BullMQ) vivem em um schema Postgres separado
// (`worker`) dentro do mesmo banco do backend — isolamento lógico sem
// o custo operacional de um segundo Postgres. Ver ADR 0011.

export const workerSchema = pgSchema("worker");

export const workerNfeJobs = workerSchema.table(
  "nfe_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    status: nfeJobStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    invoiceIdx: index("worker_nfe_jobs_invoice_idx").on(table.invoiceId),
  })
);

export const workerWebhookRetries = workerSchema.table(
  "webhook_retries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookEventId: uuid("webhook_event_id")
      .notNull()
      .references(() => webhookEvents.id, { onDelete: "cascade" }),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    webhookEventIdx: index("worker_webhook_retries_webhook_event_idx").on(
      table.webhookEventId
    ),
  })
);
