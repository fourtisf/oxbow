-- CreateEnum
CREATE TYPE "Venue" AS ENUM ('RAYDIUM_CPMM', 'METEORA_DAMM_V2', 'ORCA_WHIRLPOOL');

-- CreateEnum
CREATE TYPE "QuoteKind" AS ENUM ('STOCK', 'SOL', 'USDC');

-- CreateEnum
CREATE TYPE "LpStatus" AS ENUM ('BURNED', 'LOCKED', 'PARTIAL', 'UNLOCKED');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "LiqKind" AS ENUM ('CREATE', 'ADD', 'REMOVE', 'CLAIM');

-- CreateTable
CREATE TABLE "Token" (
    "mint" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "supply" DECIMAL(40,12) NOT NULL,
    "tokenProgram" TEXT NOT NULL,
    "mintAuthority" TEXT,
    "freezeAuthority" TEXT,
    "logoUri" TEXT,
    "extensions" JSONB NOT NULL DEFAULT '[]',
    "risk" JSONB NOT NULL,
    "mintCreatedAt" TIMESTAMP(3),
    "holderCount" INTEGER NOT NULL DEFAULT 0,
    "top10Pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("mint")
);

-- CreateTable
CREATE TABLE "StockAsset" (
    "mint" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "tokenProgram" TEXT NOT NULL,
    "priceSource" TEXT NOT NULL,
    "priceFeedId" TEXT,
    "brandColorA" TEXT NOT NULL,
    "brandColorB" TEXT NOT NULL,
    "monogram" TEXT NOT NULL,
    "logoUri" TEXT,
    "minLiquidityUsd" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "notice" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "checkNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockAsset_pkey" PRIMARY KEY ("mint")
);

-- CreateTable
CREATE TABLE "StockSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "mint" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "StockSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pool" (
    "address" TEXT NOT NULL,
    "venue" "Venue" NOT NULL,
    "baseMint" TEXT NOT NULL,
    "quoteMint" TEXT NOT NULL,
    "quoteKind" "QuoteKind" NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "lpMint" TEXT,
    "positionNft" TEXT,
    "creator" TEXT NOT NULL,
    "createdTx" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "lpStatus" "LpStatus" NOT NULL DEFAULT 'UNLOCKED',
    "lpLockedPct" INTEGER NOT NULL DEFAULT 0,
    "lpUnlockAt" TIMESTAMP(3),
    "holders" JSONB NOT NULL DEFAULT '[]',
    "reserveBase" DECIMAL(40,12) NOT NULL,
    "reserveQuote" DECIMAL(40,12) NOT NULL,
    "priceUsd" DECIMAL(40,18) NOT NULL,
    "tvlUsd" DECIMAL(24,6) NOT NULL,
    "vol24hUsd" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "change24h" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "buys24h" INTEGER NOT NULL DEFAULT 0,
    "sells24h" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "PoolSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "priceUsd" DECIMAL(40,18) NOT NULL,
    "tvlUsd" DECIMAL(24,6) NOT NULL,
    "volUsd" DECIMAL(24,6) NOT NULL,

    CONSTRAINT "PoolSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "sig" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "side" "TradeSide" NOT NULL,
    "trader" TEXT NOT NULL,
    "amountUsd" DECIMAL(24,6) NOT NULL,
    "baseAmount" DECIMAL(40,12) NOT NULL,
    "quoteAmount" DECIMAL(40,12) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("sig")
);

-- CreateTable
CREATE TABLE "LiquidityEvent" (
    "sig" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "kind" "LiqKind" NOT NULL,
    "wallet" TEXT NOT NULL,
    "amountUsd" DECIMAL(24,6) NOT NULL,

    CONSTRAINT "LiquidityEvent_pkey" PRIMARY KEY ("sig")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockAsset_symbol_key" ON "StockAsset"("symbol");

-- CreateIndex
CREATE INDEX "StockSnapshot_mint_ts_idx" ON "StockSnapshot"("mint", "ts");

-- CreateIndex
CREATE INDEX "Pool_quoteKind_tvlUsd_idx" ON "Pool"("quoteKind", "tvlUsd");

-- CreateIndex
CREATE INDEX "Pool_vol24hUsd_idx" ON "Pool"("vol24hUsd");

-- CreateIndex
CREATE INDEX "Pool_createdAt_idx" ON "Pool"("createdAt");

-- CreateIndex
CREATE INDEX "Pool_creator_idx" ON "Pool"("creator");

-- CreateIndex
CREATE INDEX "PoolSnapshot_poolAddress_ts_idx" ON "PoolSnapshot"("poolAddress", "ts");

-- CreateIndex
CREATE INDEX "Trade_poolAddress_ts_idx" ON "Trade"("poolAddress", "ts");

-- CreateIndex
CREATE INDEX "Trade_trader_ts_idx" ON "Trade"("trader", "ts");

-- CreateIndex
CREATE INDEX "LiquidityEvent_poolAddress_ts_idx" ON "LiquidityEvent"("poolAddress", "ts");

-- CreateIndex
CREATE INDEX "LiquidityEvent_wallet_ts_idx" ON "LiquidityEvent"("wallet", "ts");

-- AddForeignKey
ALTER TABLE "StockSnapshot" ADD CONSTRAINT "StockSnapshot_mint_fkey" FOREIGN KEY ("mint") REFERENCES "StockAsset"("mint") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_baseMint_fkey" FOREIGN KEY ("baseMint") REFERENCES "Token"("mint") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolSnapshot" ADD CONSTRAINT "PoolSnapshot_poolAddress_fkey" FOREIGN KEY ("poolAddress") REFERENCES "Pool"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_poolAddress_fkey" FOREIGN KEY ("poolAddress") REFERENCES "Pool"("address") ON DELETE CASCADE ON UPDATE CASCADE;
