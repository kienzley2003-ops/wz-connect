CREATE TABLE "tenant_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subdominio" text NOT NULL,
	"provisionado_em" timestamp with time zone DEFAULT now() NOT NULL
);
