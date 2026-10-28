'use client';

import { useEffect, useState } from 'react';
import { shortAddr } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { track } from '@/lib/analytics';
import { copyText } from '@/lib/copy';
import { toast } from '@/lib/store/toast';
import { acceptTerms, termsAccepted, useWallet, WALLETS } from '@/lib/store/wallet';
import { CloseIcon } from '../ui/Icons';
import { Modal } from '../ui/overlay';
import { Button } from '../ui/primitives';

export function WalletButton() {
  const { wallet, open } = useWallet();
  const t = useT();
  if (wallet)
    return (
      <Button variant="glass" style={{ height: 46 }} onClick={() => open()}>
        <span className="live" aria-hidden="true" />
        <span className="mono">{shortAddr(wallet.address)}</span>
      </Button>
    );
  return (
    <Button style={{ height: 46 }} onClick={() => open()}>
      {t.nav.selectWallet}
    </Button>
  );
}

/** "Select wallet" (with the one-time terms confirmation) and connected-account dialogs. */
export function WalletModal() {
  const { wallet, modal, connecting, close, connect, disconnect } = useWallet();
  const t = useT();
  const account = modal === 'account' && wallet;
  // Read on render: the dialog only opens in the browser, and this avoids a flash of enabled wallets.
  const accepted = modal !== 'select' || termsAccepted();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (modal === 'select') setChecked(false);
  }, [modal]);

  const pick = async (name: string) => {
    if (!accepted) acceptTerms();
    const w = await connect(name);
    if (w) {
      toast(t.wallet.connected(w.name));
      track('wallet_connected', { wallet: w.name });
    }
  };

  const gated = !accepted && !checked;

  return (
    <Modal open={!!modal} onClose={close} label={account ? t.wallet.connectedAs : t.wallet.select} busy={!!connecting}>
      {account ? (
        <>
          <div className="m-h">
            <h3>{wallet.name}</h3>
            <button className="icon-btn" onClick={close} aria-label={t.common.close}>
              <CloseIcon />
            </button>
          </div>
          <p className="m-sub">
            {t.wallet.connectedAs}{' '}
            <b className="mono" style={{ color: 'var(--text)' }}>
              {shortAddr(wallet.address)}
            </b>
          </p>
          <div className="cta" style={{ marginTop: 0 }}>
            <Button variant="glass" size="sm" onClick={() => copyText(wallet.address, t.common.copied)}>
              {t.wallet.copy}
            </Button>
            <Button
              variant="glass"
              size="sm"
              onClick={() => {
                disconnect();
                toast(t.wallet.disconnected);
              }}
            >
              {t.wallet.disconnect}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="m-h">
            <h3>{t.wallet.select}</h3>
            <button className="icon-btn" onClick={close} aria-label={t.common.close}>
              <CloseIcon />
            </button>
          </div>
          <p className="m-sub">{t.wallet.sub}</p>
          {!accepted && (
            <div className="gate">
              <b>{t.wallet.gateTitle}</b>
              <p>{t.wallet.gateBody}</p>
              <label className="check">
                <input type="checkbox" id="termsOk" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                <span>
                  {t.wallet.gateCheck}{' '}
                  <a href="/terms" target="_blank" rel="noopener">
                    {t.wallet.gateTerms}
                  </a>{' '}
                  {t.wallet.gateAnd}{' '}
                  <a href="/risk" target="_blank" rel="noopener">
                    {t.wallet.gateRisk}
                  </a>
                  .
                </span>
              </label>
            </div>
          )}
          <div className="wlist" aria-disabled={gated || undefined}>
            {WALLETS.map((w) => (
              <button key={w.name} className="witem" onClick={() => pick(w.name)} aria-busy={connecting === w.name} disabled={gated}>
                <span className="wlogo" style={{ background: w.bg }} aria-hidden="true">
                  {w.name[0]}
                </span>
                <b>{w.name}</b>
                <small>{connecting === w.name ? <span className="spin" aria-label={t.wallet.connecting} /> : t.wallet.detected}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
