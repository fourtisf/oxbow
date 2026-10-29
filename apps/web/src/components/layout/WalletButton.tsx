'use client';

import { useEffect, useState } from 'react';
import { shortAddr } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { track } from '@/lib/analytics';
import { copyText } from '@/lib/copy';
import { toast } from '@/lib/store/toast';
import { SAMPLE_DATA } from '@/lib/api/mode';
import { acceptTerms, termsAccepted, useWallet } from '@/lib/store/wallet';
import { useInstalledWallets, WALLETS } from '@/lib/wallets';
import { CloseIcon, ExternalIcon } from '../ui/Icons';
import { Modal } from '../ui/overlay';
import { Button, cx } from '../ui/primitives';

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
  const installed = useInstalledWallets();
  // Installed wallets first, the rest in list order.
  const list = [...WALLETS].sort((a, b) => Number(installed.has(b.name)) - Number(installed.has(a.name)));

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
          {SAMPLE_DATA && <p className="fine wdemo">{t.wallet.demoNote}</p>}
          <div className="wlist" aria-disabled={gated || undefined}>
            {list.map((w) => (
              <div key={w.name} className={cx('witem', gated && 'off')}>
                <button className="wpick" onClick={() => pick(w.name)} aria-busy={connecting === w.name} disabled={gated}>
                  <span className={cx('wlogo', w.tile && 'pad')} style={w.tile ? { background: w.tile } : undefined} aria-hidden="true">
                    <img src={w.icon} alt="" width={40} height={40} />
                  </span>
                  <b>{w.name}</b>
                  {connecting === w.name && <span className="spin" aria-label={t.wallet.connecting} />}
                </button>
                {installed.has(w.name) ? (
                  <small className="wstate">{t.wallet.detected}</small>
                ) : w.hardware ? (
                  <small className="wstate hw">{t.wallet.hardware}</small>
                ) : (
                  <a className="wget" href={w.url} target="_blank" rel="noopener noreferrer" aria-label={t.wallet.installAria(w.name)}>
                    {t.wallet.install} <ExternalIcon />
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
