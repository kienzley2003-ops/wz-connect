CREATE TYPE "public"."platform_role" AS ENUM('platform_super_admin', 'platform_support');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_role" "platform_role";