'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n/client';
import { track } from '@/lib/analytics';
import { invalidateAfterTx, useQuotes } from '@/lib/api/queries';
import { usd } from '@oxbow/shared';
import { chain } from '@/lib/chain';
import { ChainError, CREATE_STEPS } from '@/lib/chain/types';
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
  const t = useT();
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
    if (!m.createReady || !wallet || m.msg || !m.token || !m.quote || run) return;
    const lp = m.lp;
    const labels = [
      t.create.stepVerify(m.quote.symbol),
      t.create.stepApprove(wallet.name),
      t.create.stepCreate(m.costs.venueLabel),
      lp.status === 'BURNED' ? t.create.stepBurn : lp.status === 'UNLOCKED' ? t.create.stepSkip : t.create.stepLock(lp.lockedPct),
      t.create.stepPublish,
    ];
    track('pool_create_started', { venue: form.venue, quote: m.quote.symbol, lock: lp.status });
    const base = { labels, pair: `${m.token.symbol}/${m.quote.symbol}`, venue: m.costs.venueLabel, address: null };
    setRun({ ...base, step: 0 });
    try {
      const { address, lockSkipped } = await chain.createPool(
        wallet.address,
        { token: m.token, quote: m.quote, baseAmount: m.b, quoteAmount: m.qa, venue: form.venue, feeBps: form.feeBps, lock: m.lock },
        (step) => setRun((r) => r && { ...r, step }),
      );
      await invalidateAfterTx(qc);
      track('pool_created', { venue: form.venue });
      setRun((r) => r && { ...r, step: CREATE_STEPS.length, address });
      if (lockSkipped) toast(t.create.lockSkipped);
    } catch (e) {
      setRun(null);
      toast(failMessage(e));
    }
  };

  /** What went wrong, in words, for the errors the wallet or the server's checks give. */
  const failMessage = (e: unknown): string => {
    if (!(e instanceof ChainError)) return t.create.failed;
    const d = e.details;
    switch (e.code) {
      case 'REJECTED':
        return t.create.err.rejected;
      case 'CANT_SIGN':
        return t.create.err.cantSign;
      case 'INSUFFICIENT_SOL':
        return t.create.err.insufficientSol(typeof d.needSol === 'number' ? d.needSol.toFixed(2) : '?');
      case 'INSUFFICIENT_TOKEN':
        return t.create.err.insufficientToken;
      case 'POOL_EXISTS':
        return t.create.err.poolExists;
      case 'MIN_LIQUIDITY':
        return t.create.err.minLiquidity(usd(typeof d.minUsd === 'number' ? d.minUsd : 0));
      case 'SIMULATION':
        return t.create.err.simulation;
      case 'TIMEOUT':
        return t.create.err.timeout;
      case 'TX_FAILED':
        return t.create.err.txFailed;
      default:
        return t.create.failed;
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
      <Modal open={!!run} onClose={another} label={run?.address ? t.create.dialogDone : t.create.dialogCreating} busy={busy}>
        {run && !run.address && (
          <>
            <div className="m-h">
              <h3>{t.create.creating(run.pair)}</h3>
            </div>
            <p className="m-sub">{t.create.keepOpen}</p>
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
            <h3>{t.create.live}</h3>
            <p>{t.create.liveBody(run.pair, run.venue)}</p>
            <div className="addr" style={{ marginBottom: 22, textAlign: 'left' }}>
              {t.pool.poolLabel}
              <code>{run.address}</code>
              <button className="icon-btn" onClick={() => copyText(run.address!, t.common.copied)} aria-label={t.pool.copyPool}>
                <CopyIcon />
              </button>
            </div>
            <div className="cta">
              <Button onClick={viewPool}>{t.create.viewPool}</Button>
              <Button variant="glass" onClick={another}>
                {t.create.another}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
