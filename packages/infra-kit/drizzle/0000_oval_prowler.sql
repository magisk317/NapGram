CREATE TYPE "public"."QqBotType" AS ENUM('napcat');--> statement-breakpoint
CREATE TABLE "AccessToken" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"createdBy" integer,
	"lastUsedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "AdminAuditLog" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"action" text NOT NULL,
	"resource" text,
	"resourceId" text,
	"details" json,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AdminSession" (
	"id" text PRIMARY KEY DEFAULT 'gen_random_uuid()' NOT NULL,
	"userId" integer NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text
);
--> statement-breakpoint
CREATE TABLE "AdminUser" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"passwordHash" text NOT NULL,
	"displayName" text,
	"email" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AutomationRule" (
	"id" serial PRIMARY KEY NOT NULL,
	"instanceId" integer NOT NULL,
	"type" text NOT NULL,
	"target" text NOT NULL,
	"conditions" json NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"matchCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AvatarCache" (
	"id" serial PRIMARY KEY NOT NULL,
	"forwardPairId" integer NOT NULL,
	"hash" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Entity" (
	"id" serial PRIMARY KEY NOT NULL,
	"entityId" text NOT NULL,
	"sessionId" integer NOT NULL,
	"hash" text,
	"username" text,
	"phone" text,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "File" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" bigint NOT NULL,
	"fileId" text NOT NULL,
	"info" text NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "FlashPhoto" (
	"id" serial PRIMARY KEY NOT NULL,
	"photoMd5" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FlashPhotoView" (
	"id" serial PRIMARY KEY NOT NULL,
	"flashPhotoId" integer NOT NULL,
	"viewerId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ForwardMultiple" (
	"id" text PRIMARY KEY DEFAULT 'gen_random_uuid()' NOT NULL,
	"resId" text NOT NULL,
	"fileName" text NOT NULL,
	"fromPairId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ForwardPair" (
	"id" serial PRIMARY KEY NOT NULL,
	"qqRoomId" bigint NOT NULL,
	"qqFromGroupId" bigint,
	"tgChatId" bigint NOT NULL,
	"tgThreadId" integer,
	"instanceId" integer DEFAULT 0 NOT NULL,
	"flags" integer DEFAULT 0 NOT NULL,
	"ignoreRegex" text,
	"ignoreSenders" text,
	"forwardMode" text,
	"nicknameMode" text,
	"commandReplyMode" text,
	"commandReplyFilter" text,
	"commandReplyList" text,
	"notifyTelegram" boolean DEFAULT false NOT NULL,
	"notifyQQ" boolean DEFAULT false NOT NULL,
	"apiKey" text DEFAULT 'gen_random_uuid()' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "GlobalConfig" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"updatedBy" integer
);
--> statement-breakpoint
CREATE TABLE "Instance" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" bigint DEFAULT 0 NOT NULL,
	"workMode" text DEFAULT '' NOT NULL,
	"isSetup" boolean DEFAULT false NOT NULL,
	"botSessionId" integer,
	"userSessionId" integer,
	"qqBotId" integer,
	"flags" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Message" (
	"id" serial PRIMARY KEY NOT NULL,
	"qqRoomId" bigint NOT NULL,
	"qqSenderId" bigint NOT NULL,
	"time" integer NOT NULL,
	"brief" text,
	"seq" integer NOT NULL,
	"rand" bigint NOT NULL,
	"pktnum" integer NOT NULL,
	"tgChatId" bigint NOT NULL,
	"tgMsgId" integer NOT NULL,
	"instanceId" integer DEFAULT 0 NOT NULL,
	"tgFileId" bigint,
	"tgMessageText" text,
	"nick" text,
	"tgSenderId" bigint,
	"richHeaderUsed" boolean DEFAULT false NOT NULL,
	"ignoreDelete" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "QqBot" (
	"id" serial PRIMARY KEY NOT NULL,
	"uin" bigint DEFAULT 0,
	"name" text,
	"password" text DEFAULT '',
	"platform" integer DEFAULT 0,
	"signApi" text,
	"signVer" text,
	"signDockerId" text,
	"type" "QqBotType" DEFAULT 'napcat',
	"wsUrl" text
);
--> statement-breakpoint
CREATE TABLE "QQRequest" (
	"id" serial PRIMARY KEY NOT NULL,
	"instanceId" integer NOT NULL,
	"flag" text NOT NULL,
	"type" text NOT NULL,
	"subType" text,
	"userId" bigint NOT NULL,
	"groupId" bigint,
	"comment" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"handledBy" bigint,
	"handledAt" timestamp,
	"rejectReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RequestStatistics" (
	"id" serial PRIMARY KEY NOT NULL,
	"instanceId" integer NOT NULL,
	"friendTotal" integer DEFAULT 0 NOT NULL,
	"friendPending" integer DEFAULT 0 NOT NULL,
	"friendApproved" integer DEFAULT 0 NOT NULL,
	"friendRejected" integer DEFAULT 0 NOT NULL,
	"groupTotal" integer DEFAULT 0 NOT NULL,
	"groupPending" integer DEFAULT 0 NOT NULL,
	"groupApproved" integer DEFAULT 0 NOT NULL,
	"groupRejected" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" serial PRIMARY KEY NOT NULL,
	"dcId" integer,
	"port" integer,
	"serverAddress" text,
	"authKey" "bytea"
);
--> statement-breakpoint
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_userId_AdminUser_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."AdminUser"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_AdminUser_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."AdminUser"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_instanceId_Instance_id_fk" FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AvatarCache" ADD CONSTRAINT "AvatarCache_forwardPairId_ForwardPair_id_fk" FOREIGN KEY ("forwardPairId") REFERENCES "public"."ForwardPair"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_sessionId_Session_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "FlashPhotoView" ADD CONSTRAINT "FlashPhotoView_flashPhotoId_FlashPhoto_id_fk" FOREIGN KEY ("flashPhotoId") REFERENCES "public"."FlashPhoto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ForwardMultiple" ADD CONSTRAINT "ForwardMultiple_fromPairId_ForwardPair_id_fk" FOREIGN KEY ("fromPairId") REFERENCES "public"."ForwardPair"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ForwardPair" ADD CONSTRAINT "ForwardPair_instanceId_Instance_id_fk" FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_qqBotId_QqBot_id_fk" FOREIGN KEY ("qqBotId") REFERENCES "public"."QqBot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_instanceId_Instance_id_fk" FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "QQRequest" ADD CONSTRAINT "QQRequest_instanceId_Instance_id_fk" FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "RequestStatistics" ADD CONSTRAINT "RequestStatistics_instanceId_Instance_id_fk" FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "AccessToken_token_key" ON "AccessToken" USING btree ("token");--> statement-breakpoint
CREATE INDEX "AccessToken_token_idx" ON "AccessToken" USING btree ("token");--> statement-breakpoint
CREATE INDEX "AccessToken_isActive_idx" ON "AccessToken" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "AdminAuditLog_userId_idx" ON "AdminAuditLog" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog" USING btree ("action");--> statement-breakpoint
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "AdminSession_token_key" ON "AdminSession" USING btree ("token");--> statement-breakpoint
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "AdminSession_token_idx" ON "AdminSession" USING btree ("token");--> statement-breakpoint
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession" USING btree ("expiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser" USING btree ("username");--> statement-breakpoint
CREATE INDEX "AdminUser_username_idx" ON "AdminUser" USING btree ("username");--> statement-breakpoint
CREATE INDEX "AutomationRule_instanceId_enabled_idx" ON "AutomationRule" USING btree ("instanceId","enabled");--> statement-breakpoint
CREATE INDEX "AutomationRule_type_target_idx" ON "AutomationRule" USING btree ("type","target");--> statement-breakpoint
CREATE UNIQUE INDEX "AvatarCache_forwardPairId_key" ON "AvatarCache" USING btree ("forwardPairId");--> statement-breakpoint
CREATE UNIQUE INDEX "Entity_entityId_sessionId_key" ON "Entity" USING btree ("entityId","sessionId");--> statement-breakpoint
CREATE UNIQUE INDEX "FlashPhotoView_flashPhotoId_viewerId_key" ON "FlashPhotoView" USING btree ("flashPhotoId","viewerId");--> statement-breakpoint
CREATE UNIQUE INDEX "ForwardPair_qqRoomId_instanceId_key" ON "ForwardPair" USING btree ("qqRoomId","instanceId");--> statement-breakpoint
CREATE UNIQUE INDEX "ForwardPair_tgChatId_tgThreadId_instanceId_key" ON "ForwardPair" USING btree ("tgChatId","tgThreadId","instanceId");--> statement-breakpoint
CREATE UNIQUE INDEX "ForwardPair_apiKey_key" ON "ForwardPair" USING btree ("apiKey");--> statement-breakpoint
CREATE UNIQUE INDEX "GlobalConfig_key_key" ON "GlobalConfig" USING btree ("key");--> statement-breakpoint
CREATE INDEX "GlobalConfig_key_idx" ON "GlobalConfig" USING btree ("key");--> statement-breakpoint
CREATE INDEX "Message_qqRoomId_qqSenderId_seq_rand_pktnum_time_instanceId_idx" ON "Message" USING btree ("qqRoomId","qqSenderId","seq","rand","pktnum","time","instanceId");--> statement-breakpoint
CREATE INDEX "Message_tgChatId_tgMsgId_instanceId_idx" ON "Message" USING btree ("tgChatId","tgMsgId","instanceId");--> statement-breakpoint
CREATE UNIQUE INDEX "QQRequest_flag_key" ON "QQRequest" USING btree ("flag");--> statement-breakpoint
CREATE INDEX "QQRequest_instanceId_status_idx" ON "QQRequest" USING btree ("instanceId","status");--> statement-breakpoint
CREATE INDEX "QQRequest_flag_idx" ON "QQRequest" USING btree ("flag");--> statement-breakpoint
CREATE INDEX "QQRequest_createdAt_idx" ON "QQRequest" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "RequestStatistics_instanceId_key" ON "RequestStatistics" USING btree ("instanceId");