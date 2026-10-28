# scripts

- `seed-stocks.ts` (M2): reads the owner-maintained `stocks.json` (symbol, name,
  issuer, mint, price feed id, brand colors) from the issuer's official list,
  prints a review table, verifies each mint and price feed, then writes
  `StockAsset` rows. Mint addresses are never filled in by hand or from memory.
