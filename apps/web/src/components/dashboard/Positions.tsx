'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { amt, feePct, fmtDate, pct, usd, venueInfo, type Position } from '@oxbow/shared';
import { invalidateAfterTx, usePositions } from '@/lib/api/queries';
import { chain } from '@/lib/chain/mock';
import { poolHref } from '@/lib/nav';
import { toast } from '@/lib/store/toast';
import { useWallet } from '@/lib/store/wallet';
import { BarsIcon, DropIcon, LiquidIcon, TrendIcon, WalletIcon } from '../ui/Icons';
import { PairAvatar } from '../ui/TokenAvatar';
import { Button, ButtonLink, Fmt } from '../ui/primitives';

function lockNote(x: Position): string {
  if (x.lock.status === 'UNLOCKED') return 'Withdraw any time';
  if (x.lock.status === 'BURNED') return 'Burned';
  return x.lock.unlockAt ? 'Unlocks ' + fmtDate(x.lock.unlockAt) : 'Locked';
}

function Empty({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="sr-only">Positions</h2>
      <div className="empty">
        <div className="ring">{icon}</div>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="cta">{children}</div>
      </div>
    </div>
  );
}

/** Dashboard body: wallet positions, fees to claim, manage and withdraw. */
export function Positions() {
  const { wallet, open } = useWallet();
  const qc = useQueryClient();
  const { data: list, isLoading } = usePositions(wallet?.address);
  const [busy, setBusy] = useState<string | null>(null);

  if (!wallet)
    return (
      <Empty icon={<WalletIcon />} title="Select a wallet to see your positions" body="Pools you've added liquidity to show up here, with the fees each one has earned.">
        <Button onClick={() => open()}>Select Wallet</Button>
      </Empty>
    );
  if (isLoading || !list)
    return (
      <div className="card">
        <div className="state">
          <span className="spin" aria-label="Loading positions" />
        </div>
      </div>
    );
  if (!list.length)
    return (
      <Empty icon={<DropIcon />} title="No positions yet" body="Create a pool for your own token, or add liquidity to one in Explore and start earning trading fees.">
        <ButtonLink href="/create">Create a pool</ButtonLink>
        <ButtonLink variant="glass" href="/explore">
          Explore markets
        </ButtonLink>
      </Empty>
    );

  const tv = list.reduce((s, x) => s + x.valueUsd, 0);
  const te = list.reduce((s, x) => s + x.unclaimedFeesUsd, 0);
  const created = list.filter((x) => x.isCreator).length;

  const act = async (id: string, fn: () => Promise<string>) => {
    setBusy(id);
    try {
      toast(await fn());
      await invalidateAfterTx(qc);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };
  const claim = (x: Position) =>
    act('c' + x.id, async () => {
      const { amountUsd } = await chain.claimFees(wallet.address, x.id);
      return `Claimed ${usd(amountUsd)} in fees`;
    });
  const withdraw = (x: Position) =>
    act('w' + x.id, async () => {
      await chain.withdraw(wallet.address, x.id);
      return `Withdrew your liquidity from ${x.pool.base.symbol}/${x.pool.quote.symbol}`;
    });

  return (
    <>
      <div className="dsum">
        <div className="card stat">
          <div className="top">
            <span className="label">Your liquidity</span>
            <span className="ic">
              <LiquidIcon />
            </span>
          </div>
          <div className="val">
            <Fmt>{usd(tv)}</Fmt>
          </div>
          <div className="sub">across {list.length} pools</div>
        </div>
        <div className="card stat">
          <div className="top">
            <span className="label">Fees to claim</span>
            <span className="ic" style={{ color: 'var(--up)' }}>
              <TrendIcon />
            </span>
          </div>
          <div className="val up">
            <Fmt>{usd(te)}</Fmt>
          </div>
          <div className="sub">paid in each pool&apos;s tokens</div>
        </div>
        <div className="card stat">
          <div className="top">
            <span className="label">Pools you created</span>
            <span className="ic">
              <BarsIcon />
            </span>
          </div>
          <div className="val">{created}</div>
          <div className="sub">this wallet</div>
        </div>
      </div>
      <div className="card">
        <div className="hd">
          <h2>Positions</h2>
        </div>
        <div className="prow head" aria-hidden="true">
          <div>Pool</div>
          <div>Your share</div>
          <div>Value</div>
          <div>Fees to claim</div>
          <div />
        </div>
        {list.map((x) => {
          const p = x.pool;
          return (
            <div className="prow" key={x.id}>
              <div>
                <div className="pair">
                  <PairAvatar base={p.base} quote={p.quote} size={32} />
                  <div>
                    <b>
                      {p.base.symbol}/{p.quote.symbol}
                    </b>
                    <small>
                      {venueInfo(p.venue).label}, {feePct(p.feeBps)} fee
                    </small>
                  </div>
                </div>
              </div>
              <div>
                {pct(x.share * 100)}
                <small>of the pool</small>
              </div>
              <div>
                <Fmt>{usd(x.valueUsd)}</Fmt>
                <small>
                  {amt(x.baseAmount)} {p.base.symbol}
                </small>
              </div>
              <div className="up">
                <Fmt>{usd(x.unclaimedFeesUsd)}</Fmt>
                <small suppressHydrationWarning>{lockNote(x)}</small>
              </div>
              <div className="acts">
                <Button onClick={() => claim(x)} disabled={!(x.unclaimedFeesUsd > 0) || busy === 'c' + x.id}>
                  Claim fees
                </Button>
                <ButtonLink variant="glass" href={poolHref(p.address, 'add')} scroll={false}>
                  Manage
                </ButtonLink>
                {x.lock.status === 'UNLOCKED' && (
                  <Button variant="glass" onClick={() => withdraw(x)} disabled={busy === 'w' + x.id}>
                    Withdraw
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
