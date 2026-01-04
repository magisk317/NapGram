-- Idempotent migration script for transitioning from Prisma to Drizzle
-- This script safely handles existing database objects

-- Create schema if it doesn't exist
DO $$
BEGIN
    CREATE SCHEMA IF NOT EXISTS "slave_market";
EXCEPTION
    WHEN duplicate_schema THEN NULL;
END $$;
--> statement-breakpoint

-- Create enum type if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QqBotType') THEN
        CREATE TYPE "public"."QqBotType" AS ENUM('napcat');
    END IF;
END $$;
--> statement-breakpoint

-- Create tables with IF NOT EXISTS
CREATE TABLE IF NOT EXISTS "AccessToken" (
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
CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
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
CREATE TABLE IF NOT EXISTS "AdminSession" (
	"id" text PRIMARY KEY DEFAULT 'gen_random_uuid()' NOT NULL,
	"userId" integer NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AdminUser" (
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
CREATE TABLE IF NOT EXISTS "AutomationRule" (
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
CREATE TABLE IF NOT EXISTS "AvatarCache" (
	"id" serial PRIMARY KEY NOT NULL,
	"forwardPairId" integer NOT NULL,
	"hash" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Entity" (
	"id" serial PRIMARY KEY NOT NULL,
	"entityId" text NOT NULL,
	"sessionId" integer NOT NULL,
	"hash" text,
	"username" text,
	"phone" text,
	"name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "File" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" bigint NOT NULL,
	"fileId" text NOT NULL,
	"info" text NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "FlashPhoto" (
	"id" serial PRIMARY KEY NOT NULL,
	"photoMd5" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "FlashPhotoView" (
	"id" serial PRIMARY KEY NOT NULL,
	"flashPhotoId" integer NOT NULL,
	"viewerId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ForwardMultiple" (
	"id" text PRIMARY KEY DEFAULT 'gen_random_uuid()' NOT NULL,
	"resId" text NOT NULL,
	"fileName" text NOT NULL,
	"fromPairId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ForwardPair" (
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
CREATE TABLE IF NOT EXISTS "GlobalConfig" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"updatedBy" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Instance" (
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
CREATE TABLE IF NOT EXISTS "Message" (
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
CREATE TABLE IF NOT EXISTS "QqBot" (
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
CREATE TABLE IF NOT EXISTS "QQRequest" (
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
CREATE TABLE IF NOT EXISTS "RequestStatistics" (
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
CREATE TABLE IF NOT EXISTS "Session" (
	"id" serial PRIMARY KEY NOT NULL,
	"dcId" integer,
	"port" integer,
	"serverAddress" text,
	"authKey" "bytea"
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slave_market"."slave_market_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"nickname" text NOT NULL,
	"addedBy" text NOT NULL,
	"addedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slave_market"."slave_market_appearances" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"itemName" text NOT NULL,
	"slot" text NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL,
	"acquiredAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slave_market"."slave_market_farm_lands" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"plotIndex" integer NOT NULL,
	"cropType" text,
	"plantTime" bigint,
	"harvestTime" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slave_market"."slave_market_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"plainUserId" text,
	"nickname" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"deposit" integer DEFAULT 0 NOT NULL,
	"worth" integer DEFAULT 100 NOT NULL,
	"creditLevel" integer DEFAULT 1 NOT NULL,
	"depositLimit" integer DEFAULT 1000 NOT NULL,
	"loanBalance" integer DEFAULT 0 NOT NULL,
	"loanCreditLevel" integer DEFAULT 1 NOT NULL,
	"ownerId" text,
	"ownedTime" bigint,
	"vipEndTime" bigint,
	"registerTime" bigint NOT NULL,
	"registerSource" text,
	"lastWorkTime" bigint,
	"lastRobTime" bigint,
	"lastTransferTime" bigint,
	"lastBuyTime" bigint,
	"lastPlantTime" bigint,
	"lastHarvestTime" bigint,
	"lastInterestTime" bigint,
	"lastLoanInterestTime" bigint,
	"isAdmin" boolean DEFAULT false NOT NULL,
	"commandBanned" boolean DEFAULT false NOT NULL,
	"bodyguardName" text,
	"bodyguardEndTime" bigint,
	"jailEndTime" bigint,
	"jailWorkIncome" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slave_market"."slave_market_red_packet_grabs" (
	"id" serial PRIMARY KEY NOT NULL,
	"packetId" text NOT NULL,
	"userId" text NOT NULL,
	"userName" text NOT NULL,
	"amount" integer NOT NULL,
	"grabbedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slave_market"."slave_market_red_packets" (
	"id" serial PRIMARY KEY NOT NULL,
	"packetId" text NOT NULL,
	"senderId" text NOT NULL,
	"senderName" text NOT NULL,
	"totalAmount" integer NOT NULL,
	"totalCount" integer NOT NULL,
	"remaining" integer NOT NULL,
	"scopeKey" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slave_market"."slave_market_system" (
	"id" serial PRIMARY KEY NOT NULL,
	"isDisabled" boolean DEFAULT false NOT NULL,
	"lastAssetDecayTime" bigint,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slave_market"."slave_market_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"balance" integer NOT NULL,
	"targetId" text,
	"description" text,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slave_market"."slave_market_vip_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"cardCode" text NOT NULL,
	"cardType" text NOT NULL,
	"duration" integer NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"usedBy" text,
	"usedAt" timestamp,
	"createdBy" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add foreign key constraints only if they don't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AdminAuditLog_userId_AdminUser_id_fk'
    ) THEN
        ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_userId_AdminUser_id_fk" 
        FOREIGN KEY ("userId") REFERENCES "public"."AdminUser"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AdminSession_userId_AdminUser_id_fk'
    ) THEN
        ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_AdminUser_id_fk" 
        FOREIGN KEY ("userId") REFERENCES "public"."AdminUser"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AutomationRule_instanceId_Instance_id_fk'
    ) THEN
        ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_instanceId_Instance_id_fk" 
        FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AvatarCache_forwardPairId_ForwardPair_id_fk'
    ) THEN
        ALTER TABLE "AvatarCache" ADD CONSTRAINT "AvatarCache_forwardPairId_ForwardPair_id_fk" 
        FOREIGN KEY ("forwardPairId") REFERENCES "public"."ForwardPair"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Entity_sessionId_Session_id_fk'
    ) THEN
        ALTER TABLE "Entity" ADD CONSTRAINT "Entity_sessionId_Session_id_fk" 
        FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'FlashPhotoView_flashPhotoId_FlashPhoto_id_fk'
    ) THEN
        ALTER TABLE "FlashPhotoView" ADD CONSTRAINT "FlashPhotoView_flashPhotoId_FlashPhoto_id_fk" 
        FOREIGN KEY ("flashPhotoId") REFERENCES "public"."FlashPhoto"("id") ON DELETE no action ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ForwardMultiple_fromPairId_ForwardPair_id_fk'
    ) THEN
        ALTER TABLE "ForwardMultiple" ADD CONSTRAINT "ForwardMultiple_fromPairId_ForwardPair_id_fk" 
        FOREIGN KEY ("fromPairId") REFERENCES "public"."ForwardPair"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ForwardPair_instanceId_Instance_id_fk'
    ) THEN
        ALTER TABLE "ForwardPair" ADD CONSTRAINT "ForwardPair_instanceId_Instance_id_fk" 
        FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Instance_qqBotId_QqBot_id_fk'
    ) THEN
        ALTER TABLE "Instance" ADD CONSTRAINT "Instance_qqBotId_QqBot_id_fk" 
        FOREIGN KEY ("qqBotId") REFERENCES "public"."QqBot"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Message_instanceId_Instance_id_fk'
    ) THEN
        ALTER TABLE "Message" ADD CONSTRAINT "Message_instanceId_Instance_id_fk" 
        FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'QQRequest_instanceId_Instance_id_fk'
    ) THEN
        ALTER TABLE "QQRequest" ADD CONSTRAINT "QQRequest_instanceId_Instance_id_fk" 
        FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RequestStatistics_instanceId_Instance_id_fk'
    ) THEN
        ALTER TABLE "RequestStatistics" ADD CONSTRAINT "RequestStatistics_instanceId_Instance_id_fk" 
        FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

-- Create indexes only if they don't already exist
CREATE UNIQUE INDEX IF NOT EXISTS "AccessToken_token_key" ON "AccessToken" USING btree ("token");
CREATE INDEX IF NOT EXISTS "AccessToken_token_idx" ON "AccessToken" USING btree ("token");
CREATE INDEX IF NOT EXISTS "AccessToken_isActive_idx" ON "AccessToken" USING btree ("isActive");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_userId_idx" ON "AdminAuditLog" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_idx" ON "AdminAuditLog" USING btree ("action");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog" USING btree ("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AdminSession_token_key" ON "AdminSession" USING btree ("token");
CREATE INDEX IF NOT EXISTS "AdminSession_userId_idx" ON "AdminSession" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "AdminSession_token_idx" ON "AdminSession" USING btree ("token");
CREATE INDEX IF NOT EXISTS "AdminSession_expiresAt_idx" ON "AdminSession" USING btree ("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_username_key" ON "AdminUser" USING btree ("username");
CREATE INDEX IF NOT EXISTS "AdminUser_username_idx" ON "AdminUser" USING btree ("username");
CREATE INDEX IF NOT EXISTS "AutomationRule_instanceId_enabled_idx" ON "AutomationRule" USING btree ("instanceId","enabled");
CREATE INDEX IF NOT EXISTS "AutomationRule_type_target_idx" ON "AutomationRule" USING btree ("type","target");
CREATE UNIQUE INDEX IF NOT EXISTS "AvatarCache_forwardPairId_key" ON "AvatarCache" USING btree ("forwardPairId");
CREATE UNIQUE INDEX IF NOT EXISTS "Entity_entityId_sessionId_key" ON "Entity" USING btree ("entityId","sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "FlashPhotoView_flashPhotoId_viewerId_key" ON "FlashPhotoView" USING btree ("flashPhotoId","viewerId");
CREATE UNIQUE INDEX IF NOT EXISTS "ForwardPair_qqRoomId_instanceId_key" ON "ForwardPair" USING btree ("qqRoomId","instanceId");
CREATE UNIQUE INDEX IF NOT EXISTS "ForwardPair_tgChatId_tgThreadId_instanceId_key" ON "ForwardPair" USING btree ("tgChatId","tgThreadId","instanceId");
CREATE UNIQUE INDEX IF NOT EXISTS "ForwardPair_apiKey_key" ON "ForwardPair" USING btree ("apiKey");
CREATE UNIQUE INDEX IF NOT EXISTS "GlobalConfig_key_key" ON "GlobalConfig" USING btree ("key");
CREATE INDEX IF NOT EXISTS "GlobalConfig_key_idx" ON "GlobalConfig" USING btree ("key");
CREATE INDEX IF NOT EXISTS "Message_qqRoomId_qqSenderId_seq_rand_pktnum_time_instanceId_idx" ON "Message" USING btree ("qqRoomId","qqSenderId","seq","rand","pktnum","time","instanceId");
CREATE INDEX IF NOT EXISTS "Message_tgChatId_tgMsgId_instanceId_idx" ON "Message" USING btree ("tgChatId","tgMsgId","instanceId");
CREATE UNIQUE INDEX IF NOT EXISTS "QQRequest_flag_key" ON "QQRequest" USING btree ("flag");
CREATE INDEX IF NOT EXISTS "QQRequest_instanceId_status_idx" ON "QQRequest" USING btree ("instanceId","status");
CREATE INDEX IF NOT EXISTS "QQRequest_flag_idx" ON "QQRequest" USING btree ("flag");
CREATE INDEX IF NOT EXISTS "QQRequest_createdAt_idx" ON "QQRequest" USING btree ("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RequestStatistics_instanceId_key" ON "RequestStatistics" USING btree ("instanceId");
CREATE UNIQUE INDEX IF NOT EXISTS "slave_market_admins_userId_key" ON "slave_market"."slave_market_admins" USING btree ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "slave_market_appearances_userId_itemName_key" ON "slave_market"."slave_market_appearances" USING btree ("userId","itemName");
CREATE INDEX IF NOT EXISTS "slave_market_appearances_userId_equipped_idx" ON "slave_market"."slave_market_appearances" USING btree ("userId","equipped");
CREATE UNIQUE INDEX IF NOT EXISTS "slave_market_farm_lands_userId_plotIndex_key" ON "slave_market"."slave_market_farm_lands" USING btree ("userId","plotIndex");
CREATE INDEX IF NOT EXISTS "slave_market_farm_lands_userId_idx" ON "slave_market"."slave_market_farm_lands" USING btree ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "slave_market_players_userId_key" ON "slave_market"."slave_market_players" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "slave_market_players_userId_idx" ON "slave_market"."slave_market_players" USING btree ("userId");
CREATE INDEX IF NOT EXISTS "slave_market_players_ownerId_idx" ON "slave_market"."slave_market_players" USING btree ("ownerId");
CREATE INDEX IF NOT EXISTS "slave_market_players_registerSource_idx" ON "slave_market"."slave_market_players" USING btree ("registerSource");
CREATE UNIQUE INDEX IF NOT EXISTS "slave_market_red_packet_grabs_packetId_userId_key" ON "slave_market"."slave_market_red_packet_grabs" USING btree ("packetId","userId");
CREATE INDEX IF NOT EXISTS "slave_market_red_packet_grabs_userId_idx" ON "slave_market"."slave_market_red_packet_grabs" USING btree ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "slave_market_red_packets_packetId_key" ON "slave_market"."slave_market_red_packets" USING btree ("packetId");
CREATE INDEX IF NOT EXISTS "slave_market_red_packets_scopeKey_idx" ON "slave_market"."slave_market_red_packets" USING btree ("scopeKey");
CREATE INDEX IF NOT EXISTS "slave_market_red_packets_createdAt_idx" ON "slave_market"."slave_market_red_packets" USING btree ("createdAt");
CREATE INDEX IF NOT EXISTS "slave_market_transactions_userId_createdAt_idx" ON "slave_market"."slave_market_transactions" USING btree ("userId","createdAt");
CREATE INDEX IF NOT EXISTS "slave_market_transactions_type_idx" ON "slave_market"."slave_market_transactions" USING btree ("type");
CREATE UNIQUE INDEX IF NOT EXISTS "slave_market_vip_cards_cardCode_key" ON "slave_market"."slave_market_vip_cards" USING btree ("cardCode");
CREATE INDEX IF NOT EXISTS "slave_market_vip_cards_used_idx" ON "slave_market"."slave_market_vip_cards" USING btree ("used");
CREATE INDEX IF NOT EXISTS "slave_market_vip_cards_cardCode_idx" ON "slave_market"."slave_market_vip_cards" USING btree ("cardCode");
