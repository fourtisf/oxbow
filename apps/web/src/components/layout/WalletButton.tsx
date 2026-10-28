'use client';

import { shortAddr } from '@oxbow/shared';
import { useWallet, WALLETS } from '@/lib/store/wallet';
import { copyText } from '@/lib/copy';
import { CloseIcon } from '../ui/Icons';
import { Modal } from '../ui/overlay';
import { Button } from '../ui/primitives';

export function WalletButton() {
  const { wallet, open } = useWallet();
  if (wallet)
    return (
      <Button variant="glass" style={{ height: 46 }} onClick={() => open()}>
        <span className="live" aria-hidden="true" />
        <span className="mono">{shortAddr(wallet.address)}</span>
      </Button>
    );
  return (
    <Button style={{ height: 46 }} onClick={() => open()}>
      Select Wallet
    </Button>
  );
}

/** "Select wallet" and connected-account dialogs. */
export function WalletModal() {
  const { wallet, modal, connecting, close, connect, disconnect } = useWallet();
  const account = modal === 'account' && wallet;
  return (
    <Modal open={!!modal} onClose={close} label={account ? 'Wallet' : 'Select wallet'} busy={!!connecting}>
      {account ? (
        <>
          <div className="m-h">
            <h3>{wallet.name}</h3>
            <button className="icon-btn" onClick={close} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          <p className="m-sub">
            Connected as{' '}
            <b className="mono" style={{ color: 'var(--text)' }}>
              {shortAddr(wallet.address)}
            </b>
          </p>
          <div className="cta" style={{ marginTop: 0 }}>
            <Button variant="glass" size="sm" onClick={() => copyText(wallet.address)}>
              Copy address
            </Button>
            <Button variant="glass" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="m-h">
            <h3>Select wallet</h3>
            <button className="icon-btn" onClick={close} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          <p className="m-sub">Oxbow never holds your funds. You approve every transaction in your own wallet.</p>
          <div className="wlist">
            {WALLETS.map((w) => (
              <button key={w.name} className="witem" onClick={() => connect(w.name)} aria-busy={connecting === w.name}>
                <span className="wlogo" style={{ background: w.bg }} aria-hidden="true">
                  {w.name[0]}
                </span>
                <b>{w.name}</b>
                <small>{connecting === w.name ? <span className="spin" aria-label="Connecting" /> : 'Detected'}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
