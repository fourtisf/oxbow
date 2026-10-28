'use client';

import { useQuery } from '@tanstack/react-query';
import { qk } from '../api/keys';
import { useWallet } from '../store/wallet';
import { chain } from './mock';

/** Connected wallet's balances for the given mints (UI units). Empty when disconnected. */
export function useBalances(mints: (string | null | undefined)[]) {
  const wallet = useWallet((s) => s.wallet);
  const list = mints.filter((m): m is string => !!m);
  const q = useQuery({
    queryKey: [...qk.balances(wallet?.address ?? ''), list],
    queryFn: () => chain.balances(wallet!.address, list),
    enabled: !!wallet && list.length > 0,
  });
  const get = (mint: string | null | undefined) => (mint && q.data ? q.data[mint] ?? 0 : 0);
  return { ...q, get };
}
