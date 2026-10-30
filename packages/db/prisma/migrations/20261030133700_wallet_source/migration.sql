-- AlterTable
ALTER TABLE "TrackedWallet" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'user';

-- Featured wallets so far were added from the wallets CLI.
UPDATE "TrackedWallet" SET "source" = 'owner' WHERE "featured" = true;
