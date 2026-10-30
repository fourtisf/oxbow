'use client';

import { useT } from '@/i18n/client';
import { useWallets } from '@/lib/api/queries';
import { useFollow } from '@/lib/store/follow';
import { Feed } from '../feed/Feed';
import { CloseIcon } from '../ui/Icons';
import { WalletTag } from '../ui/WalletTag';
import { FollowControls } from '../wallet/WalletView';
import { AddWallet } from '../wallets/AddWallet';

export function FollowingView() {
  const t = useT();
  const { list, loaded, unfollow } = useFollow();
  // Featured wallets carry a public label; the leaderboard has it.
  const { data: board = [] } = useWallets();
  const known = new Map(board.map((w) => [w.address, w]));
  return (
    <div className="wgrid">
      <div className="wcol">
        <section className="card" aria-labelledby="fl-h">
          <div className="hd">
            <h2 id="fl-h">{t.following.title}</h2>
            <span className="lnk mono">{list.length}</span>
          </div>
          <div className="pad">
            <AddWallet />
          </div>
          {loaded && !list.length ? (
            <div className="feed-empty big">
              <p>
                <b>{t.following.empty}</b>
              </p>
              <p>{t.following.emptyBody}</p>
            </div>
          ) : (
            <ul className="flist">
              {list.map((f) => (
                <li key={f.address}>
                  <WalletTag address={f.address} label={known.get(f.address)?.label} featured={known.get(f.address)?.featured} />
                  <FollowControls address={f.address} label={known.get(f.address)?.label ?? null} />
                  <button type="button" className="icon-btn sm" aria-label={`${t.following.remove} ${f.address}`} onClick={() => unfollow(f.address)}>
                    <CloseIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="fine pad">{t.following.alertsHelp}</p>
        </section>
      </div>
      <Feed initialScope="following" scopes={false} title={t.feed.following} />
    </div>
  );
}
