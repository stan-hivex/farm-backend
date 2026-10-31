-- AlterTable
ALTER TABLE "business_api_payouts" ADD COLUMN     "actor_user_id" UUID,
ADD COLUMN     "source" VARCHAR(20) NOT NULL DEFAULT 'api',
ALTER COLUMN "api_key_id" DROP NOT NULL;

