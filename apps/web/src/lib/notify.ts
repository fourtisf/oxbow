'use client';

/** Browser notifications for followed wallets' trades (while a tab is open). */
export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function permission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Asks once; resolves with the answer. */
export async function askPermission(): Promise<NotifyPermission> {
  if (permission() === 'unsupported') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function show(title: string, body: string, url: string, tag: string) {
  if (permission() !== 'granted') return;
  try {
    const n = new Notification(title, { body, tag, icon: '/icon.svg' });
    n.onclick = () => {
      window.focus();
      window.location.assign(url);
      n.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; skip quietly.
  }
}
