
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."QqBotType" AS ENUM ('oicq', 'napcat');

-- CreateTable
CREATE TABLE "public"."AvatarCache" (
    "id" SERIAL NOT NULL,
    "forwardPairId" INTEGER NOT NULL,
    "hash" BYTEA NOT NULL,

    CONSTRAINT "AvatarCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Entity" (
    "id" SERIAL NOT NULL,
    "entityId" TEXT NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "hash" TEXT,
    "username" TEXT,
    "phone" TEXT,
    "name" TEXT,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."File" (
    "id" SERIAL NOT NULL,
    "roomId" BIGINT NOT NULL,
    "fileId" TEXT NOT NULL,
    "info" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FlashPhoto" (
    "id" SERIAL NOT NULL,
    "photoMd5" TEXT NOT NULL,

    CONSTRAINT "FlashPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FlashPhotoView" (
    "id" SERIAL NOT NULL,
    "flashPhotoId" INTEGER NOT NULL,
    "viewerId" BIGINT NOT NULL,

    CONSTRAINT "FlashPhotoView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ForwardMultiple" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fromPairId" INTEGER NOT NULL,

    CONSTRAINT "ForwardMultiple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ForwardPair" (
    "id" SERIAL NOT NULL,
    "qqRoomId" BIGINT NOT NULL,
    "qqFromGroupId" BIGINT,
    "tgChatId" BIGINT NOT NULL,
    "tgThreadId" INTEGER,
    "instanceId" INTEGER NOT NULL DEFAULT 0,
    "flags" INTEGER NOT NULL DEFAULT 0,
    "apiKey" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ignoreRegex" TEXT,
    "ignoreSenders" TEXT,
    "forwardMode" TEXT,
    "nicknameMode" TEXT,

    CONSTRAINT "ForwardPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Instance" (
    "id" SERIAL NOT NULL,
    "owner" BIGINT NOT NULL DEFAULT 0,
    "workMode" TEXT NOT NULL DEFAULT '',
    "isSetup" BOOLEAN NOT NULL DEFAULT false,
    "botSessionId" INTEGER,
    "userSessionId" INTEGER,
    "qqBotId" INTEGER,
    "flags" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" SERIAL NOT NULL,
    "qqRoomId" BIGINT NOT NULL,
    "qqSenderId" BIGINT NOT NULL,
    "time" INTEGER NOT NULL,
    "brief" TEXT,
    "seq" INTEGER NOT NULL,
    "rand" BIGINT NOT NULL,
    "pktnum" INTEGER NOT NULL,
    "tgChatId" BIGINT NOT NULL,
    "tgMsgId" INTEGER NOT NULL,
    "instanceId" INTEGER NOT NULL DEFAULT 0,
    "tgFileId" BIGINT,
    "tgMessageText" TEXT,
    "nick" TEXT,
    "tgSenderId" BIGINT,
    "richHeaderUsed" BOOLEAN NOT NULL DEFAULT false,
    "ignoreDelete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QqBot" (
    "id" SERIAL NOT NULL,
    "uin" BIGINT DEFAULT 0,
    "password" TEXT DEFAULT '',
    "platform" INTEGER DEFAULT 0,
    "signApi" TEXT,
    "signVer" TEXT,
    "signDockerId" TEXT,
    "type" "public"."QqBotType" NOT NULL DEFAULT 'oicq',
    "wsUrl" TEXT,

    CONSTRAINT "QqBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" SERIAL NOT NULL,
    "dcId" INTEGER,
    "port" INTEGER,
    "serverAddress" TEXT,
    "authKey" BYTEA,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvatarCache_forwardPairId_key" ON "public"."AvatarCache"("forwardPairId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Entity_entityId_sessionId_key" ON "public"."Entity"("entityId" ASC, "sessionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "FlashPhotoView_flashPhotoId_viewerId_key" ON "public"."FlashPhotoView"("flashPhotoId" ASC, "viewerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ForwardPair_apiKey_key" ON "public"."ForwardPair"("apiKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ForwardPair_qqRoomId_instanceId_key" ON "public"."ForwardPair"("qqRoomId" ASC, "instanceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ForwardPair_tgChatId_tgThreadId_instanceId_key" ON "public"."ForwardPair"("tgChatId" ASC, "tgThreadId" ASC, "instanceId" ASC);

-- CreateIndex
CREATE INDEX "Message_qqRoomId_qqSenderId_seq_rand_pktnum_time_instanceId_idx" ON "public"."Message"("qqRoomId" ASC, "qqSenderId" ASC, "seq" ASC, "rand" ASC, "pktnum" ASC, "time" ASC, "instanceId" ASC);

-- CreateIndex
CREATE INDEX "Message_tgChatId_tgMsgId_instanceId_idx" ON "public"."Message"("tgChatId" ASC, "tgMsgId" ASC, "instanceId" ASC);

-- AddForeignKey
ALTER TABLE "public"."AvatarCache" ADD CONSTRAINT "AvatarCache_forwardPairId_fkey" FOREIGN KEY ("forwardPairId") REFERENCES "public"."ForwardPair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Entity" ADD CONSTRAINT "Entity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FlashPhotoView" ADD CONSTRAINT "FlashPhotoView_flashPhotoId_fkey" FOREIGN KEY ("flashPhotoId") REFERENCES "public"."FlashPhoto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ForwardMultiple" ADD CONSTRAINT "ForwardMultiple_fromPairId_fkey" FOREIGN KEY ("fromPairId") REFERENCES "public"."ForwardPair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ForwardPair" ADD CONSTRAINT "ForwardPair_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Instance" ADD CONSTRAINT "Instance_qqBotId_fkey" FOREIGN KEY ("qqBotId") REFERENCES "public"."QqBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "public"."Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
