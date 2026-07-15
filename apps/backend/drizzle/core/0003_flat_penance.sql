CREATE TYPE "public"."metric_granularity" AS ENUM('hour', 'day');--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"modulo" text NOT NULL,
	"metrica" text NOT NULL,
	"valor" double precision NOT NULL,
	"granularidade" "metric_granularity" NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_snapshots_ponto_idx" ON "metric_snapshots" USING btree ("tenant_id","modulo","metrica","granularidade","bucket");--> statement-breakpoint
CREATE INDEX "metric_snapshots_consulta_idx" ON "metric_snapshots" USING btree ("tenant_id","bucket");