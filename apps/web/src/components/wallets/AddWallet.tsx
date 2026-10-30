'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { isAddress } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { track } from '@/lib/analytics';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api/http';
import { walletHref } from '@/lib/links';
import { useFollow } from '@/lib/store/follow';
import { toast } from '@/lib/store/toast';
import { SearchIcon } from '../ui/Icons';
import { cx } from '../ui/primitives';

type ErrKey = keyof ReturnType<typeof useT>['add']['errors'];

/** "Paste a wallet" box: starts tracking it, follows it, and opens its page. */
export function AddWallet({ big, autoFocus }: { big?: boolean; autoFocus?: boolean }) {
  const t = useT();
  const router = useRouter();
  const follow = useFollow((s) => s.follow);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ErrKey | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = value.trim();
    if (!isAddress(address)) {
      setErr('invalid');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await api.addWallet(address);
      follow(address);
      toast(r.created ? t.add.added : t.add.already);
      track('wallet_tracked', { created: r.created });
      setValue('');
      router.push(walletHref(address));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'failed';
      setErr(code in t.add.errors ? (code as ErrKey) : 'failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={cx('addw', big && 'big')} onSubmit={submit} noValidate>
      <label className={cx('field', err && 'bad')}>
        <SearchIcon size={18} />
        <span className="sr-only">{t.add.label}</span>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setErr(null);
          }}
          placeholder={t.add.placeholder}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoFocus={autoFocus}
          aria-invalid={!!err}
          aria-describedby={err ? 'addw-err' : undefined}
        />
        <button type="submit" className="btn btn-pri btn-sm" disabled={busy || !value.trim()}>
          {busy ? <span className="spin" /> : t.add.button}
        </button>
      </label>
      {err && (
        <p className="err" id="addw-err" role="alert">
          {t.add.errors[err]}
        </p>
      )}
    </form>
  );
}
