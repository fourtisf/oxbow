'use client';

import { currentT } from '@/i18n/client';
import { toast } from './store/toast';

/** Copy to the clipboard with the prototype's "Address copied" toast. */
export async function copyText(v: string, msg = currentT().common.copied) {
  try {
    await navigator.clipboard.writeText(v);
  } catch {
    // Clipboard can be blocked (insecure context, permissions). The prototype toasts either way.
  }
  toast(msg);
}
