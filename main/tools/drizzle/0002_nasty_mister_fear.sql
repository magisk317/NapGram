CREATE TABLE "CommandPermissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"commandName" text NOT NULL,
	"instanceId" integer DEFAULT 0 NOT NULL,
	"requiredLevel" integer DEFAULT 3 NOT NULL,
	"requireOwner" integer DEFAULT 0 NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"restrictions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PermissionAuditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventType" text NOT NULL,
	"operatorId" text,
	"targetUserId" text,
	"instanceId" integer,
	"commandName" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "UserPermissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"instanceId" integer DEFAULT 0 NOT NULL,
	"permissionLevel" integer DEFAULT 3 NOT NULL,
	"customPermissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"grantedBy" text,
	"grantedAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp,
	"note" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "CommandPermissions_commandName_instanceId_key" ON "CommandPermissions" USING btree ("commandName","instanceId");--> statement-breakpoint
CREATE INDEX "CommandPermissions_commandName_idx" ON "CommandPermissions" USING btree ("commandName");--> statement-breakpoint
CREATE INDEX "CommandPermissions_requiredLevel_idx" ON "CommandPermissions" USING btree ("requiredLevel");--> statement-breakpoint
CREATE INDEX "CommandPermissions_enabled_idx" ON "CommandPermissions" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "PermissionAuditLogs_eventType_idx" ON "PermissionAuditLogs" USING btree ("eventType");--> statement-breakpoint
CREATE INDEX "PermissionAuditLogs_operatorId_idx" ON "PermissionAuditLogs" USING btree ("operatorId");--> statement-breakpoint
CREATE INDEX "PermissionAuditLogs_targetUserId_idx" ON "PermissionAuditLogs" USING btree ("targetUserId");--> statement-breakpoint
CREATE INDEX "PermissionAuditLogs_instanceId_idx" ON "PermissionAuditLogs" USING btree ("instanceId");--> statement-breakpoint
CREATE INDEX "PermissionAuditLogs_commandName_idx" ON "PermissionAuditLogs" USING btree ("commandName");--> statement-breakpoint
CREATE INDEX "PermissionAuditLogs_createdAt_idx" ON "PermissionAuditLogs" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "UserPermissions_userId_instanceId_key" ON "UserPermissions" USING btree ("userId","instanceId");--> statement-breakpoint
CREATE INDEX "UserPermissions_userId_idx" ON "UserPermissions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "UserPermissions_instanceId_idx" ON "UserPermissions" USING btree ("instanceId");--> statement-breakpoint
CREATE INDEX "UserPermissions_permissionLevel_idx" ON "UserPermissions" USING btree ("permissionLevel");--> statement-breakpoint
CREATE INDEX "UserPermissions_expiresAt_idx" ON "UserPermissions" USING btree ("expiresAt");
