/** Papéis a nível de plataforma (WZ, dona da suíte). */
export const PLATFORM_ROLES = ['platform_super_admin', 'platform_support'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Papéis a nível de organização (tenant). */
export const ORG_ROLES = ['org_owner', 'org_admin', 'org_member'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Status de um tenant no CORE. */
export const TENANT_STATUS = ['provisionando', 'ativo', 'suspenso', 'encerrado'] as const;
export type TenantStatus = (typeof TENANT_STATUS)[number];

/** Chaves de módulos de produto conhecidos. */
export const MODULE_KEYS = ['masterfila'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
