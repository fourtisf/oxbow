'use client';

/**
 * Browser error reporting. With NEXT_PUBLIC_SENTRY_DSN set, Sentry is loaded
 * as a separate chunk on first use; without it nothing extra is downloaded
 * and errors only go to the console. Server-side errors are wired in
 * `instrumentation.ts`.
 */
type SentryLike = { captureException(e: unknown, ctx?: { extra?: Record<string, unknown> }): void };

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
let sentry: Promise<SentryLike | null> | null = null;

export function initMonitoring(): Promise<SentryLike | null> {
  if (!DSN) return Promise.resolve(null);
  if (!sentry) {
    sentry = import('@sentry/nextjs')
      .then((S) => {
        S.init({
          dsn: DSN,
          environment: process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet',
          tracesSampleRate: 0,
        });
        return S as SentryLike;
      })
      .catch(() => null);
  }
  return sentry;
}

export function reportError(e: unknown, extra?: Record<string, unknown>) {
  console.error(e);
  void initMonitoring().then((s) => s?.captureException(e, extra ? { extra } : undefined));
}
