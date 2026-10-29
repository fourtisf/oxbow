-- CreateTable
CREATE TABLE "QuoteToken" (
    "mint" TEXT NOT NULL,
    "kind" "QuoteKind" NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "logoUri" TEXT,

    CONSTRAINT "QuoteToken_pkey" PRIMARY KEY ("mint")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteToken_kind_key" ON "QuoteToken"("kind");
