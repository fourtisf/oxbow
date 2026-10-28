'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterTx, useQuotes } from '@/lib/api/queries';
import { chain } from '@/lib/chain/mock';
import { CREATE_STEPS } from '@/lib/chain/types';
import { copyText } from '@/lib/copy';
import { prefersReducedMotion } from '@/lib/hooks';
import { useCreateForm } from '@/lib/store/create';
import { toast } from '@/lib/store/toast';
import { useUi } from '@/lib/store/ui';
import { useWallet } from '@/lib/store/wallet';
import { CheckIcon, CopyIcon, DropIcon } from '../ui/Icons';
import { Modal } from '../ui/overlay';
import { Button, cx } from '../ui/primitives';
import { useCreateModel } from './model';
import { PoolPreview } from './PoolPreview';
import { CreateSteps } from './Steps';

interface Run {
  /** Index of the active step; CREATE_STEPS.length when all are done. */
  step: number;
  labels: string[];
  pair: string;
  venue: string;
  address: string | null;
}

/** The /create page body: five steps, sticky preview, progress and success dialog. */
export function CreateView({ initialMint, initialQuote }: { initialMint?: string; initialQuote?: string }) {
  const m = useCreateModel();
  const form = useCreateForm();
  const { data: quotes } = useQuotes();
  const wallet = useWallet((s) => s.wallet);
  const setUi = useUi((s) => s.set);
  const qc = useQueryClient();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const applied = useRef<string | null>(null);

  // ?mint= and ?quote= from the home card and "Pair with X" buttons.
  useEffect(() => {
    if (!quotes) return;
    const key = `${initialMint ?? ''}|${initialQuote ?? ''}`;
    if (applied.current === key || key === '|') return;
    applied.current = key;
    const s = useCreateForm.getState();
    if (initialMint && initialMint !== s.mint) s.set({ mint: initialMint });
    if (initialQuote && quotes.some((q) => q.symbol === initialQuote) && initialQuote !== s.quote) s.setQuote(initialQuote);
    if (!initialMint && !s.mint) setTimeout(() => document.getElementById('mint')?.focus(), 120);
  }, [initialMint, initialQuote, quotes]);

  const start = async () => {
    if (!wallet || m.msg || !m.token || !m.quote || run) return;
    const lp = m.lp;
    const labels = [
      'Approve in ' + wallet.name,
      'Verify the ' + m.quote.symbol + ' price feed',
      'Create the pool on ' + m.costs.venueLabel,
      lp.status === 'BURNED' ? 'Burn the liquidity' : lp.status === 'UNLOCKED' ? 'Skip the lock' : 'Lock ' + lp.lockedPct + '% of the liquidity',
      'Publish to Explore',
    ];
    const base = { labels, pair: `${m.token.symbol}/${m.quote.symbol}`, venue: m.costs.venueLabel, address: null };
    setRun({ ...base, step: 0 });
    try {
      const { address } = await chain.createPool(
        wallet.address,
        { token: m.token, quote: m.quote, baseAmount: m.b, quoteAmount: m.qa, venue: form.venue, feeBps: form.feeBps, lock: m.lock },
        (step) => setRun((r) => r && { ...r, step }),
      );
      await invalidateAfterTx(qc);
      setRun((r) => r && { ...r, step: CREATE_STEPS.length, address });
    } catch (e) {
      setRun(null);
      toast(e instanceof Error ? e.message : 'Pool creation failed');
    }
  };

  const viewPool = () => {
    if (!run?.address) return;
    setUi({ freshAddress: run.address, pendingOpen: run.address });
    setRun(null);
    form.reset();
    router.push('/explore');
  };

  const another = () => {
    setRun(null);
    form.reset();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  const busy = !!run && !run.address;

  return (
    <div className="create">
      <CreateSteps m={m} />
      <PoolPreview m={m} onCreate={start} busy={!!run} />
      <Modal open={!!run} onClose={another} label={run?.address ? 'Pool created' : 'Creating pool'} busy={busy}>
        {run && !run.address && (
          <>
            <div className="m-h">
              <h3>Creating {run.pair}</h3>
            </div>
            <p className="m-sub">Keep this window open. It takes a few seconds.</p>
            <ol className="dsteps" aria-live="polite">
              {run.labels.map((s, j) => (
                <li key={s} className={cx(j < run.step && 'done', j === run.step && 'active')} aria-current={j === run.step ? 'step' : undefined}>
                  <span className="ds-ic" aria-hidden="true">
                    {j < run.step && <CheckIcon />}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </>
        )}
        {run?.address && (
          <div className="success">
            <div className="burst">
              <DropIcon />
            </div>
            <h3>Your pool is live</h3>
            <p>
              {run.pair} is open for trading on {run.venue}. Share the pool address so people can find it.
            </p>
            <div className="addr" style={{ marginBottom: 22, textAlign: 'left' }}>
              Pool<code>{run.address}</code>
              <button className="icon-btn" onClick={() => copyText(run.address!)} aria-label="Copy pool address">
                <CopyIcon />
              </button>
            </div>
            <div className="cta">
              <Button onClick={viewPool}>View pool</Button>
              <Button variant="glass" onClick={another}>
                Create another
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
