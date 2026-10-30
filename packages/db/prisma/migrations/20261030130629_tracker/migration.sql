/*
  Warnings:

  - You are about to drop the `LiquidityEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Pool` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PoolSnapshot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `QuoteToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockAsset` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockSnapshot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Token` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Trade` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Pool" DROP CONSTRAINT "Pool_baseMint_fkey";

-- DropForeignKey
ALTER TABLE "PoolSnapshot" DROP CONSTRAINT "PoolSnapshot_poolAddress_fkey";

-- DropForeignKey
ALTER TABLE "StockSnapshot" DROP CONSTRAINT "StockSnapshot_mint_fkey";

-- DropForeignKey
ALTER TABLE "Trade" DROP CONSTRAINT "Trade_poolAddress_fkey";

-- DropTable
DROP TABLE "LiquidityEvent";

-- DropTable
DROP TABLE "Pool";

-- DropTable
DROP TABLE "PoolSnapshot";

-- DropTable
DROP TABLE "QuoteToken";

-- DropTable
DROP TABLE "StockAsset";

-- DropTable
DROP TABLE "StockSnapshot";

-- DropTable
DROP TABLE "Token";

-- DropTable
DROP TABLE "Trade";

-- DropEnum
DROP TYPE "LiqKind";

-- DropEnum
DROP TYPE "LpStatus";

-- DropEnum
DROP TYPE "QuoteKind";

-- DropEnum
DROP TYPE "Venue";

-- CreateTable
CREATE TABLE "TrackedWallet" (
    "address" TEXT NOT NULL,
    "label" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTradeAt" TIMESTAMP(3),
    "lastSignature" TEXT,
    "backfilledAt" TIMESTAMP(3),

    CONSTRAINT "TrackedWallet_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "WalletTrade" (
    "id" BIGSERIAL NOT NULL,
    "signature" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "slot" BIGINT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "mint" TEXT NOT NULL,
    "amount" DECIMAL(40,12) NOT NULL,
    "quoteMint" TEXT NOT NULL,
    "quoteAmount" DECIMAL(40,12) NOT NULL,
    "usd" DECIMAL(24,6) NOT NULL,
    "priceUsd" DECIMAL(40,18) NOT NULL,

    CONSTRAINT "WalletTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenMeta" (
    "mint" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "logoUri" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "stable" BOOLEAN NOT NULL DEFAULT false,
    "usdPrice" DOUBLE PRECISION,
    "change24h" DOUBLE PRECISION,
    "mcap" DOUBLE PRECISION,
    "liquidity" DOUBLE PRECISION,
    "holderCount" INTEGER,
    "organicScore" DOUBLE PRECISION,
    "mintAuthorityOff" BOOLEAN,
    "freezeAuthorityOff" BOOLEAN,
    "topHoldersPct" DOUBLE PRECISION,
    "devPct" DOUBLE PRECISION,
    "launchedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'jupiter',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenMeta_pkey" PRIMARY KEY ("mint")
);

-- CreateIndex
CREATE INDEX "TrackedWallet_active_featured_idx" ON "TrackedWallet"("active", "featured");

-- CreateIndex
CREATE INDEX "WalletTrade_wallet_ts_idx" ON "WalletTrade"("wallet", "ts");

-- CreateIndex
CREATE INDEX "WalletTrade_mint_ts_idx" ON "WalletTrade"("mint", "ts");

-- CreateIndex
CREATE INDEX "WalletTrade_ts_idx" ON "WalletTrade"("ts");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTrade_signature_wallet_mint_key" ON "WalletTrade"("signature", "wallet", "mint");

-- AddForeignKey
ALTER TABLE "WalletTrade" ADD CONSTRAINT "WalletTrade_wallet_fkey" FOREIGN KEY ("wallet") REFERENCES "TrackedWallet"("address") ON DELETE CASCADE ON UPDATE CASCADE;
