-- Ensure legacy values won't block enum swap
UPDATE "public"."QqBot" SET "type" = 'napcat' WHERE "type" = 'oicq';

-- Recreate enum without 'oicq'
CREATE TYPE "public"."QqBotType_new" AS ENUM ('napcat');

ALTER TABLE "public"."QqBot" ALTER COLUMN "type" DROP DEFAULT;

ALTER TABLE "public"."QqBot"
ALTER COLUMN "type" TYPE "public"."QqBotType_new"
USING ("type"::text::"public"."QqBotType_new");

ALTER TABLE "public"."QqBot" ALTER COLUMN "type" SET DEFAULT 'napcat';

ALTER TYPE "public"."QqBotType" RENAME TO "QqBotType_old";
ALTER TYPE "public"."QqBotType_new" RENAME TO "QqBotType";
DROP TYPE "public"."QqBotType_old";
